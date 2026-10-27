---
description: Verifica, commita, faz push numa branch e acompanha o deploy de preview na Vercel
argument-hint: "[nome-da-branch ou descrição da mudança]"
---

Leve as mudanças atuais para um deploy de **preview** na Vercel. Contexto extra: $ARGUMENTS

O app fica em `english-daily-audio/`. Pare e me reporte em qualquer falha.

1. **Verificação** (em `english-daily-audio/`):
   - `npx tsc --noEmit`
   - **Lint só nos arquivos alterados** — o repo tem erros de lint antigos (tratados na branch `fix/lint`),
     então **não** rode `npm run lint` no projeto inteiro como bloqueio:
     - Liste os arquivos alterados: `git diff --name-only main...HEAD` mais os ainda não commitados
       (`git diff --name-only HEAD` e `git ls-files --others --exclude-standard`).
     - Fique só com os que estão em `english-daily-audio/` e terminam em `.ts`, `.tsx`, `.js` ou `.mjs`,
       remova o prefixo `english-daily-audio/` e ignore arquivos apagados.
     - Rode `npx eslint <arquivos>` em `english-daily-audio/`. Se a lista estiver vazia, pule este passo.
     - **Bloqueie só se houver erro (`error`) nesses arquivos**; warnings apenas reporte.
   - `npm run build`
   Se algo falhar, corrija se for trivial e óbvio; senão pare e mostre o erro.

2. **Branch** — `git branch --show-current`. Se estiver na `main`, crie uma branch nova
   (`feat/…`, `fix/…` ou `chore/…`, derivada das mudanças ou de `$ARGUMENTS`). **Nunca** faça push na `main`.

3. **Commit** — `git status` e `git diff`; confira que não há `.env*`, `supabase/.temp` nem segredos no stage.
   Commit no padrão Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`), mensagem curta em português.
   Se não houver nada para commitar, siga com o push da branch atual.

4. **Push** — `git push -u origin <branch>`.

5. **Acompanhar o deploy** pela MCP da Vercel:
   - Encontre o projeto do Earcast e o deployment correspondente ao commit recém-enviado.
   - Acompanhe o estado até `READY` ou `ERROR`/`CANCELED` (verifique a cada ~30s, sem loop infinito: desista após ~10 min e reporte).
   - Se `ERROR`: leia os build logs do deployment, identifique a causa e me mostre o trecho relevante
     com uma proposta de correção. Se for erro de runtime, leia também os runtime logs.

6. **Resumo** — branch, hash do commit, URL do preview e estado final.
