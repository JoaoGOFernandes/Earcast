# Feature: Biblioteca de Textos

## Visão geral

Onde o usuário importa os textos que estuda (contos, artigos, etc).
Ao liberar um texto, o sistema extrai e filtra o vocabulário automaticamente.

---

## Importação

### Via PDF
- Upload client-side com PDF.js (sem enviar o PDF ao servidor)
- Extração do texto puro no browser
- Texto extraído é enviado via Server Action para o banco

### Via texto colado
- Textarea simples
- Suporta colagem direta

---

## Estados do texto

```
locked    → importado, mas vocabulário não está ativo
unlocked  → vocabulário extraído e disponível para geração
```

Ao fazer `unlock`:
1. **Extração de vocabulário** (client ou server)
   - Tokenização: split por espaço/pontuação
   - Lowercase
   - Remove stopwords (a, the, is, are, etc.)
   - Remove números e símbolos puros
   - Deduplica

2. **Análise de relevância via LLM** (server, Gemini API — `gemini-2.5-flash-lite`)
   - Envia lista de palavras em batches de 30
   - Retorna `{ word, score, reason }[]`
   - Salva em `vocabulary` (inclusive palavras abaixo do threshold, para override manual futuro)

---

## Prompt de análise de relevância

```
You are an English vocabulary analyst. Evaluate each word below for learning relevance.

Context (first 500 chars of the source text):
"""
<trecho do texto>
"""

Words to evaluate:
1. word1
2. word2
...

For each word, assign a relevance score from 0.0 to 1.0 based on:
- High score (0.7–1.0): intermediate/advanced vocabulary worth studying
  (idioms, collocations, academic words, rare but useful words)
- Medium score (0.3–0.6): useful but common vocabulary
- Low score (0.0–0.2): too simple, too rare/obscure, or personal proper nouns

Score exactly 0.0 if:
- The word is NOT English (e.g. Portuguese, Spanish, French)
- It is a person's proper name or fictional character name

IMPORTANT rules:
- Country names, nationalities, and place names (cities, rivers, continents)
  are valid English vocabulary — score them normally
- Only personal names (people, characters) get 0.0 for being proper nouns
- Any word that is not English must receive 0.0

Respond ONLY with a JSON array, no markdown:
[{"word":"...","score":0.0,"reason":"..."}]
```

---

## Override manual

Após a análise LLM, o usuário vê a lista de palavras com seus scores.
Pode:
- **Forçar inclusão** de palavra abaixo do threshold (override_active = true)
- **Forçar exclusão** de palavra acima do threshold (override_active = false)
- Ajustar threshold global nas configurações (padrão: 0.2)

Palavras com score `0.0` (não-inglês ou nome de pessoa) são ocultadas da UI — não
aparecem nem como excluídas.

---

## UI da Biblioteca

Tabs [Texts | Vocabulary] no lado direito do header; título à esquerda.

**Aba Texts:**
```
┌───────────────────────────────────────────────────────┐
│  Library                        [Texts] [Vocabulary]  │
│  3 texts                                              │
│                                                       │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │  + Import text   │  │ Jack e o Pé de  │  ...       │
│  │  (dashed border) │  │ Feijão  unlocked │           │
│  └──────────────────┘  └──────────────────┘           │
└───────────────────────────────────────────────────────┘
```
- Botão "+ Import text" é o **primeiro card do grid** (variant card com borda dashed)
- Suporta upload por clique ou **drag-and-drop** de PDF (previne browser de abrir o arquivo)
- `accept=".pdf"` apenas (não usar `application/pdf` — causa problemas no Windows)

**Aba Vocabulary:**
- Vocabulário global deduplificado de todos os textos desbloqueados
- Seção "Active" (score ≥ threshold) e "Excluded" (0 < score < threshold)
- Palavras com score 0.0 não aparecem
- Badge "N texts" quando a palavra vem de mais de um texto
- Read-only (sem toggles — overrides são por texto no `/vocabulary?textId=...`)

---

## Server Actions

```ts
// modules/library/actions.ts
'use server'

export async function createText(input: CreateTextInput): Promise<Result<{ id: string }, string>>
export async function unlockText(textId: string): Promise<Result<{ wordCount: number }, string>>
export async function lockText(textId: string): Promise<Result<void, string>>
export async function deleteText(textId: string): Promise<Result<void, string>>
export async function overrideWordRelevance(input: OverrideInput): Promise<Result<void, string>>
```
