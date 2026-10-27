# Earcast — CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code em toda sessão.
> Antes de implementar qualquer coisa, leia também os docs referenciados abaixo.

---

## O que é esse projeto

Aplicação web pessoal de aprendizado de inglês baseada no método Mairo Vergara.
O usuário importa textos (contos, artigos) que já estuda, o sistema extrai e filtra
o vocabulário via LLM, e gera diariamente novos áudios em inglês usando esse vocabulário.
O aprendizado é guiado por repetição espaçada (LSR Engine) e consolidação progressiva
de textos dominados.

Usuários esperados: 1 a 5 pessoas (uso pessoal + amigos próximos).

---

## Stack

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (`@base-ui/react`)
- **Backend:** Server Actions + rotas do Next.js (BFF — único ponto de saída para serviços externos)
- **Banco:** Supabase (Postgres + Storage + Auth + pg_cron)
- **TTS:** Google Cloud Text-to-Speech (`src/lib/google-tts.ts` — Neural2 via SSML marks, timestamps por palavra para karaokê)
- **LLM:** Gemini via Vertex AI (`gemini-2.5-flash` via `@google/genai`, `src/lib/gemini.ts`) — chamado APENAS server-side
- **Auth Google Cloud:** ADC do gcloud localmente (`gcloud auth application-default login`);
  na Vercel, service account via `GOOGLE_SERVICE_ACCOUNT_KEY` (`src/lib/google-credentials.ts`)
- **Hospedagem:** Vercel
- **Tipos:** Gerados via `supabase gen types` em `/src/types/supabase.ts`
- **Piper TTS:** fora do fluxo atual — `earcast-piper/` e `/docs/setup/piper-vps.md` ficam só como referência

---

## Regras absolutas — nunca viole sem confirmação explícita

1. **NUNCA** chamar Gemini API, Google Cloud TTS ou qualquer serviço externo do lado do cliente
2. **SEMPRE** usar RLS no Supabase — nunca filtrar por `user_id` na aplicação
3. **SEMPRE** usar os tipos gerados em `/src/types/supabase.ts` — zero `any`
4. **NUNCA** acessar `process.env` diretamente — use `/src/lib/env.ts`
5. **SEMPRE** validar input do usuário com Zod antes de qualquer operação
6. Server Actions só em arquivos marcados com `'use server'`
7. Componentes client-side só quando estritamente necessário (`'use client'`)
8. Áudios do Storage sempre via Signed URLs geradas server-side — nunca URL pública

---

## Estrutura de pastas

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   └── (app)/
│       ├── layout.tsx              # Layout autenticado
│       ├── library/                # Módulo 1 — Textos
│       │   ├── page.tsx
│       │   ├── library-tabs.tsx    # Client: tabs [Texts|Vocabulary] no header
│       │   └── global-vocab-section.tsx  # Async server component: vocab global
│       ├── schedule/               # Módulo 2 — Playlists
│       │   ├── page.tsx
│       │   └── schedule-client.tsx # Client: cards, generate, merge/unmerge
│       ├── player/                 # Módulo 3 — Player + marcação
│       ├── vocabulary/             # Módulo 4 — Vocabulário por texto
│       └── history/                # Módulo 5 — Histórico
│
├── api/                            # BFF — todas as chamadas externas
│   ├── texts/
│   ├── vocabulary/
│   │   └── analyze/
│   ├── generation/
│   │   ├── trigger/
│   │   └── daily/
│   ├── audio/
│   │   └── status/
│   └── webhooks/
│       └── audio-ready/
│
├── modules/                        # Lógica de domínio isolada
│   ├── library/
│   │   ├── components/
│   │   ├── actions.ts
│   │   └── queries.ts
│   ├── vocabulary/
│   │   ├── extractor.ts            # Tokenização e limpeza
│   │   ├── relevance-scorer.ts     # Análise de relevância via Gemini
│   │   └── srs-engine.ts           # Motor SM-2 (LSR Engine)
│   ├── schedule/
│   │   ├── components/
│   │   ├── playlist-manager.ts
│   │   ├── merge-resolver.ts
│   │   └── actions.ts              # Server actions: mergePlaylistsAction, unmergePlaylistAction
│   ├── generation/
│   │   ├── prompt-builder.ts
│   │   ├── translator.ts
│   │   └── actions.ts              # Server action: generateForPlaylist
│   └── audio/                      # (planejado — Piper fora do fluxo atual)
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   └── server.ts               # Server client (cookies)
│   ├── gemini.ts                   # Cliente Gemini (Vertex AI)
│   ├── google-tts.ts               # Cliente Google Cloud TTS
│   ├── google-credentials.ts       # Service account (Vercel) ou undefined → ADC
│   ├── env.ts                      # Zod schema de env vars
│   ├── errors.ts                   # Tipos de erro padronizados
│   └── result.ts                   # Result<T, E> type
│
├── types/
│   └── supabase.ts                 # Gerado por supabase gen types
│
└── supabase/
    ├── migrations/                 # SQL versionado
    └── functions/
        └── process-audio-job/      # Edge Function worker
