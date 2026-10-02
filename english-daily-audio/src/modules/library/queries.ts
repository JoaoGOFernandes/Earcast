import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type Text = Database['public']['Tables']['texts']['Row']
type Vocabulary = Database['public']['Tables']['vocabulary']['Row']

export type GlobalVocabWord = Vocabulary & { sourceCount: number }

export async function getUserTexts(): Promise<Text[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getTextById(id: string): Promise<Text | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function getVocabularyByText(textId: string): Promise<Vocabulary[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('source_text_id', textId)
    .order('relevance_score', { ascending: false })

  if (error) throw error
  return data
}

export async function getActiveVocabCountPerText(
  textIds: string[],
  threshold = 0.2,
): Promise<Record<string, number>> {
  if (textIds.length === 0) return {}

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('vocabulary')
    .select('source_text_id, relevance_score, user_override, override_active')
    .in('source_text_id', textIds)

  if (error) return {}

  const counts: Record<string, number> = {}
  for (const row of data) {
    const isActive =
      row.override_active === true ||
      (row.override_active !== false && row.relevance_score >= threshold)

    if (isActive) {
      counts[row.source_text_id] = (counts[row.source_text_id] ?? 0) + 1
    }
  }
  return counts
}

export async function getGlobalVocabulary(): Promise<GlobalVocabWord[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .order('relevance_score', { ascending: false })

  if (error) throw error

  const map = new Map<string, GlobalVocabWord>()
  for (const row of data) {
    const key = row.word.toLowerCase()
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...row, sourceCount: 1 })
    } else {
      existing.sourceCount += 1
      if (row.relevance_score > existing.relevance_score) {
        map.set(key, { ...row, sourceCount: existing.sourceCount })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.relevance_score - a.relevance_score)
}
