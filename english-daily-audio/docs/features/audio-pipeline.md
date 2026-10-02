# Feature: Audio Pipeline (Piper TTS)

## Visão geral

Pipeline assíncrono que transforma texto em MP3 com timestamps por palavra,
necessários para sincronização no player (highlight em tempo real).

---

## Piper TTS no VPS

### Setup Docker

```dockerfile
# Dockerfile no VPS
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
  wget curl python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Instala Piper
RUN wget -q https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz \
  && tar -xzf piper_linux_x86_64.tar.gz \
  && mv piper /usr/local/bin/

# Instala vozes (baixar as desejadas)
# en_US-lessac-medium: boa qualidade, voz masculina natural
# en_US-jenny-dioco: voz feminina
RUN mkdir -p /models
WORKDIR /models

# Servidor FastAPI
WORKDIR /app
COPY requirements.txt .
RUN pip3 install -r requirements.txt

COPY server.py .
EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

```
# requirements.txt
fastapi==0.111.0
uvicorn==0.30.0
httpx==0.27.0
```

### Servidor FastAPI (server.py)

```python
import os
import subprocess
import tempfile
import base64
import hmac
import hashlib
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

app = FastAPI()

INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
WEBHOOK_CALLBACK_URL = os.environ["WEBHOOK_CALLBACK_URL"]  # URL do Next.js

def verify_secret(request: Request):
    secret = request.headers.get("x-internal-secret")
    if not hmac.compare_digest(secret or "", INTERNAL_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")

class SynthesizeRequest(BaseModel):
    text: str
    job_id: str
    voice: str = "en_US-lessac-medium"

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest, request: Request):
    verify_secret(request)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
        wav_path = wav_file.name

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as json_file:
        json_path = json_file.name

    # Piper gera WAV + arquivo de timestamps
    proc = subprocess.run([
        "piper",
        "--model", f"/models/{req.voice}.onnx",
        "--output_file", wav_path,
        "--output_raw",  # para timestamps
        "--json-input",
    ], input=json.dumps({"text": req.text}), capture_output=True, text=True)

    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr)

    # Converte WAV para MP3 via ffmpeg
    mp3_path = wav_path.replace(".wav", ".mp3")
    subprocess.run(["ffmpeg", "-i", wav_path, "-q:a", "2", mp3_path], check=True)

    with open(mp3_path, "rb") as f:
        mp3_b64 = base64.b64encode(f.read()).decode()

    # Callback para o Next.js
    payload = {
        "job_id": req.job_id,
        "audio_b64": mp3_b64,
        "word_timestamps": [],  # parse do output do Piper
    }

    sig = hmac.new(
        INTERNAL_SECRET.encode(),
        json.dumps(payload).encode(),
        hashlib.sha256
    ).hexdigest()

    async with httpx.AsyncClient() as client:
        await client.post(
            WEBHOOK_CALLBACK_URL,
            json=payload,
            headers={"x-webhook-signature": sig},
            timeout=30.0
        )

    return {"status": "processing"}
```

---

## Edge Function — process-audio-job

```ts
// supabase/functions/process-audio-job/index.ts
// Disparada por trigger INSERT em audio_jobs

import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { record } = await req.json()  // audio_jobs row

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Busca o texto da generation
  const { data: generation } = await supabase
    .from('generations')
    .select('text_en, id')
    .eq('id', record.generation_id)
    .single()

  // Busca config da playlist para saber a voz
  const { data: config } = await supabase
    .from('playlist_configs')
    .select('voice')
    .eq('playlist_id', generation.playlist_id)
    .single()

  // POST para o Piper VPS
  const response = await fetch(Deno.env.get('PIPER_VPS_URL') + '/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': Deno.env.get('PIPER_VPS_SECRET')!,
    },
    body: JSON.stringify({
      text: generation.text_en,
      job_id: record.id,
      voice: config?.voice ?? 'en_US-lessac-medium',
    }),
  })

  if (!response.ok) {
    // Incrementa tentativas, agenda retry
    await supabase
      .from('audio_jobs')
      .update({
        status: 'error',
        attempts: record.attempts + 1,
        last_error: await response.text(),
        next_retry_at: new Date(Date.now() + Math.pow(5, record.attempts) * 60000),
      })
      .eq('id', record.id)
  }

  return new Response('ok')
})
```

---

## Webhook — audio-ready

```ts
// app/api/webhooks/audio-ready/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-webhook-signature')

  // Valida HMAC
  const expected = crypto
    .createHmac('sha256', env.PIPER_VPS_SECRET)
    .update(body)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(signature ?? ''), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { job_id, audio_b64, word_timestamps } = JSON.parse(body)

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // Busca o job e a generation
  const { data: job } = await supabase
    .from('audio_jobs')
    .select('generation_id')
    .eq('id', job_id)
    .single()

  // Salva MP3 no Storage
  const audioBuffer = Buffer.from(audio_b64, 'base64')
  const storagePath = `${job.generation_id}/audio.mp3`

  await supabase.storage
    .from('audio')
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,  // substitui o anterior (áudios destrutivos)
    })

  // Atualiza generation
  await supabase
    .from('generations')
    .update({
      audio_path: storagePath,
      word_timestamps,
      status: 'ready',
    })
    .eq('id', job.generation_id)

  // Atualiza job
  await supabase
    .from('audio_jobs')
    .update({ status: 'done' })
    .eq('id', job_id)

  return NextResponse.json({ ok: true })
}
```

---

## Timestamps — formato esperado

```ts
// word_timestamps armazenado em generations.word_timestamps
type WordTimestamp = {
  word: string
  start_ms: number
  end_ms: number
}

// Exemplo:
[
  { word: "The",      start_ms: 0,    end_ms: 180  },
  { word: "castle",   start_ms: 200,  end_ms: 520  },
  { word: "stood",    start_ms: 540,  end_ms: 780  },
  ...
]
```

O player usa esses timestamps para sincronizar o highlight com o `currentTime` do elemento `<audio>`.

---

## Vozes disponíveis (Piper)

| ID | Descrição | Qualidade |
|---|---|---|
| `en_US-lessac-medium` | Masculina, americana, natural | ★★★★☆ |
| `en_US-jenny-dioco` | Feminina, americana | ★★★★☆ |
| `en_GB-alan-medium` | Masculina, britânica | ★★★☆☆ |
| `en_US-ryan-high` | Masculina, alta qualidade | ★★★★★ |

Baixar modelos em: https://huggingface.co/rhasspy/piper-voices

---

## Variáveis de ambiente necessárias (VPS)

```env
INTERNAL_SECRET=<32+ chars aleatórios>
WEBHOOK_CALLBACK_URL=https://seu-app.vercel.app/api/webhooks/audio-ready
```
