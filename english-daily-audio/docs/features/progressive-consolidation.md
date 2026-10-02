# Feature: Progressive Consolidation

## O que é

Quando o usuário domina o vocabulário de uma playlist, ela para de gerar
áudio próprio e é automaticamente absorvida pela playlist menos dominada.
Garante que vocabulário antigo continue aparecendo, mas com frequência reduzida.

**Nome do módulo:** `modules/vocabulary/progressive-consolidation.ts`
Totalmente isolado — lógica de consolidação pode ser ajustada sem afetar o resto.

---

## Critério de dominância

Uma playlist entra em `consolidating` quando:
- `dominance_score >= 0.80`
- Calculado pelo LSR Engine via `calculateDominanceScore()`

### Cálculo do dominance_score

```ts
function calculateDominanceScore(wordReviews: WordReview[]): number {
  if (wordReviews.length === 0) return 0

  const scores = wordReviews.map(w => {
    // Palavra dominada = easiness alto + sem dificuldade recente
    const easyScore = Math.min(1, (w.easiness_factor - 1.3) / (2.5 - 1.3))
    const recentDifficulty = daysSince(w.last_difficult_at) < 14 ? 0 : 1
    return easyScore * recentDifficulty
  })

  return scores.reduce((a, b) => a + b, 0) / scores.length
}
```

---

## Comportamento de consolidação

### Quando a consolidação é disparada

```
pg_cron roda diariamente (junto com geração):
  Para cada playlist com status = 'active':
    Calcula dominance_score
    Se dominance_score >= 0.80:
      status → 'consolidating'
      Dispara consolidation job
```

### O que acontece

1. Playlist dominada (`consolidating`) é mesclada automaticamente na playlist
   com menor `dominance_score` entre as ativas
2. A playlist dominada é arquivada (`archived`)
3. A playlist destino absorve os textos — `source_text_ids` é expandido
4. As palavras da playlist dominada com intervalos SRS longos continuam
   aparecendo nos áudios da playlist destino, mas com frequência baixa

### Exemplo

```
Estado:
  Playlist A+B — dominance: 0.85 (consolidating)
  Playlist C   — dominance: 0.40 (active)

Ação automática:
  Playlist A+B é mesclada em Playlist C
  → Playlist C agora tem source_text_ids = [textA, textB, textC]
  → Playlist A+B → archived
  → Vocabulário de A+B continua aparecendo via SRS (intervalos longos)

Resultado para o usuário:
  Recebe 1 áudio por dia que cobre todos os textos
  Vocabulário antigo aparece só quando o SRS manda
```

---

## Desfazer consolidação

O usuário pode rejeitar uma consolidação automática:
- Playlist dominada volta para `active`
- Playlist destino volta ao `source_text_ids` original
- O sistema não tenta consolidar aquela playlist por 30 dias

---

## Interface do módulo

```ts
// modules/vocabulary/progressive-consolidation.ts

export interface ProgressiveConsolidation {
  // Avalia quais playlists devem entrar em consolidação
  evaluateConsolidation(userId: string): Promise<ConsolidationCandidate[]>

  // Executa a consolidação de uma playlist
  consolidate(userId: string, sourcePlaylistId: string): Promise<void>

  // Desfaz uma consolidação
  revertConsolidation(userId: string, consolidationId: string): Promise<void>
}
```

---

## UI — Dashboard de Domínio

```
┌─────────────────────────────────────────────┐
│  Domínio do vocabulário                     │
│                                             │
│  Playlist A+B                               │
│  ████████████████░░░░  85%  consolidating   │
│  → será mesclada em Playlist C em breve     │
│  [Adiar consolidação]                       │
│                                             │
│  Playlist C                                 │
│  ████████░░░░░░░░░░░░  40%  aprendendo      │
│  Palavras críticas: ephemeral, sovereign    │
│  Próxima revisão: amanhã                   │
│                                             │
│  Palavras globais: 7                        │
│  (aparecem em todas as playlists)           │
└─────────────────────────────────────────────┘
```
