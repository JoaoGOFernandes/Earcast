import { getGlobalVocabulary } from '@/modules/library/queries'
import type { GlobalVocabWord } from '@/modules/library/queries'

function isActive(word: GlobalVocabWord, threshold: number): boolean {
  if (word.override_active === true) return true
  if (word.override_active === false) return false
  return word.relevance_score >= threshold
}

function WordRow({ word, threshold }: { word: GlobalVocabWord; threshold: number }) {
  const active = isActive(word, threshold)

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
      active ? 'bg-card' : 'bg-muted/30 opacity-60'
    }`}>
      <div className="min-w-0">
        <span className="font-medium text-sm">{word.word}</span>
        {word.relevance_reason && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{word.relevance_reason}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {word.sourceCount > 1 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {word.sourceCount} texts
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {(word.relevance_score * 100).toFixed(0)}%
        </span>
        <div className={`size-5 rounded-full border-2 shrink-0 ${
          active ? 'bg-primary border-primary' : 'bg-transparent border-muted-foreground'
        }`} />
      </div>
    </div>
  )
}

interface Props {
  threshold: number
}

export async function GlobalVocabSection({ threshold }: Props) {
  const all = await getGlobalVocabulary()
  const visible = all.filter((w) => w.override_active !== null || w.relevance_score > 0)
  const active = visible.filter((w) => isActive(w, threshold))
  const inactive = visible.filter((w) => !isActive(w, threshold))

  if (visible.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center text-muted-foreground">
        <p className="font-medium">No vocabulary yet</p>
        <p className="text-sm mt-1">
          Unlock a text to start extracting vocabulary.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{active.length}</span> active ·{' '}
        {inactive.length} excluded · {visible.length} unique words
      </p>

      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Active ({active.length})
          </h2>
          <div className="space-y-1.5">
            {active.map((w) => (
              <WordRow key={w.id} word={w} threshold={threshold} />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Excluded ({inactive.length})
          </h2>
          <div className="space-y-1.5">
            {inactive.map((w) => (
              <WordRow key={w.id} word={w} threshold={threshold} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function GlobalVocabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-40 rounded bg-muted" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-muted/30">
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted" />
          </div>
          <div className="h-3 w-8 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
