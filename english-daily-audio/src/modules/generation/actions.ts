'use server'

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { type Result, ok, err } from '@/lib/result'
import { buildGenerationPrompt } from './prompt-builder'
import { generateEnglishText, translateToPt } from './translator'
import { synthesizeWithWordTimestamps } from '@/lib/google-tts'

// ─── getTodayGenerations ─────────────────────────────────────────────────────

export type GenerationQueueItem = {
  id: string
  title: string | null
  text_en: string
  text_pt: string
  audio_path: string | null
  playlist_id: string
  reviewed: boolean
  created_at: string
  word_timestamps: { word: string; start_ms: number; end_ms: number }[] | null
  playlist: { name: string; source_text_ids: string[] }
  sourceTextNames: string[]
}

function parseTitleAndText(raw: string): { title: string | null; text: string } {
  const lines = raw.split('\n')
  const firstLine = lines[0].trim()
  if (firstLine.startsWith('TITLE:')) {
    const title = firstLine.replace(/^TITLE:\s*/, '').trim() || null
    let bodyStart = 1
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++
    return { title, text: lines.slice(bodyStart).join('\n').trim() }
  }
  return { title: null, text: raw }
}

export async function getTodayGenerations(): Promise<GenerationQueueItem[]> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // "Today" = qualquer geração ready e não reviewed (pode ser de dias anteriores)
  const { data: generations } = await supabase
    .from('generations')
    .select('id, title, text_en, text_pt, audio_path, playlist_id, reviewed, created_at, word_timestamps, playlists(name, source_text_ids)')
    .eq('status', 'ready')
    .eq('reviewed', false)
    .order('created_at', { ascending: false })

  if (!generations || generations.length === 0) return []

  // Coleta todos os source_text_ids únicos para buscar nomes em batch
  const allTextIds = Array.from(new Set(
    generations.flatMap((g) => {
      const p = g.playlists as { name: string; source_text_ids: string[] } | null
      return p?.source_text_ids ?? []
    }),
  ))

  let textNames: Record<string, string> = {}
  if (allTextIds.length > 0) {
    const { data: texts } = await supabase
      .from('texts')
      .select('id, name')
      .in('id', allTextIds)
    textNames = Object.fromEntries((texts ?? []).map((t) => [t.id, t.name]))
  }

  return generations.map((g) => {
    const playlist = g.playlists as { name: string; source_text_ids: string[] } | null
    const sourceTextIds = playlist?.source_text_ids ?? []
    return {
      id: g.id,
      title: (g as { title?: string | null }).title ?? null,
      text_en: g.text_en,
      text_pt: g.text_pt,
      audio_path: g.audio_path,
      playlist_id: g.playlist_id,
      reviewed: g.reviewed,
      created_at: g.created_at,
      word_timestamps: (g.word_timestamps as { word: string; start_ms: number; end_ms: number }[] | null) ?? null,
      playlist: { name: playlist?.name ?? '—', source_text_ids: sourceTextIds },
      sourceTextNames: sourceTextIds.map((id) => textNames[id]).filter(Boolean),
    }
  })
}

