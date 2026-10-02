# Setup — Piper TTS no VPS (Fase 3)

> Execute este guia quando chegar na Fase 3 do desenvolvimento.
> Pré-requisito: Fases 1 e 2 funcionando localmente.

---

## O que você vai fazer

1. Gerar o `PIPER_VPS_SECRET` e atualizar o `.env.local`
2. Subir o servidor Piper no seu VPS via Docker
3. Configurar o firewall do VPS
4. Testar a conexão
5. Atualizar as variáveis no Vercel (se já tiver em produção)

---

## Passo 1 — Gerar o PIPER_VPS_SECRET

Rode no terminal (qualquer máquina):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado. Vai ser algo como:
```
a3f8c2d1e4b5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

Agora atualize seu `.env.local`:
```env
PIPER_VPS_URL=http://<ip-do-seu-vps>:8000
PIPER_VPS_SECRET=a3f8c2d1e4b5...  # o valor gerado acima
```

Substitua `<ip-do-seu-vps>` pelo IP público do seu VPS.

---

## Passo 2 — Subir o Piper no VPS

Conecte no seu VPS via SSH e rode:

```bash
# Cria a pasta do projeto
mkdir -p ~/earcast-piper && cd ~/earcast-piper

# Baixa o modelo de voz (en_US-lessac-medium — boa qualidade)
mkdir -p models
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx -O models/en_US-lessac-medium.onnx
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json -O models/en_US-lessac-medium.onnx.json
```

Cria o `Dockerfile`:

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
  wget curl python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Instala Piper
RUN wget -q https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz \
  && tar -xzf piper_linux_x86_64.tar.gz -C /usr/local/bin/ \
  && rm piper_linux_x86_64.tar.gz

WORKDIR /app
COPY requirements.txt .
RUN pip3 install -r requirements.txt --break-system-packages

COPY server.py .
COPY models/ /models/

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

Cria o `requirements.txt`:

```
fastapi==0.111.0
uvicorn==0.30.0
httpx==0.27.0
```

Cria o `server.py`:

```python
import os, subprocess, tempfile, base64, hmac, hashlib, json
import httpx
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

app = FastAPI()

INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
WEBHOOK_URL = os.environ["WEBHOOK_CALLBACK_URL"]

def verify(request: Request):
    secret = request.headers.get("x-internal-secret", "")
    if not hmac.compare_digest(secret, INTERNAL_SECRET):
        raise HTTPException(status_code=401)

class SynthRequest(BaseModel):
    text: str
    job_id: str
    voice: str = "en_US-lessac-medium"

@app.post("/synthesize")
async def synthesize(req: SynthRequest, request: Request):
    verify(request)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    subprocess.run([
        "/usr/local/bin/piper/piper",
        "--model", f"/models/{req.voice}.onnx",
        "--output_file", wav_path,
    ], input=req.text, capture_output=True, text=True, check=True)
    mp3_path = wav_path.replace(".wav", ".mp3")
    subprocess.run(["ffmpeg", "-i", wav_path, "-q:a", "2", mp3_path, "-y"], check=True)
    with open(mp3_path, "rb") as f:
        mp3_b64 = base64.b64encode(f.read()).decode()
    payload = {"job_id": req.job_id, "audio_b64": mp3_b64, "word_timestamps": []}
    sig = hmac.new(INTERNAL_SECRET.encode(), json.dumps(payload).encode(), hashlib.sha256).hexdigest()
    async with httpx.AsyncClient() as client:
        await client.post(WEBHOOK_URL, json=payload, headers={"x-webhook-signature": sig}, timeout=30.0)
    return {"status": "ok"}
```

Agora sobe com Docker:

```bash
# Builda a imagem
docker build -t earcast-piper .

# Roda o container
docker run -d \
  --name earcast-piper \
  --restart unless-stopped \
  -p 8000:8000 \
  -e INTERNAL_SECRET="<seu PIPER_VPS_SECRET aqui>" \
  -e WEBHOOK_CALLBACK_URL="https://seu-app.vercel.app/api/webhooks/audio-ready" \
  earcast-piper
```

Verifica se está rodando:
```bash
docker logs earcast-piper
docker ps
```

---

## Passo 3 — Configurar firewall do VPS

O objetivo é que a porta 8000 só aceite conexões de fontes confiáveis.

### Se usar UFW (Ubuntu):
```bash
# Bloqueia a porta 8000 para o mundo
ufw deny 8000

# Libera só para o IP do Vercel (lista em vercel.com/docs/edge-network/regions)
# Na prática, libere para qualquer IP por enquanto e use só o secret como proteção
# Quando tiver o IP fixo do Vercel, restrinja aqui
ufw allow from any to any port 8000
```

A segurança real vem do `INTERNAL_SECRET` validado no servidor — o firewall é uma camada extra.

---

## Passo 4 — Testar a conexão

Do seu computador local (com o `.env.local` preenchido), rode:

```bash
curl -X POST http://<ip-do-seu-vps>:8000/synthesize \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: <seu PIPER_VPS_SECRET>" \
  -d '{"text": "Hello, this is a test.", "job_id": "test-123"}'
```

Se retornar `{"status": "ok"}` o Piper está funcionando.

---

## Passo 5 — Atualizar variáveis no Vercel

Se já tiver feito o deploy na Vercel:

1. Acesse [vercel.com](https://vercel.com) → seu projeto → **Settings → Environment Variables**
2. Adicione/atualize:
   - `PIPER_VPS_URL` = `http://<ip-do-seu-vps>:8000`
   - `PIPER_VPS_SECRET` = o secret gerado no Passo 1
3. Faça um novo deploy para as variáveis entrarem em vigor

---

## Vozes disponíveis (opcional)

Para baixar vozes adicionais no VPS:

```bash
cd ~/earcast-piper/models

# Voz feminina americana
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/jenny/dioco/en_US-jenny-dioco.onnx
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/jenny/dioco/en_US-jenny-dioco.onnx.json

# Voz masculina alta qualidade
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx
wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json
```

Depois reconstrua a imagem Docker:
```bash
docker stop earcast-piper && docker rm earcast-piper
docker build -t earcast-piper .
docker run -d --name earcast-piper --restart unless-stopped \
  -p 8000:8000 \
  -e INTERNAL_SECRET="<secret>" \
  -e WEBHOOK_CALLBACK_URL="https://seu-app.vercel.app/api/webhooks/audio-ready" \
  earcast-piper
```
