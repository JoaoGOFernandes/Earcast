# Arquitetura — Earcast

## Visão geral

```
Browser (Next.js client)
    ↓ fetch / Server Actions
Next.js API Routes — BFF (Vercel)
    ↓                    ↓                    ↓
Gemini API          Supabase            Piper VPS
(LLM)           (DB + Storage)        (TTS Docker)
                      ↓
               Supabase Edge Function
               (process-audio-job)
                      ↓
               Piper VPS callback
```

---

## Decisões técnicas

### Por que Next.js App Router?
- Server Actions eliminam boilerplate de API para operações simples
- Server Components reduzem JS enviado ao cliente
- Stack já conhecida (AutoViral usa Next.js 14)

### Por que Gemini API?
- Gratuito no free tier (15 RPM, 1M tokens/dia — mais que suficiente para uso pessoal)
- `gemini-1.5-flash` é rápido e capaz para geração de texto e análise de vocabulário
- Já possui conta Google AI Studio configurada
- Sem custo adicional para o volume de uso esperado (1-5 usuários)

### Por que Supabase como "backend"?
- Auth, banco, storage e Edge Functions num único serviço
- pg_cron nativo para rotina diária sem serviço externo
- RLS elimina a necessidade de camada de autorização na aplicação
- Free tier aguenta uso pessoal com folga

### Por que Piper TTS no VPS próprio?
- Qualidade excelente (vozes neurais da Mozilla)
- 100% gratuito, sem limite de requisições
- Offline — sem dependência de terceiros
- Gera timestamps por palavra nativamente (necessário para sincronização no player)
- edge-tts (alternativa) depende de scraping da Microsoft — pode quebrar
- Coqui TTS (alternativa premium) requer GPU — overkill para este uso

### Por que áudios destrutivos?
- Reduz custo de Storage (free tier do Supabase tem 1GB)
- Simplifica o modelo mental — sempre existe "o áudio de hoje"
- Textos e traduções são sempre preservados no banco

---

## Segurança

### Princípio central: Browser nunca fala com serviços externos

```
❌ Browser → Gemini API          (expõe chave de API)
❌ Browser → Piper VPS           (expõe endpoint interno)
❌ Browser → Storage URL pública (acesso sem autenticação)

✅ Browser → Next.js API Route → Gemini API
✅ Browser → Next.js API Route → Piper VPS
✅ Browser → Next.js API Route → Supabase Storage (Signed URL)
```

### Padrões implementados

**1. BFF (Backend for Frontend)**
Todas as rotas em `/src/app/api/` são o único ponto de saída do browser.
Nenhum SDK de terceiro é importado em código client-side.

**2. Row Level Security (RLS)**
Todas as tabelas têm RLS ativo. Políticas padrão:

```sql
-- Usuário só vê seus próprios dados
create policy "users see own data" on texts
  for all using (auth.uid() = user_id);
```

Nunca filtre por `user_id` na aplicação — deixe o RLS fazer isso.

**3. Variáveis de ambiente tipadas**
```ts
// src/lib/env.ts
import { z } from 'zod'

const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1),
  PIPER_VPS_URL: z.string().url(),
  PIPER_VPS_SECRET: z.string().min(32),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export const env = EnvSchema.parse(process.env)
```

**4. Signed URLs para áudio**
```ts
// Nunca retorne URL pública de Storage
const { data } = await supabase.storage
  .from('audio')
  .createSignedUrl(path, 3600) // expira em 1h
```

**5. Piper VPS protegido**
- Firewall: só aceita requisições do IP do Vercel e da Supabase Edge Function
- Header de autenticação: `X-Internal-Secret: ${PIPER_VPS_SECRET}`
- Não exposto publicamente — sem domínio, só IP + porta interna

**6. Rate limiting nas API Routes**
Máx 10 req/min por usuário em rotas de geração.

**7. Validação de input com Zod**
Todo input do usuário é validado com schema Zod antes de qualquer operação.

**8. Webhook autenticado**
O callback do Piper VPS valida um HMAC antes de processar:
```ts
const signature = req.headers.get('x-webhook-signature')
const isValid = validateHMAC(signature, PIPER_VPS_SECRET, body)
if (!isValid) return new Response('Unauthorized', { status: 401 })
```

---

## Pipeline assíncrono de áudio

### Por que assíncrono?
Piper leva segundos a minutos dependendo do tamanho do texto.
Timeout do Vercel no free tier: 10s — insuficiente para processar síncrono.

### Fluxo

```
1. POST /api/generation/trigger
   → Gera texto via Gemini (síncrono, rápido)
   → Salva generation no banco (status: processing)
   → Insere registro em audio_jobs
   → Retorna { generation_id } imediatamente

2. Supabase Edge Function (trigger em audio_jobs INSERT)
   → POST para Piper VPS: { text, job_id, voice }
   → Piper processa em background

3. Piper VPS conclui
   → POST /api/webhooks/audio-ready
   → Valida HMAC
   → Salva MP3 no Supabase Storage
   → Atualiza generation.status = 'ready'

4. Frontend polling a cada 5s (ou Supabase Realtime)
   → Detecta status 'ready'
   → Player aparece automaticamente
```

### Retry logic
- `audio_jobs.attempts` incrementado a cada tentativa
- Máx 3 tentativas com backoff exponencial (1min, 5min, 15min)
- Após 3 falhas: status = 'error', usuário pode retentar manualmente

---

## Deploy

| Serviço | O que roda | Tier |
|---|---|---|
| Vercel | Next.js | Free (Hobby) |
| Supabase | Postgres + Storage + Auth + Edge Functions | Free |
| VPS próprio | Piper TTS em Docker | Já pago |

### Variáveis de ambiente no Vercel
```
GOOGLE_API_KEY=
PIPER_VPS_URL=
PIPER_VPS_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Convenções de nomenclatura

| Tipo | Padrão | Exemplo |
|---|---|---|
| Componente | PascalCase | `PlaylistCard.tsx` |
| Hook | camelCase com `use` | `usePlayer.ts` |
| Server Action | camelCase verbo | `createText.ts` |
| Query | camelCase `get`/`list` | `getUserTexts.ts` |
| Tipo de domínio | PascalCase | `type Playlist` |
| Constante | SCREAMING_SNAKE | `DEFAULT_RELEVANCE_THRESHOLD` |
| Tabela SQL | snake_case plural | `word_reviews` |
| Edge Function | kebab-case | `process-audio-job` |