```

---

## UI / Responsividade

### Princípio: mobile-first
Toda UI deve ser construída mobile-first e escalada para desktop.
- **Base (< 768px):** layout de coluna única, bottom tab bar para navegação principal.
- **`md` (≥ 768px):** sidebar fixa de 224px à esquerda, conteúdo ocupa o restante.
- **`lg` (≥ 1024px):** grids de 3 colunas onde fizer sentido (ex: library cards).

### Estrutura de layout autenticado
```
mobile                        desktop (md+)
┌─────────────────────────┐   ┌──────────┬─────────────────────┐
│ [Earcast]   [Sign out]  │   │ Earcast  │ <page content>      │
│  <page content>         │   │          │                     │
│                         │   │ Library  │                     │
│ [Library][Sched][Player]│   │ Schedule │                     │
└─────────────────────────┘   │          │                     │
  top bar + bottom tab bar    │ Sign out │                     │
                              └──────────┴─────────────────────┘
```

### Regras
- Nunca usar `px-*` fixo em containers raiz — usar `px-4 md:px-8`
- Conteúdo de páginas: `max-w-5xl mx-auto` (ou menor para formulários: `max-w-xl`)
- Cards em grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Bottom nav no mobile tem `fixed bottom-0` — sempre adicionar `pb-24 md:pb-8` no main
- Componentes shadcn/ui + Tailwind v4 — usar `@base-ui/react` (sem `asChild`, usar `render={<Component />}`)

### PDF import
- Extração feita 100% client-side com `pdfjs-dist` (dynamic import)
- Worker carregado via CDN unpkg para evitar problemas de bundling
- O arquivo PDF **nunca** é enviado ao servidor

---

## Padrões de código

### Variáveis de ambiente

Validadas em `src/lib/env.ts` (Zod). Localmente ficam em `.env.local` (ignorado pelo git);
na Vercel, em Project Settings → Environment Variables (Production e Preview).

| Nome | Local | Vercel | Observação |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | ✅ | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Secreta — só server-side |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Exposta ao browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Exposta ao browser (protegida por RLS) |
| `GOOGLE_CLOUD_PROJECT` | ✅ | ✅ | Projeto GCP do Vertex AI e do TTS |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ❌ | ✅ | JSON inteiro da service account (precisa de `client_email` e `private_key`). Localmente deixe vazio — o ADC do gcloud é usado |

A service account precisa dos papéis **Vertex AI User** e acesso à **Cloud Text-to-Speech API**.

### Server Action
```ts
// modules/library/actions.ts
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { Result, ok, err } from '@/lib/result'

const CreateTextSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(50),
})

