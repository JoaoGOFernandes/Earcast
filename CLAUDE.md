# Earcast — raiz do repositório

O app fica em **`english-daily-audio/`**. Antes de qualquer tarefa, leia:

- `english-daily-audio/CLAUDE.md` — stack, regras absolutas, variáveis de ambiente, fluxo de deploy
- `english-daily-audio/AGENTS.md` — esta versão do Next.js (16) tem breaking changes; consulte `node_modules/next/dist/docs/`

Todos os comandos `npm`, `npx tsc`, `npx supabase` rodam **dentro de `english-daily-audio/`**.

## Ferramentas esperadas

| Ferramenta | Uso | Verificar com |
|---|---|---|
| `node` (≥ 20) + `npm` | dev, build, lint | `node -v` |
| `gh` | PRs e merge | `gh auth status` |
| `vercel` | link do projeto, env vars, deploy manual se preciso | `vercel whoami` |
| `gcloud` | ADC local para Vertex AI e TTS | `gcloud auth application-default print-access-token` |
| Supabase CLI | migrations e tipos (`npx supabase`) | `npx supabase --version` |

## MCPs (`.mcp.json`)

- **vercel** — acompanhar deployments e ler build/runtime logs
- **supabase** — consultar o projeto linkado (schema, logs, advisors)

## Comandos

- `/setup-local` — prepara e valida o ambiente local
- `/deploy-preview` — verifica, commita, faz push numa branch e acompanha o preview
- `/deploy-prod` — leva o preview para produção (pede confirmação antes)

## Regras de git

- Nunca dar push direto na `main` sem confirmação explícita.
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…).
