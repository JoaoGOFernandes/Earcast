# Feature: LSR Engine (Lexical Spaced Repetition)

## O que é

Sistema de repetição espaçada aplicado ao vocabulário do usuário.
Inspirado no algoritmo SM-2 do Anki, adaptado para palavras em inglês
vinculadas a playlists de áudio.

**Nome do módulo:** `modules/vocabulary/srs-engine.ts`
**Completamente isolado** — a lógica de intervalo pode ser trocada sem afetar o resto do sistema.

---

## Algoritmo SM-2 adaptado

### Parâmetros por palavra (`word_reviews`)

| Campo | Descrição | Valor inicial |
|---|---|---|
| `interval_days` | Dias até próxima revisão | 1 |
| `easiness_factor` | Multiplicador de intervalo | 2.5 |
| `next_review_at` | Data da próxima aparição | amanhã |
| `difficulty_count` | Total de marcações difíceis | 0 |
| `review_count` | Total de revisões | 0 |

### Evento: palavra marcada como difícil

```ts
function onDifficult(review: WordReview, playlistId: string): WordReview {
  const newDistinctPlaylists = Array.from(
    new Set([...review.distinct_playlist_difficulties, playlistId])
  )

  return {
    ...review,
    interval_days: 1,                                          // reset
    easiness_factor: Math.max(1.3, review.easiness_factor - 0.2),
    next_review_at: addDays(today(), 1),
    difficulty_count: review.difficulty_count + 1,
    review_count: review.review_count + 1,
    distinct_playlist_difficulties: newDistinctPlaylists,
    // Se marcado difícil em 3+ playlists distintas → vira global
    is_global: newDistinctPlaylists.length >= 3,
    playlist_id: newDistinctPlaylists.length >= 3 ? null : review.playlist_id,
  }
}
```

### Evento: palavra não marcada (revisão bem-sucedida)

```ts
function onSuccess(review: WordReview): WordReview {
  const newFactor = Math.min(2.5, review.easiness_factor + 0.1)
  const newInterval = Math.round(review.interval_days * newFactor)

  return {
    ...review,
    interval_days: newInterval,
    easiness_factor: newFactor,
    next_review_at: addDays(today(), newInterval),
    review_count: review.review_count + 1,
    last_reviewed_at: today(),
  }
}
```

### Sequência típica de intervalos

```
Revisão 1: 1 dia
Revisão 2: 3 dias   (1 * 2.5 + 0.1 ≈ 3)
Revisão 3: 8 dias
Revisão 4: 21 dias
Revisão 5: 55 dias
...
```

---

## Seleção de palavras para o áudio do dia

```ts
async function getWordsForToday(
  userId: string,
  playlistId: string,
  coverageTarget: number  // % de palavras conhecidas no texto
): Promise<{ required: string[]; pool: string[] }> {

  // 1. Palavras com SRS due hoje (obrigatórias)
  const dueWords = await getDueWords(userId, playlistId)

  // 2. Palavras globais due hoje (desvinculadas de playlist)
  const globalDueWords = await getGlobalDueWords(userId)

  // 3. Pool de vocabulário ativo da playlist (para completar o texto)
  const vocabularyPool = await getActiveVocabulary(userId, playlistId, {
    minRelevanceScore: userSettings.relevanceThreshold,
  })

  return {
    required: [...dueWords, ...globalDueWords],  // DEVEM aparecer no texto
    pool: vocabularyPool,                         // podem aparecer para atingir coverage
  }
}
```

---

## Desvinculação de palavra (globalização)

Quando `distinct_playlist_difficulties.length >= 3`:

1. `word_reviews.is_global = true`
2. `word_reviews.playlist_id = null`
3. A palavra passa a ser incluída no `required` de QUALQUER playlist
4. O interval/easiness continua sendo calculado normalmente

**Threshold configurável:** padrão 3, pode ser alterado em `user_settings` no futuro.

---

## Interface do módulo

```ts
// modules/vocabulary/srs-engine.ts

export interface SRSEngine {
  // Retorna palavras que devem aparecer hoje para uma playlist
  getWordsForToday(userId: string, playlistId: string): Promise<WordSelection>

  // Processa um review_event e atualiza word_reviews
  processReviewEvent(event: ReviewEvent): Promise<void>

  // Processa o fim de uma sessão de listening (palavras não marcadas = sucesso)
  processSessionEnd(generationId: string, userId: string): Promise<void>

  // Calcula dominance_score de uma playlist (usado pelo Progressive Consolidation)
  calculateDominanceScore(playlistId: string, userId: string): Promise<number>
}
```

---

## Integração com o Prompt Builder

O `prompt-builder.ts` recebe o resultado do `getWordsForToday` e instrui o Claude:

```
"Escreva um texto em inglês sobre [theme].
OBRIGATÓRIO: use TODAS as seguintes palavras/expressões: [required words]
POOL disponível: [vocabulary pool] — use para atingir [coverageTarget]% do vocabulário total.
Não use palavras fora dessas duas listas exceto artigos, preposições e conjunções básicas."
```

---

## Eventos disparados pelo Player

Quando usuário marca uma palavra/frase no player:

```ts
// Inserido em review_events
{
  user_id,
  generation_id,
  playlist_id,
  word: "ephemeral",
  phrase: "the ephemeral nature of memory",  // contexto
  mode: "listening" | "reading",
  marked_at: now()
}
```

Um trigger ou Edge Function processa o evento e chama `processReviewEvent`.
