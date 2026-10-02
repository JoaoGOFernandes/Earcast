'use server'

import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { type Result, ok, err } from '@/lib/result'
import { onDifficult, onSuccess, shouldBecomeGlobal } from '@/modules/vocabulary/srs-engine'
import type { Database } from '@/types/supabase'

type WordReview = Database['public']['Tables']['word_reviews']['Row']

// ─── markWordForReview ───────────────────────────────────────────────────────

const MarkWordSchema = z.object({
  generationId: z.string().uuid(),
  playlistId: z.string().uuid(),
  word: z.string().min(1).max(200),
  phrase: z.string().max(500).optional(),
  mode: z.enum(['listening', 'reading']),
})

export async function markWordForReview(
  input: z.infer<typeof MarkWordSchema>,
): Promise<Result<void>> {
  const parsed = MarkWordSchema.safeParse(input)
  if (!parsed.success) return err(parsed.error.message)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return err('Not authenticated')

  const { error } = await supabase
    .from('review_events')
    .insert({
      user_id: user.id,
      generation_id: parsed.data.generationId,
      playlist_id: parsed.data.playlistId,
      word: parsed.data.word.toLowerCase(),
      phrase: parsed.data.phrase ?? null,
      mode: parsed.data.mode,
    })

  if (error) return err(error.message)
  return ok(undefined)
}

// ─── processSessionEnd ───────────────────────────────────────────────────────

export async function processSessionEnd(
  generationId: string,
): Promise<Result<{ reinforced: number; improved: number }>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return err('Not authenticated')

  // 1. Busca generation (valida ownership via RLS)
  const { data: generation, error: genError } = await supabase
    .from('generations')
    .select('id, text_en, playlist_id, reviewed')
    .eq('id', generationId)
    .single()

  if (genError || !generation) return err('Generation not found')

  // 2. Idempotente — já processada
  if (generation.reviewed) {
    return ok({ reinforced: 0, improved: 0 })
  }

  // 3. Carrega palavras marcadas nesta sessão
  const { data: events, error: eventsError } = await supabase
    .from('review_events')
    .select('word')
    .eq('generation_id', generationId)
    .eq('user_id', user.id)

  if (eventsError) return err(eventsError.message)

  const markedSet = new Set((events ?? []).map((e) => e.word.toLowerCase()))

  // 4. Tokeniza texto EN → palavras únicas
  const allWords = Array.from(
    new Set(
      generation.text_en
        .toLowerCase()
        .replace(/[^a-z\s'-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    ),
  )

  const serviceSupabase = createSupabaseServiceClient()

  // 5. Carrega word_reviews existentes para este usuário
  const { data: existingReviews } = await serviceSupabase
    .from('word_reviews')
    .select('*')
    .eq('user_id', user.id)
    .in('word', allWords)

  const reviewMap = new Map<string, WordReview>(
    (existingReviews ?? []).map((r) => [r.word, r]),
  )

  let reinforced = 0
  let improved = 0

  const upserts: Database['public']['Tables']['word_reviews']['Insert'][] = []

  for (const word of allWords) {
    const existing = reviewMap.get(word)

    if (markedSet.has(word)) {
      // Palavra marcada como difícil
      const base = existing ?? defaultReview(user.id, word, generation.playlist_id)
      const result = onDifficult(base as WordReview)
      const becomeGlobal = existing ? shouldBecomeGlobal({
        ...base,
        distinct_playlist_difficulties: Array.from(
          new Set([...(base.distinct_playlist_difficulties ?? []), generation.playlist_id]),
        ),
      } as WordReview) : false

      const newDistinct = Array.from(
        new Set([...(base.distinct_playlist_difficulties ?? []), generation.playlist_id]),
      )

      upserts.push({
        user_id: user.id,
        word,
        playlist_id: becomeGlobal ? null : generation.playlist_id,
        interval_days: result.intervalDays,
        easiness_factor: result.easinessFactor,
        next_review_at: result.nextReviewAt.toISOString(),
        difficulty_count: (base.difficulty_count ?? 0) + 1,
        review_count: (base.review_count ?? 0) + 1,
        distinct_playlist_difficulties: newDistinct,
        is_global: becomeGlobal,
        last_reviewed_at: new Date().toISOString(),
      })
      reinforced++
    } else if (existing) {
      // Palavra não marcada com review existente → sucesso
      const result = onSuccess(existing)
      upserts.push({
        user_id: user.id,
        word,
        interval_days: result.intervalDays,
        easiness_factor: result.easinessFactor,
        next_review_at: result.nextReviewAt.toISOString(),
        review_count: existing.review_count + 1,
        last_reviewed_at: new Date().toISOString(),
      })
      improved++
    }
    // Palavras sem review existente e não marcadas são ignoradas
  }

  // 6. Upsert em batch
  if (upserts.length > 0) {
    const { error: upsertError } = await serviceSupabase
      .from('word_reviews')
      .upsert(upserts, { onConflict: 'user_id,word' })

    if (upsertError) return err(upsertError.message)
  }

  // 7. Marca generation como reviewed
  await supabase
    .from('generations')
    .update({ reviewed: true })
    .eq('id', generationId)

  return ok({ reinforced, improved })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function defaultReview(
  userId: string,
  word: string,
  playlistId: string,
): Omit<WordReview, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    word,
    playlist_id: playlistId,
    interval_days: 1,
    easiness_factor: 2.5,
    next_review_at: new Date().toISOString(),
    difficulty_count: 0,
    review_count: 0,
    distinct_playlist_difficulties: [],
    is_global: false,
    last_reviewed_at: null,
  }
}
