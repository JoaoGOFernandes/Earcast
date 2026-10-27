---
description: Promove a branch atual para produção (PR + merge squash na main), com confirmação antes
---

Leve a branch atual para **produção**. O app fica em `english-daily-audio/`.
Este comando altera a `main` e o banco de produção — siga a ordem e **não pule a confirmação**.

1. **Pré-condições**
   - `git branch --show-current` — se for a `main`, pare: produção sai de uma branch via PR.
   - `git status` limpo e branch já enviada (`git status -sb` sem "ahead"). Se não, sugira `/deploy-preview` e pare.

2. **Preview READY** — pela MCP da Vercel, encontre o deployment de preview do último commit da branch
   (`git rev-parse HEAD`). Ele precisa estar `READY`. Se não estiver, pare e reporte.

3. **Levantamento** — mostre:
   - Commits que vão entrar: `git log --oneline origin/main..HEAD`
   - Migrations novas: `git diff --name-only origin/main...HEAD -- english-daily-audio/supabase/migrations/`
   - Migrations pendentes no banco remoto: `npx supabase migration list` (em `english-daily-audio/`)
   - URL do preview

4. **⛔ CONFIRMAÇÃO** — pergunte explicitamente se pode seguir para produção, listando o que vai acontecer
   (migrations a aplicar, PR, merge squash na `main`). **Só continue com um "sim" claro.**

5. **Migrations** — se houver migrations pendentes: `npx supabase db push` (em `english-daily-audio/`).
   Se falhar, pare antes do merge.

6. **PR + merge**
   - `gh pr view` para ver se já existe PR da branch; se não, `gh pr create --base main --fill`
     (título no padrão Conventional Commits).
   - `gh pr merge --squash --delete-branch`.

7. **Acompanhar produção** pela MCP da Vercel: encontre o deployment de produção do commit de merge na `main`
   e acompanhe até `READY` (desista após ~10 min e reporte). Se `ERROR`, leia os build/runtime logs e
   me mostre a causa — **não** faça rollback nem novo push sem perguntar.

8. **Resumo** — PR, commit na `main`, migrations aplicadas, URL de produção, estado final.
   Por fim: `git checkout main && git pull`.
