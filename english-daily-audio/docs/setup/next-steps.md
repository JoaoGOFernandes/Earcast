# Próximos Passos — Earcast

Checklist completo de setup. Execute em ordem.

---

## ✅ Concluído

- [x] Projeto Next.js criado (`npx create-next-app`)
- [x] Documentação spec-driven adicionada à raiz
- [x] Projeto Supabase criado (com RLS automático ativado)
- [x] `.env.local` preenchido:
  - [x] `NEXT_PUBLIC_SUPABASE_URL`
  - [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [x] `SUPABASE_SERVICE_ROLE_KEY`
  - [x] `GOOGLE_API_KEY`
  - [ ] `PIPER_VPS_URL` ← placeholder, ver Fase 3
  - [ ] `PIPER_VPS_SECRET` ← placeholder, ver Fase 3

---

## 🔜 Passo imediato — Supabase CLI

Antes de rodar o Claude Code pela primeira vez:

```bash
# 1. Instala o Supabase CLI
npm install supabase --save-dev

# 2. Faz login
npx supabase login

# 3. Inicializa na pasta do projeto
npx supabase init

# 4. Linka com seu projeto
# O project-ref fica na URL do dashboard:
# supabase.com/project/<project-ref>
npx supabase link --project-ref <seu-project-ref>
```

---

## 🚀 Primeira sessão com o Claude Code

Com o CLI configurado, rode no terminal dentro da pasta do projeto:

```bash
claude
```

Cole esse prompt:

```
Leia o CLAUDE.md e todos os docs em /docs.

Contexto de setup atual:
- Next.js já criado com npx create-next-app
- Supabase projeto criado, .env.local preenchido (Supabase + Google AI)
- Supabase CLI instalado e linkado
- Piper VPS ainda não configurado — deixar para Fase 3
- LLM: Gemini API (gemini-2.5-flash-lite via @google/generative-ai)

Me pergunte o que mais precisar e depois crie o scaffold
completo da Fase 1: estrutura de pastas, dependências,
configuração do Supabase client, middleware de auth,
env.ts com Zod, e as migrations do banco.
```

---

## ✅ Após o scaffold

```bash
# Depois que as migrations rodarem (já executado):
npx supabase gen types typescript --linked > src/types/supabase.ts
```

---

## 🐳 Fase 3 — Piper VPS

Quando chegar na Fase 3, siga o guia completo em:
`/docs/setup/piper-vps.md`

Resumo do que fazer:
1. Gerar `PIPER_VPS_SECRET` com `node -e "..."`
2. Subir Docker no VPS
3. Atualizar `.env.local` com IP e secret reais
4. Testar com curl
5. Atualizar variáveis no Vercel

---

## ☁️ Deploy Vercel (após tudo funcionando local)

```bash
# Instala Vercel CLI
npm install -g vercel

# Faz login e deploy
vercel

# Adiciona as variáveis de ambiente
vercel env add GOOGLE_API_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... (repetir para todas as vars do .env.local)
```