export async function generateForPlaylist(
  playlistId: string,
): Promise<Result<{ id: string; title: string | null; text_en: string; text_pt: string }>> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return err('Not authenticated')

  // 1. Busca playlist + config
  const { data: playlist, error: playlistError } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', playlistId)
    .single()

  if (playlistError || !playlist) return err('Playlist not found')

  const { data: config, error: configError } = await supabase
    .from('playlist_configs')
    .select('*')
    .eq('playlist_id', playlistId)
    .single()

  if (configError || !config) return err('Playlist config not found')

  // 2. Busca threshold do usuário
  const { data: settings } = await supabase
    .from('user_settings')
    .select('relevance_threshold')
    .eq('user_id', user.id)
    .single()

  const threshold = settings?.relevance_threshold ?? 0.2

  // 3. Busca vocabulário ativo das source texts (mesmo padrão de getActiveVocabCountPerText)
  const { data: vocabRows, error: vocabError } = await supabase
    .from('vocabulary')
    .select('word, relevance_score, user_override, override_active')
    .in('source_text_id', playlist.source_text_ids)
    .gte('relevance_score', 0)

  if (vocabError) return err(vocabError.message)

  // Filtra palavras ativas em JS e deduplica por palavra (mantém maior score)
  const wordMap = new Map<string, { word: string; score: number }>()
  for (const row of vocabRows) {
    const isActive =
      row.override_active === true ||
      (row.override_active !== false && row.relevance_score >= threshold)

    if (!isActive) continue

    const key = row.word.toLowerCase()
    const existing = wordMap.get(key)
    if (!existing || row.relevance_score > existing.score) {
      wordMap.set(key, { word: row.word, score: row.relevance_score })
    }
  }

  const activeWords = Array.from(wordMap.values()).sort((a, b) => b.score - a.score)

  if (activeWords.length === 0) return err('No active vocabulary found for this playlist')

  // 4. top-10 como featured; resto como pool
  const featuredWords = activeWords.slice(0, 10).map((w) => w.word)
  const vocabularyPool = activeWords.slice(10).map((w) => w.word)

  // 5. Gera prompt + texto EN
  const prompt = buildGenerationPrompt({
    config,
    targetWords: featuredWords,
    vocabularyPool,
  })

  const englishResult = await generateEnglishText(prompt)
  if (!englishResult.success) return englishResult

  // 6. Extrai título + corpo do texto gerado
  const { title, text: bodyText } = parseTitleAndText(englishResult.data)

  // 7. Traduz para PT (apenas o corpo, sem o prefixo TITLE:)
  const ptResult = await translateToPt(bodyText)
  if (!ptResult.success) return ptResult

  // 8. Gera áudio + timestamps sincronamente via Google Cloud TTS
  const ttsResult = await synthesizeWithWordTimestamps(bodyText)

  // 9. Upload MP3 para Supabase Storage (service role — bucket policy exige)
  const serviceSupabase = createSupabaseServiceClient()
  const audioBuffer = Buffer.from(ttsResult.audioBase64, 'base64')
  const audioPath = `${crypto.randomUUID()}/audio.mp3`

  const { error: uploadError } = await serviceSupabase.storage
    .from('audio')
    .upload(audioPath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) return err(`Storage upload failed: ${uploadError.message}`)

  // 10. Salva generation com status 'ready' e timestamps incluídos
  const { data: generation, error: insertError } = await serviceSupabase
    .from('generations')
    .insert({
      user_id: user.id,
      playlist_id: playlistId,
      title,
      text_en: bodyText,
      text_pt: ptResult.data,
      new_words: featuredWords,
      audio_path: audioPath,
      word_timestamps: ttsResult.wordTimestamps as unknown as import('@/types/supabase').Json[],
      status: 'ready',
    })
    .select('id')
    .single()

  if (insertError) return err(insertError.message)

  return ok({ id: generation.id, title, text_en: bodyText, text_pt: ptResult.data })
}

// ─── getAudioForGeneration ───────────────────────────────────────────────────

export async function getAudioForGeneration(
  generationId: string,
): Promise<Result<{ status: string; signedUrl: string | null }>> {
  const supabase = await createSupabaseServerClient()

  const { data: generation, error } = await supabase
    .from('generations')
    .select('status, audio_path')
    .eq('id', generationId)
    .single()

  if (error || !generation) return err('Generation not found')

  if (!generation.audio_path) {
    return ok({ status: generation.status, signedUrl: null })
  }

  // Signed URL exige service role — política do bucket só permite service_role
  const serviceSupa = createSupabaseServiceClient()
  const { data: urlData, error: urlError } = await serviceSupa.storage
    .from('audio')
    .createSignedUrl(generation.audio_path, 3600)

  if (urlError || !urlData) return err('Failed to create signed URL')

  return ok({ status: generation.status, signedUrl: urlData.signedUrl })
}
