import { notFound, redirect } from 'next/navigation'
import { getTextById, getVocabularyByText } from '@/modules/library/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { VocabularyClient } from './vocabulary-client'

interface Props {
  searchParams: Promise<{ textId?: string }>
}

export default async function VocabularyPage({ searchParams }: Props) {
  const { textId } = await searchParams
  if (!textId) redirect('/library')

  const supabase = await createSupabaseServerClient()
  const [text, vocabulary, { data: settings }] = await Promise.all([
    getTextById(textId),
    getVocabularyByText(textId),
    supabase.from('user_settings').select('relevance_threshold').single(),
  ])

  if (!text) notFound()

  return (
    <VocabularyClient
      text={text}
      vocabulary={vocabulary}
      threshold={settings?.relevance_threshold ?? 0.2}
    />
  )
}
