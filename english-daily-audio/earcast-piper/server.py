import os
import subprocess
import tempfile
import base64
import hmac
import hashlib
import json
import logging

import httpx
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
WEBHOOK_URL = os.environ["WEBHOOK_CALLBACK_URL"]
PIPER_BIN = "/usr/local/bin/piper/piper"


# ─── Auth ────────────────────────────────────────────────────────────────────

def verify_secret(request: Request):
    incoming = request.headers.get("x-internal-secret", "")
    if not hmac.compare_digest(incoming, INTERNAL_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ─── Models ──────────────────────────────────────────────────────────────────

class SynthesizeRequest(BaseModel):
    text: str
    job_id: str
    voice: str = "en_US-lessac-medium"


# ─── Core synthesis ──────────────────────────────────────────────────────────

def run_synthesis(req: SynthesizeRequest):
    """Sintetiza o áudio e envia o callback de forma síncrona.
    Retorna após o callback ser enviado com sucesso.
    Lança exceção se qualquer etapa falhar.
    """
    wav_path = None
    mp3_path = None

    try:
        # Cria arquivos temporários
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            wav_path = f.name
        mp3_path = wav_path.replace(".wav", ".mp3")

        model_path = f"/models/{req.voice}.onnx"
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found: {model_path}")

        # Gera WAV com Piper via --json-input para capturar word timestamps no stderr
        proc = subprocess.run(
            [PIPER_BIN, "--model", model_path, "--output_file", wav_path, "--json-input"],
            input=json.dumps({"text": req.text}),
            capture_output=True,
            text=True,
        )

        if proc.returncode != 0:
            raise RuntimeError(f"Piper failed: {proc.stderr}")

        logger.info(f"Piper stderr (first 500): {proc.stderr[:500]!r}")
        logger.info(f"Piper stdout (first 200): {proc.stdout[:200]!r}")

        # Extrai timestamps do stderr (JSON lines com type=="word")
        word_timestamps = []
        for line in proc.stderr.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if obj.get("type") == "word":
                    word_timestamps.append({
                        "word": obj["value"],
                        "start_ms": int(obj["audio_seconds"] * 1000),
                        "end_ms": int(obj.get("audio_seconds_end", obj["audio_seconds"] + 0.3) * 1000),
                    })
            except (json.JSONDecodeError, KeyError):
                continue

        # Converte WAV → MP3 com ffmpeg
        subprocess.run(
            ["ffmpeg", "-i", wav_path, "-q:a", "2", "-y", mp3_path],
            capture_output=True,
            check=True,
        )

        with open(mp3_path, "rb") as f:
            mp3_b64 = base64.b64encode(f.read()).decode()

        # Fallback: se Piper não emitiu timestamps, estimar com base na duração do áudio
        if not word_timestamps:
            probe = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", wav_path],
                capture_output=True,
                text=True,
            )
            try:
                duration_s = float(json.loads(probe.stdout)["format"]["duration"])
                words = req.text.split()
                ms_per_word = (duration_s * 1000) / max(len(words), 1)
                for i, word in enumerate(words):
                    word_timestamps.append({
                        "word": word,
                        "start_ms": int(i * ms_per_word),
                        "end_ms": int((i + 1) * ms_per_word),
                    })
            except Exception:
                pass  # timestamps permanecem vazios — não é fatal

        payload = {
            "job_id": req.job_id,
            "audio_b64": mp3_b64,
            "word_timestamps": word_timestamps,
        }

        send_callback(payload)
        logger.info("job %s done", req.job_id)

    finally:
        for path in [wav_path, mp3_path]:
            if path and os.path.exists(path):
                os.unlink(path)


def send_callback(payload: dict):
    body = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(
        INTERNAL_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()

    with httpx.Client() as client:
        resp = client.post(
            WEBHOOK_URL,
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-webhook-signature": sig,
            },
            timeout=30.0,
        )
        resp.raise_for_status()


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthesize", status_code=200)
def synthesize(req: SynthesizeRequest, request: Request):
    verify_secret(request)

    try:
        run_synthesis(req)
    except Exception as e:
        logger.error("job %s failed: %s", req.job_id, e)
        # Notifica o Next.js do erro para que o job seja marcado como 'error'
        try:
            send_callback({"job_id": req.job_id, "error": str(e)})
        except Exception as cb_err:
            logger.error("callback also failed for job %s: %s", req.job_id, cb_err)

    return {"status": "done"}
