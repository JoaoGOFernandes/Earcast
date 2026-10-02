import type { Database } from '@/types/supabase'

type WordReview = Database['public']['Tables']['word_reviews']['Row']

export interface SRSResult {
  intervalDays: number
  easinessFactor: number
  nextReviewAt: Date
}

const MIN_EASINESS = 1.3
const GLOBAL_DIFFICULTY_THRESHOLD = 3

/**
 * SM-2 adaptado para palavras com vínculo de playlist.
 * Chamado ao final de uma sessão de listening/marking.
 */
export function onDifficult(review: WordReview): SRSResult {
  const easinessFactor = Math.max(
    MIN_EASINESS,
    review.easiness_factor - 0.2,
  )

  return {
    intervalDays: 1,
    easinessFactor,
    nextReviewAt: addDays(new Date(), 1),
  }
}

export function onSuccess(review: WordReview): SRSResult {
  const intervalDays = Math.round(review.interval_days * review.easiness_factor)
  const easinessFactor = Math.min(review.easiness_factor + 0.1, 4.0)

  return {
    intervalDays,
    easinessFactor,
    nextReviewAt: addDays(new Date(), intervalDays),
  }
}

/**
 * Verifica se a palavra deve tornar-se global após dificuldades em
 * múltiplas playlists distintas.
 */
export function shouldBecomeGlobal(review: WordReview): boolean {
  const distinct = new Set(review.distinct_playlist_difficulties)
  return distinct.size >= GLOBAL_DIFFICULTY_THRESHOLD
}

/**
 * Seleciona palavras para a geração diária de uma playlist.
 * Retorna palavras com next_review_at <= hoje ordenadas por prioridade.
 */
export function selectWordsForGeneration(
  reviews: WordReview[],
  targetCount: number,
): WordReview[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return reviews
    .filter((r) => new Date(r.next_review_at) <= today)
    .sort((a, b) => a.easiness_factor - b.easiness_factor) // mais difíceis primeiro
    .slice(0, targetCount)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
