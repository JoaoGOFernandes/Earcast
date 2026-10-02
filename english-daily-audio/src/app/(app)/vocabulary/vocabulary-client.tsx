'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { overrideWordRelevance } from '@/modules/library/actions'
import type { Database } from '@/types/supabase'

type Vocabulary = Database['public']['Tables']['vocabulary']['Row']
type Text = Database['public']['Tables']['texts']['Row']

interface Props {
  text: Text
  vocabulary: Vocabulary[]
  threshold: number
}

function isActive(word: Vocabulary, threshold: number): boolean {
  if (word.override_active === true) return true
  if (word.override_active === false) return false
  return word.relevance_score >= threshold
}

function WordRow({ word, threshold }: { word: Vocabulary; threshold: number }) {
  const [isPending, startTransition] = useTransition()
  const active = isActive(word, threshold)

  function toggle() {
    startTransition(async () => {
      const result = await overrideWordRelevance({
        vocabularyId: word.id,
        overrideActive: !active,
      })
      if (!result.success) toast.error(result.error)
    })
  }

  function playAudio() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(word.word)
      utterance.lang = 'en-US'
      utterance.rate = 0.9
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
      active ? 'bg-card' : 'bg-muted/30 opacity-60'
    }`}>
      <div className="min-w-0 flex items-center gap-2">
        <button
          onClick={playAudio}
          className="size-7 rounded-full bg-muted/60 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors shrink-0"
          title="Ouvir pronúncia"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>
        <div className="min-w-0">
          <span className="font-medium text-sm capitalize">{word.word}</span>
          {word.relevance_reason && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{word.relevance_reason}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {(word.relevance_score * 100).toFixed(0)}%
        </span>
        <button
          onClick={toggle}
          disabled={isPending}
          title={active ? 'Exclude word' : 'Include word'}
          className={`size-5 rounded-full border-2 transition-colors disabled:opacity-50 ${
            active ? 'bg-primary border-primary' : 'bg-transparent border-muted-foreground'
          }`}
        />
      </div>
    </div>
  )
}

export function VocabularyClient({ text, vocabulary, threshold }: Props) {
  const visible = vocabulary.filter(
    (w) => w.override_active !== null || w.relevance_score > 0,
  )
  const active = visible.filter((w) => isActive(w, threshold))
  const inactive = visible.filter((w) => !isActive(w, threshold))

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <a
          href="/library"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Library
        </a>
        <h1 className="text-2xl font-bold mt-1">{text.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          <span className="font-medium text-foreground">{active.length}</span> active ·{' '}
          {inactive.length} excluded · threshold {(threshold * 100).toFixed(0)}%
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          <p>No vocabulary extracted for this text.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Active ({active.length})
              </h2>
              <div className="space-y-1.5">
                {active.map((w) => <WordRow key={w.id} word={w} threshold={threshold} />)}
              </div>
            </div>
          )}

          {inactive.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Excluded ({inactive.length})
              </h2>
              <div className="space-y-1.5">
                {inactive.map((w) => <WordRow key={w.id} word={w} threshold={threshold} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
