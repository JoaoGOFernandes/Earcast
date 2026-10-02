import { Suspense } from 'react'
import { getUserTexts, getActiveVocabCountPerText } from '@/modules/library/queries'
import { ImportDialog } from '@/modules/library/components/import-dialog'
import { TextCard } from '@/modules/library/components/text-card'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LibraryTabs } from './library-tabs'
import { GlobalVocabSection, GlobalVocabSkeleton } from './global-vocab-section'

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient()

  const [texts, { data: settings }] = await Promise.all([
    getUserTexts(),
    supabase.from('user_settings').select('relevance_threshold').single(),
  ])

  const threshold = settings?.relevance_threshold ?? 0.2
  const unlockedIds = texts.filter((t) => t.status === 'unlocked').map((t) => t.id)
  const [vocabCounts, { data: globalVocab }] = await Promise.all([
    getActiveVocabCountPerText(unlockedIds, threshold),
    supabase
      .from('vocabulary')
      .select('word')
      .gt('relevance_score', 0),
  ])

  const knownVocabWords = new Set((globalVocab ?? []).map((v) => v.word.toLowerCase()))

  const textsContent = (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <li>
        <ImportDialog variant="card" />
      </li>
      {texts.map((text) => (
        <li key={text.id}>
          <TextCard
            text={text}
            vocabCount={vocabCounts[text.id]}
            knownVocabWords={knownVocabWords}
          />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <LibraryTabs
        textCount={texts.length}
        textsContent={textsContent}
        vocabContent={
          <Suspense fallback={<GlobalVocabSkeleton />}>
            <GlobalVocabSection threshold={threshold} />
          </Suspense>
        }
      />
    </div>
  )
}
