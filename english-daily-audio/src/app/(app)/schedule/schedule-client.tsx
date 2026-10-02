
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { generateForPlaylist, getAudioForGeneration } from '@/modules/generation/actions'
import { mergePlaylistsAction, unmergePlaylistAction } from '@/modules/schedule/actions'
import type { Database } from '@/types/supabase'

type Playlist = Database['public']['Tables']['playlists']['Row']
type Generation = Database['public']['Tables']['generations']['Row']

interface Props {
  playlists: Playlist[]
  latestGenerations: Record<string, Generation>
}

// ─── PlaylistCard ────────────────────────────────────────────────────────────

interface CardProps {
  playlist: Playlist
  latestGeneration: Generation | undefined
  selected: boolean
  onToggleSelect: () => void
}

function PlaylistCard({ playlist, latestGeneration, selected, onToggleSelect }: CardProps) {
  const [isUnmergePending, startUnmergeTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [generation, setGeneration] = useState<Generation | undefined>(latestGeneration)
  const [expanded, setExpanded] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [generationStep, setGenerationStep] = useState<'idle' | 'generating'>('idle')

  // Carrega signed URL ao expandir para gerações já 'ready' ao carregar a página
  async function handleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && generation?.status === 'ready' && generation.audio_path && !signedUrl) {
      const result = await getAudioForGeneration(generation.id)
      if (result.success && result.data.signedUrl) {
        setSignedUrl(result.data.signedUrl)
      }
    }
  }

  async function handleGenerate() {
    setSignedUrl(null)
    setGenerationStep('generating')

    const result = await generateForPlaylist(playlist.id)
    if (!result.success) {
      toast.error(result.error)
      setGenerationStep('idle')
      return
    }

    const audioResult = await getAudioForGeneration(result.data.id)
    const url = audioResult.success ? audioResult.data.signedUrl : null

    setGeneration({
      id: result.data.id,
      user_id: '',
      playlist_id: playlist.id,
      title: result.data.title ?? null,
      text_en: result.data.text_en,
      text_pt: result.data.text_pt,
      audio_path: null,
      word_timestamps: null,
      new_words: null,
      reviewed: false,
      status: 'ready',
      created_at: new Date().toISOString(),
    })
    setSignedUrl(url)
    setExpanded(true)
    setGenerationStep('idle')
    toast.success('Generation ready')
  }

  function handleUnmerge() {
    startUnmergeTransition(async () => {
      const result = await unmergePlaylistAction(playlist.id)
      if (!result.success) {
        toast.error(result.error)
      }
      setConfirming(false)
    })
  }

  const wordCount = generation
    ? generation.text_en.trim().split(/\s+/).length
    : null

  const generationDate = generation
    ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
        new Date(generation.created_at),
      )
    : null

  return (
    <div className={`border rounded-lg bg-card transition-colors ${selected ? 'ring-2 ring-primary' : ''}`}>
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
              aria-label={`Select ${playlist.name} for merge`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{playlist.name}</p>
                {playlist.is_merged && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium shrink-0">
                    merged
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {playlist.source_text_ids.length} source text
                {playlist.source_text_ids.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {playlist.is_merged && (
              confirming ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Unmerge?</span>
                  <Button size="sm" variant="destructive" onClick={handleUnmerge} disabled={isUnmergePending}>
                    {isUnmergePending ? <Loader2Icon className="size-3 animate-spin" /> : 'Yes'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isUnmergePending}>
                    No
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                  Unmerge
                </Button>
              )
            )}
            <Button size="sm" onClick={handleGenerate} disabled={generationStep === 'generating'}>
              {generationStep === 'generating' ? (
                <><Loader2Icon className="size-3 animate-spin" />Generating…</>
              ) : generation ? (
                'Regenerate'
              ) : (
                'Generate'
              )}
            </Button>
          </div>
        </div>

        {/* Dominance bar */}
        {playlist.dominance_score !== null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dominance</span>
              <span>{Math.round((playlist.dominance_score ?? 0) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(playlist.dominance_score ?? 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Latest generation collapsible */}
        {generation && (
          <div className="border-t pt-3 space-y-2">
            <button
              className="w-full flex items-center justify-between text-sm hover:text-foreground text-muted-foreground transition-colors"
              onClick={handleExpand}
              type="button"
            >
              <span className="font-medium">
                Latest generation — {generationDate} · {wordCount} words
              </span>
              {expanded ? (
                <ChevronDownIcon className="size-4 shrink-0" />
              ) : (
                <ChevronRightIcon className="size-4 shrink-0" />
              )}
            </button>

            {expanded && (
              <div className="space-y-3">
                <Tabs defaultValue="en" className="mt-1">
                  <TabsList>
                    <TabsTrigger value="en">English</TabsTrigger>
                    <TabsTrigger value="pt">Português</TabsTrigger>
                  </TabsList>
                  <TabsContent value="en" className="mt-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {generation.text_en}
                    </p>
                  </TabsContent>
                  <TabsContent value="pt" className="mt-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {generation.text_pt}
                    </p>
                  </TabsContent>
                </Tabs>

                {/* Audio player area */}
                {signedUrl && (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={signedUrl} className="w-full" />
                    <Link
                      href={`/player?generationId=${generation.id}`}
                      className="text-xs text-primary hover:underline underline-offset-4"
                    >
                      Open in Player →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ScheduleClient ──────────────────────────────────────────────────────────

export function ScheduleClient({ playlists, latestGenerations }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [mergeName, setMergeName] = useState('')
  const [isMergePending, startMergeTransition] = useTransition()

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openMergeDialog() {
    const names = playlists
      .filter((p) => selectedIds.has(p.id))
      .map((p) => p.name)
    setMergeName(names.join(' + '))
    setShowMergeDialog(true)
  }

  function handleMerge() {
    startMergeTransition(async () => {
      const result = await mergePlaylistsAction(Array.from(selectedIds), mergeName)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Playlists merged')
      setShowMergeDialog(false)
      setSelectedIds(new Set())
    })
  }

  return (
    <>
      <div className="space-y-6 max-w-3xl mx-auto pb-24 md:pb-8">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {playlists.length} active playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>

        {playlists.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <p className="font-medium">No active playlists</p>
            <p className="text-sm mt-1">
              Unlock a text in the Library to create your first playlist.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                latestGeneration={latestGenerations[playlist.id]}
                selected={selectedIds.has(playlist.id)}
                onToggleSelect={() => toggleSelect(playlist.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating merge bar */}
      {selectedIds.size >= 2 && (
        <div className="fixed bottom-24 md:bottom-8 inset-x-0 flex justify-center z-40 px-4 pointer-events-none">
          <div className="bg-background border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <span className="text-sm">{selectedIds.size} playlists selected</span>
            <Button size="sm" onClick={openMergeDialog}>Merge</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Merge dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Merge playlists</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Choose a name for the merged playlist:
            </p>
            <Input
              value={mergeName}
              onChange={(e) => setMergeName(e.target.value)}
              placeholder="Playlist name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mergeName.trim() && !isMergePending) handleMerge()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)} disabled={isMergePending}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={!mergeName.trim() || isMergePending}>
              {isMergePending ? (
                <><Loader2Icon className="size-3 animate-spin" />Merging…</>
              ) : (
                'Confirm merge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
