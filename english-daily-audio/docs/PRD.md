# PRD — Earcast

## Problema

O método Mairo Vergara exige escuta diária de áudios de textos estudados.
Com o tempo, o usuário já conhece as histórias de cor — a escuta vira passiva e perde eficácia.
Não existe ferramenta que gere automaticamente novos áudios personalizados
com o vocabulário exato que o usuário já estudou.

## Solução

Aplicação web que:
1. Importa os textos que o usuário já estuda
2. Extrai e filtra o vocabulário relevante via LLM
3. Gera diariamente novos textos em inglês usando esse vocabulário
4. Converte em áudio MP3 via Piper TTS
5. Apresenta player com sincronização texto-áudio para marcação de dificuldades
6. Usa repetição espaçada para garantir que palavras difíceis reapareçam

## Usuários

Uso pessoal + até 5 amigos. Não é um produto SaaS público.
Auth simples via Supabase (email/senha ou magic link).

---

## Módulos

### Módulo 1 — Biblioteca de Textos

O usuário importa textos que compõem seu material de estudo.

**Funcionalidades:**
- Upload de PDF (parse client-side via PDF.js) ou cola de texto
- Cada texto tem: nome, conteúdo, status (`locked` / `unlocked`), data
- Ao **liberar** (`unlock`) um texto, dois processos são disparados:
  1. Extração de vocabulário (tokenização, remoção de stopwords)
  2. Análise de relevância via LLM (Claude classifica cada palavra de 0 a 1)
- Usuário pode revisar o vocabulário extraído e fazer overrides manuais
- Threshold padrão de relevância: 0.4 (configurável por usuário)

**Critérios de relevância LLM:**
- Alta frequência no inglês cotidiano → score alto
- Nome próprio → penalizar (score baixo)
- Arcaísmo / palavra rara → penalizar
- Expressão idiomática útil → bonificar
- Palavra de função gramatical básica (stopword) → excluir

---

### Módulo 2 — Playlists e Schedule

Define quais áudios são gerados diariamente e como.

**Conceito de Playlist:**
Cada playlist representa um conjunto de textos cujo vocabulário será usado
para gerar um áudio diário.

**Comportamento ao liberar textos:**
- Texto A liberado → Playlist A criada automaticamente
- Texto B liberado → Playlist B criada automaticamente
- Usuário pode **mesclar** A+B → Playlist A+B criada, A e B arquivadas
- Texto C liberado → Playlist C criada
- Estado: [Playlist A+B ativo, Playlist C ativo]
- Usuário pode **desfazer** mesclagem → A+B arquivada, A e B reativadas

**Áudios são destrutivos:** apenas o áudio do dia atual existe no Storage.
O do dia anterior é sobrescrito na geração diária.

**Geração manual:** usuário pode solicitar regeneração fora da rotina diária.

---

### Módulo 3 — Player e Marcação

**Player:**
- Exibe texto EN e tradução PT lado a lado
- Highlight em tempo real da palavra sendo falada (sincronização via timestamps do Piper)
- Controle de velocidade: 0.5x / 0.75x / 1x / 1.25x
- Modo só ouvir (padrão) e modo leitura simultânea

**Marcação:**
- Durante a escuta ou leitura, usuário clica em palavra/frase que não entendeu
- Item marcado como `review` → alimenta o LSR Engine
- Pode marcar palavra isolada ou selecionar uma frase inteira

---

### Módulo 4 — LSR Engine (Lexical Spaced Repetition)

Sistema de repetição espaçada para vocabulário. Inspirado no algoritmo SM-2 do Anki.

Ver spec detalhada em `/docs/features/lsr-engine.md`.

**Resumo:**
- Palavra marcada como difícil → interval = 1 dia
- Palavra não marcada → interval aumenta progressivamente
- Palavra marcada difícil em 3+ playlists distintas → vira palavra **global**
  (pode aparecer em qualquer playlist, desvinculada de texto específico)

---

### Módulo 5 — Progressive Consolidation

Quando uma playlist atinge domínio suficiente (80% das palavras com easiness alto
e sem marcações em 14 dias), ela para de gerar áudio próprio e é mesclada
automaticamente na playlist menos dominada.

Garante que vocabulário antigo continue aparecendo com frequência reduzida.

Ver spec detalhada em `/docs/features/progressive-consolidation.md`.

---

### Módulo 6 — Histórico

- Lista de todas as gerações anteriores com data, playlist base, status
- Filtros por data e playlist
- Acesso ao texto mesmo sem o áudio (áudios são destrutivos, textos não)

---

## Fluxo diário

```
07:00 — pg_cron dispara geração diária
  Para cada playlist ativa do usuário:
    1. LSR Engine seleciona palavras obrigatórias do dia
    2. Prompt Builder monta contexto (vocabulário + palavras SRS + tema)
    3. Claude gera texto EN
    4. Claude traduz para PT
    5. Job de áudio enfileirado
    6. Piper VPS processa → MP3 com timestamps
    7. Callback → MP3 salvo no Storage (substitui anterior)
    8. Status → ready

Usuário abre app → áudios do dia prontos para ouvir
```

---

## Configurações por usuário

- Threshold de relevância (padrão: 0.4)
- Horário da geração diária (padrão: 07:00)
- % de vocabulário conhecido no texto gerado (padrão: 85%)
- Tema/estilo do texto gerado (campo livre, ex: "notícia de tecnologia")
- Voz do Piper (lista de vozes disponíveis no VPS)
