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

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes (BFF — único ponto de saída para serviços externos)
- **Banco:** Supabase (Postgres + Storage + Auth + pg_cron)
- **TTS:** Google Cloud Text-to-Speech API (Neural2 via SSML marks — timestamps por palavra para karaokê)
- **LLM:** Gemini via Vertex AI (`gemini-2.5-flash` via `@google/genai`) — chamado APENAS server-side
- **Tipos:** Gerados via `supabase gen types` em `/src/types/supabase.ts`

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
│   └── audio/
│       ├── job-dispatcher.ts
│       └── piper-client.ts         # Só chamado server-side
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   └── server.ts               # Server client (cookies)
│   ├── gemini.ts                   # Cliente Gemini (substitui claude.ts)
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

### Cliente Gemini
```ts
// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '@/lib/env'

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY)

export const gemini = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
})
```

### Variáveis de ambiente
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
- [x] `.env.local` preenchido (Supabase + Google AI)
- [x] Supabase CLI instalado e linkado

### ⏳ Pendente — Piper VPS (Fase 3)
As variáveis abaixo ainda são placeholder e serão preenchidas na Fase 3:
```
PIPER_VPS_URL=http://placeholder:8000
PIPER_VPS_SECRET=placeholder-trocar-depois
```
Ver instruções completas em `/docs/setup/piper-vps.md`

### ⏳ Pendente — após scaffold
- [x] Rodar `npx supabase gen types typescript --linked > src/types/supabase.ts`
- [ ] Deploy Vercel (após tudo funcionando local)

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
| Piper TTS + pipeline | `/docs/features/audio-pipeline.md` |
| Setup Piper VPS | `/docs/setup/piper-vps.md` |

---

## Fases de desenvolvimento

1. Auth + Biblioteca + extração + análise de relevância (Gemini)
2. Playlist Manager + geração de texto + tradução (Gemini)
3. Piper VPS + pipeline assíncrono + player básico
4. Player com sincronização texto-áudio + modo marcação
5. LSR Engine
6. Progressive Consolidation
7. Dashboard de domínio + rotina diária automática (pg_cron)