export async function createText(
  input: z.infer<typeof CreateTextSchema>
): Promise<Result<{ id: string }, string>> {
  const parsed = CreateTextSchema.safeParse(input)
  if (!parsed.success) return err(parsed.error.message)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('texts')
    .insert(parsed.data)
    .select('id')
    .single()

  if (error) return err(error.message)
  return ok(data)
}
```

### Result type
```ts
// src/lib/result.ts
export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E }

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data })
export const err = <E>(error: E): Result<never, E> => ({ success: false, error })
```

---

## Setup — status atual

### ✅ Concluído
- [x] Projeto Next.js criado
- [x] Documentação spec-driven na raiz (`/docs`)
- [x] Projeto Supabase criado
- [x] `.env.local` preenchido (Supabase + Google Cloud)
- [x] Supabase CLI instalado e linkado
- [x] Tipos gerados (`npx supabase gen types typescript --linked > src/types/supabase.ts`)
- [x] Credenciais Google via service account prontas para a Vercel

### ⏳ Pendente
- [ ] Primeiro deploy na Vercel (preview → produção)

### 🚫 Fora do fluxo atual — Piper VPS
O TTS foi migrado para o Google Cloud TTS. O Piper (`earcast-piper/`, `/docs/setup/piper-vps.md`,
`/docs/features/audio-pipeline.md`) não é usado hoje e não tem variáveis de ambiente no `env.ts`.
Não reintroduza sem confirmação.

---

## Fluxo de trabalho e deploy

### Verificação antes de qualquer push
Rodar dentro de `english-daily-audio/`:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Enquanto os erros de lint antigos não forem corrigidos (branch `fix/lint`), o lint só bloqueia
se houver erro nos arquivos alterados na branch (`npx eslint <arquivos>`) — ver `/deploy-preview`.

### Deploy (Vercel ligada ao GitHub)
- **Push em qualquer branch ≠ `main`** → deploy de **preview** automático
- **Merge na `main`** → deploy de **produção**
- **NUNCA** dar push direto na `main` sem confirmação explícita do usuário — o caminho é branch → PR → merge (squash)
- Comandos do Claude Code na raiz do repo: `/setup-local`, `/deploy-preview`, `/deploy-prod`

### Migrations do banco
1. Criar o SQL em `supabase/migrations/<timestamp>_<nome>.sql`
2. Aplicar: `npx supabase db push`
3. Regenerar tipos: `npx supabase gen types typescript --linked > src/types/supabase.ts`
4. Rodar `npx tsc --noEmit` e commitar a migration junto com os tipos

Em produção, aplicar as migrations **antes** do merge que depende delas.

---

## Documentação detalhada

Antes de implementar qualquer feature, leia o doc correspondente:

| Feature | Doc |
|---|---|
| Visão geral do produto | `/docs/PRD.md` |
| Arquitetura e segurança | `/docs/ARCHITECTURE.md` |
| Schema do banco + RLS | `/docs/DATABASE.md` |
| Biblioteca de textos | `/docs/features/library.md` |
| Playlists, mesclagem e geração | `/docs/features/playlist.md` |
| Player e marcação | `/docs/features/player.md` |
| LSR Engine (SRS) | `/docs/features/lsr-engine.md` |
| Progressive Consolidation | `/docs/features/progressive-consolidation.md` |
| Piper TTS + pipeline (fora do fluxo atual) | `/docs/features/audio-pipeline.md` |
| Setup Piper VPS (fora do fluxo atual) | `/docs/setup/piper-vps.md` |

---

## Fases de desenvolvimento

1. Auth + Biblioteca + extração + análise de relevância (Gemini)
2. Playlist Manager + geração de texto + tradução (Gemini)
3. Pipeline de áudio (Google Cloud TTS; Piper descartado) + player básico
4. Player com sincronização texto-áudio + modo marcação
5. LSR Engine
6. Progressive Consolidation
7. Dashboard de domínio + rotina diária automática (pg_cron)
