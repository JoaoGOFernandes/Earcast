'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { type Result, ok, err } from '@/lib/result'
import { extractCandidateWords } from '@/modules/vocabulary/extractor'
import { scoreWordRelevance } from '@/modules/vocabulary/relevance-scorer'
import { createPlaylistForText } from '@/modules/schedule/playlist-manager'

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null }
  return { supabase, user }
}

// ─── createText ────────────────────────────────────────────────────────────

const CreateTextSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(50),
})

export async function createText(
  input: z.infer<typeof CreateTextSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = CreateTextSchema.safeParse(input)
  if (!parsed.success) return err(parsed.error.message)

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return err('Not authenticated')

  const { data, error } = await supabase
    .from('texts')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      content: parsed.data.content,
    })
    .select('id')
    .single()

  if (error) return err(error.message)

  revalidatePath('/library')
  return ok(data)
}

// ─── unlockText ─────────────────────────────────────────────────────────────
// Pipeline completo:
// 1. Extrai palavras candidatas
// 2. Analisa relevância via Gemini
// 3. Salva vocabulário no banco
// 4. Atualiza status do texto → 'unlocked'
// 5. Cria playlist vinculada

export async function unlockText(textId: string): Promise<Result<{ wordCount: number }>> {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return err('Not authenticated')

  // Busca o texto
  const { data: text, error: textError } = await supabase
    .from('texts')
    .select('*')
    .eq('id', textId)
    .single()

  if (textError || !text) return err('Text not found')
  if (text.status === 'unlocked') return ok({ wordCount: 0 })

  // 1. Tokenização e extração
  const candidates = extractCandidateWords(text.content)
  if (candidates.length === 0) return err('No vocabulary candidates found in text')

  // 2. Análise de relevância via Gemini
  const scoringResult = await scoreWordRelevance(candidates, text.content)
  if (!scoringResult.success) return scoringResult

  // 3. Threshold do usuário (padrão 0.4)
  const { data: settings } = await supabase
    .from('user_settings')
    .select('relevance_threshold')
    .eq('user_id', user.id)
    .single()

  const threshold = settings?.relevance_threshold ?? 0.2

  // 4. Salva TODOS os resultados (inclusive abaixo do threshold, para override manual)
  const vocabRows = scoringResult.data.map(({ word, score, reason }) => ({
    user_id: user.id,
    word,
    source_text_id: textId,
    relevance_score: score,
    relevance_reason: reason ?? null,
  }))

  const { error: vocabError } = await supabase
    .from('vocabulary')
    .upsert(vocabRows, { onConflict: 'user_id,word,source_text_id' })

  if (vocabError) return err(vocabError.message)

  // 5. Marca texto como desbloqueado
  const { error: updateError } = await supabase
    .from('texts')
    .update({ status: 'unlocked' })
    .eq('id', textId)

  if (updateError) return err(updateError.message)

  // 6. Cria playlist automática
  const playlistResult = await createPlaylistForText(textId, text.name)
  if (!playlistResult.success) return playlistResult

  const activeWords = scoringResult.data.filter((w) => w.score >= threshold).length

  revalidatePath('/library')
  return ok({ wordCount: activeWords })
}

// ─── lockText ────────────────────────────────────────────────────────────────

export async function lockText(textId: string): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('texts')
    .update({ status: 'locked' })
    .eq('id', textId)

  if (error) return err(error.message)
  revalidatePath('/library')
  return ok(undefined)
}

// ─── deleteText ───────────────────────────────────────────────────────────────

export async function deleteText(textId: string): Promise<Result<void>> {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return err('Not authenticated')

  // 1. Busca vocabulário deste texto
  const { data: textVocab } = await supabase
    .from('vocabulary')
    .select('word')
    .eq('source_text_id', textId)

  // 2. Para cada palavra, verifica se ela existe em algum OUTRO texto do usuário
  if (textVocab && textVocab.length > 0) {
    const textWords = textVocab.map((v) => v.word)

    const { data: otherVocab } = await supabase
      .from('vocabulary')
      .select('word')
      .eq('user_id', user.id)
      .neq('source_text_id', textId)
      .in('word', textWords)

    const sharedWords = new Set((otherVocab ?? []).map((v) => v.word.toLowerCase()))
    const orphanWords = textWords.filter((w) => !sharedWords.has(w.toLowerCase()))

    // Limpa vocabulário e revisões apenas das palavras orfãs
    if (orphanWords.length > 0) {
      await supabase
        .from('word_reviews')
        .delete()
        .eq('user_id', user.id)
        .in('word', orphanWords)
    }
  }

  // 3. Atualiza ou arquiva playlists ativas que contêm este texto
  const { data: playlists } = await supabase
    .from('playlists')
    .select('id, source_text_ids')
    .eq('status', 'active')
    .contains('source_text_ids', [textId])

  if (playlists && playlists.length > 0) {
    for (const playlist of playlists) {
      const remaining = playlist.source_text_ids.filter((id) => id !== textId)

      if (remaining.length === 0) {
        await supabase
          .from('playlists')
          .update({ status: 'archived', archived_at: new Date().toISOString() })
          .eq('id', playlist.id)
      } else {
        await supabase
          .from('playlists')
          .update({ source_text_ids: remaining })
          .eq('id', playlist.id)
      }
    }
  }

  // 4. Deleta o texto (ON DELETE CASCADE apaga vocabulary rows deste source_text_id)
  const { error } = await supabase.from('texts').delete().eq('id', textId)
  if (error) return err(error.message)

  revalidatePath('/library')
  revalidatePath('/schedule')
  return ok(undefined)
}

// ─── overrideWordRelevance ───────────────────────────────────────────────────

const OverrideSchema = z.object({
  vocabularyId: z.string().uuid(),
  overrideActive: z.boolean(),
})

export async function overrideWordRelevance(
  input: z.infer<typeof OverrideSchema>,
): Promise<Result<void>> {
  const parsed = OverrideSchema.safeParse(input)
  if (!parsed.success) return err(parsed.error.message)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('vocabulary')
    .update({
      user_override: true,
      override_active: parsed.data.overrideActive,
    })
    .eq('id', parsed.data.vocabularyId)

  if (error) return err(error.message)
  return ok(undefined)
}
