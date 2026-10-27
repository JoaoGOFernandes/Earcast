---
description: Prepara e valida o ambiente local do Earcast (ferramentas, deps, env, tsc, build, dev + /login)
---

Prepare o ambiente local do Earcast. O app fica em `english-daily-audio/` — rode tudo lá dentro.
Pare e me reporte no primeiro passo que falhar, com a saída do erro.

1. **Ferramentas** — rode e mostre uma tabela com versão/status:
   - `node -v` (precisa ≥ 20), `npm -v`
   - `gh auth status`
   - `vercel whoami`
   - `gcloud auth application-default print-access-token` — só diga se funcionou; **nunca mostre o token**
   - `npx supabase --version`
   Ferramenta ausente não bloqueia os próximos passos, mas aponte como instalar.

2. **Dependências** — `npm install`.

3. **`.env.local`** — confira que o arquivo existe e que cada variável obrigatória da tabela em
   `english-daily-audio/CLAUDE.md` tem valor. **Nunca imprima valores**: liste só nome → `definida` / `vazia` / `ausente`.
   Use algo como `grep -oE '^[A-Z_]+=' .env.local` e um teste de comprimento, nunca `cat`.
   `GOOGLE_SERVICE_ACCOUNT_KEY` deve ficar ausente localmente (usa ADC); se estiver definida, só avise.

4. **Tipos** — `npx tsc --noEmit`.

5. **Build** — `npm run build`.

6. **Dev + smoke test** — suba `npm run dev` em background, espere o "Ready", e teste:
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → esperado `200`.
   Também `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/library` → esperado redirect (`307`) para o login.
   Depois encerre o servidor de dev.

7. **Resumo** — tabela final com ✅/❌ por passo e próximos passos se algo faltou.
