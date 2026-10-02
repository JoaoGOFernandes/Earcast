'use client'

import { useState, useRef, useEffect, useTransition, useCallback } from 'react'
import Link from 'next/link'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Loader2Icon,
  CheckIcon,
  XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { markWordForReview, processSessionEnd } from '@/modules/player/actions'
import type { GenerationQueueItem } from '@/modules/generation/actions'

interface Props {
  generations: GenerationQueueItem[]
  initialId: string
  signedUrls: Record<string, string>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Token {
  type: 'word' | 'space' | 'newline'
  value: string
  wordIndex?: number
}

type WordTimestamp = { word: string; start_ms: number; end_ms: number }

function tokenizeText(text: string): Token[] {
  const tokens: Token[] = []
  let wordIndex = 0
  const parts = text.split(/(\n+|\s+)/)
  for (const part of parts) {
    if (!part) continue
    if (part.includes('\n')) {
      tokens.push({ type: 'newline', value: part })
    } else if (/^\s+$/.test(part)) {
      tokens.push({ type: 'space', value: part })
    } else {
      tokens.push({ type: 'word', value: part, wordIndex: wordIndex++ })
    }
  }
  return tokens
}

function groupIntoLines(tokens: Token[], wordsPerLine = 9): Token[][] {
  const lines: Token[][] = []
  let currentLine: Token[] = []
  let wordCount = 0
  for (const token of tokens) {
    if (token.type === 'newline') {
      if (currentLine.length > 0) lines.push(currentLine)
      currentLine = []
      wordCount = 0
    } else {
      currentLine.push(token)
      if (token.type === 'word') {
        wordCount++
        if (wordCount >= wordsPerLine) {
          lines.push(currentLine)
          currentLine = []
          wordCount = 0
        }
      }
    }
  }
  if (currentLine.length > 0) lines.push(currentLine)
  return lines
}

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z'-]/g, '')
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// ─── Dot helper — deterministic className avoids SSR/client mismatch ─────────

function getDotClassName(isActive: boolean, isDone: boolean): string {
  if (isActive) return 'rounded-full transition-all w-3.5 h-3.5 border-2 border-primary bg-primary'
  if (isDone)   return 'rounded-full transition-all w-2.5 h-2.5 border-2 border-green-500 bg-green-500'
  return 'rounded-full transition-all w-2.5 h-2.5 border-2 border-muted-foreground bg-transparent'
}

// ─── PlayingBars ──────────────────────────────────────────────────────────────

function PlayingBars() {
  return (
    <div className="flex items-end gap-[2px] h-3 shrink-0">
      {[0, 150, 75].map((delay, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-primary animate-bounce"
          style={{ animationDelay: `${delay}ms`, height: `${[8, 12, 10][i]}px` }}
        />
      ))}
    </div>
  )
}

// ─── PlayerClient ─────────────────────────────────────────────────────────────

export function PlayerClient({ generations, initialId, signedUrls }: Props) {
  // Web Audio API
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const startTimeRef = useRef<number>(0)
  const startOffsetRef = useRef<number>(0)
  const isPlayingRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)

  // Queue / navigation
  const [activeId, setActiveId] = useState(initialId)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [allDone, setAllDone] = useState(false)

  // Swipe / slide (mobile)
  const touchStartX = useRef(0)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [isSliding, setIsSliding] = useState(false)
  const pendingNavId = useRef<string | null>(null)

  // Playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)

  // Text display
  const [displayMode, setDisplayMode] = useState<'en' | 'pt' | 'both'>('both')
  const [viewMode, setViewMode] = useState<'full' | 'karaoke'>('karaoke')
  const [currentLine, setCurrentLine] = useState(0)

  // Session / complete
  const [audioCompleted, setAudioCompleted] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('earcast-auto-advance') === 'true'
  })
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const sessionTriggered = useRef<Set<string>>(new Set())

  // Word marking: Map<generationId, Set<cleanWord>>
  const [markedWords, setMarkedWords] = useState<Map<string, Set<string>>>(new Map())

  // Drag selection
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)
  const [dragCurrentIndex, setDragCurrentIndex] = useState<number | null>(null)
  const isDragging = useRef(false)
  const [popover, setPopover] = useState<{ words: string[]; x: number; y: number } | null>(null)

  // Word sync (karaoke highlight)
  const LINE_HEIGHT = 56
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const karaokeRef = useRef<HTMLDivElement>(null)
  const karaokeContainerRef = useRef<HTMLDivElement>(null)
  const scrollAnimRef = useRef<number | null>(null)
  const currentWordIndexRef = useRef(-1)
  const currentLineRef = useRef(0)
  const linesRef = useRef<Token[][]>([])
  const rafRef = useRef<number | null>(null)

  const activeGen = generations.find((g) => g.id === activeId)

  if (!activeGen) {
    const first = generations.find((g) => !completedIds.has(g.id))
    if (first) setActiveId(first.id)
    return null
  }

  const tokens = tokenizeText(activeGen.text_en)
  const lines = groupIntoLines(tokens)
  linesRef.current = lines
  const activeMarked = markedWords.get(activeId) ?? new Set<string>()

  const pendingGenerations = generations.filter((g) => !completedIds.has(g.id))
  const activeIndex = pendingGenerations.findIndex((g) => g.id === activeId)
  const completedCount = completedIds.size
  const isDone = activeGen.reviewed || completedIds.has(activeId)

  // Display title: use generated title if available, else playlist name
  const displayTitle = activeGen.title ?? activeGen.playlist.name
  const displaySubtitle = activeGen.title ? activeGen.playlist.name : activeGen.sourceTextNames.join(' · ')

  // ─── Audio lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    const url = signedUrls[activeId]

    // Stop any current playback and reset state
    isPlayingRef.current = false
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null
      sourceNodeRef.current.stop()
      sourceNodeRef.current = null
    }
    startOffsetRef.current = 0
    audioBufferRef.current = null
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setCurrentLine(0)
    currentLineRef.current = 0
    setAudioCompleted(false)
    setCountdown(null)

    if (!url) return
    setIsLoading(true)

    audioContextRef.current?.close()
    const ctx = new AudioContext()
    audioContextRef.current = ctx

    let cancelled = false
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return
        audioBufferRef.current = decoded
        setDuration(decoded.duration)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[player] Failed to load audio:', err)
        setIsLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  useEffect(() => {
    if (sourceNodeRef.current) sourceNodeRef.current.playbackRate.value = playbackRate
  }, [playbackRate])

  // ─── Word sync (karaoke highlight) ──────────────────────────────────────────

  // Reset highlight when generation changes
  useEffect(() => {
    setCurrentWordIndex(-1)
  }, [activeId])

  // Sync word highlight + progress at 60fps when playing
  useEffect(() => {
    if (!isPlaying || !activeGen?.word_timestamps?.length) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      return
    }

    const timestamps = activeGen.word_timestamps as WordTimestamp[]

    const tick = () => {
      const ms = getAccurateCurrentTime() * 1000
      setCurrentTime(ms / 1000)

      let idx = -1
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (ms >= timestamps[i].start_ms) { idx = i; break }
      }

      if (idx !== currentWordIndexRef.current) {
        currentWordIndexRef.current = idx
        setCurrentWordIndex(idx)
        const newLine = linesRef.current.findIndex((line) =>
          line.some((t) => t.type === 'word' && t.wordIndex === idx),
        )
        if (newLine >= 0) {
          setCurrentLine((prev) => {
            const nextLine = Math.min(newLine, prev + 1)
            currentLineRef.current = nextLine
            return nextLine
          })
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeGen?.id, activeGen?.word_timestamps])

  // Scroll karaoke container to keep current line centred
  useEffect(() => {
    if (!karaokeContainerRef.current) return
    const container = karaokeContainerRef.current
    const targetScroll = currentLine * LINE_HEIGHT

    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current)

    // Lê scrollTop num frame posterior para garantir que o browser renderizou
    scrollAnimRef.current = requestAnimationFrame(() => {
      const startScroll = container.scrollTop
      if (Math.abs(startScroll - targetScroll) < 2) return

      const duration = 1200
      const startTime = performance.now()

      function animate(currentTime: number) {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2
        container.scrollTop = startScroll + (targetScroll - startScroll) * ease
        if (progress < 1) {
          scrollAnimRef.current = requestAnimationFrame(animate)
        } else {
          scrollAnimRef.current = null
        }
      }
      requestAnimationFrame(animate)
    })

    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current)
    }
  }, [currentLine])

  // ─── Auto-advance countdown ──────────────────────────────────────────────────

  useEffect(() => {
    if (!audioCompleted || !autoAdvance || isDone) return

    let remaining = 3
    setCountdown(remaining)

    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        setCountdown(null)
        handleCompleteAndAdvance()
      } else {
        setCountdown(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioCompleted, autoAdvance])

  // ─── Web Audio playback controls ────────────────────────────────────────────

  function getAccurateCurrentTime(): number {
    const ctx = audioContextRef.current
    if (!ctx || !isPlayingRef.current) return startOffsetRef.current
    return startOffsetRef.current + (ctx.currentTime - startTimeRef.current)
  }

  function play() {
    const ctx = audioContextRef.current
    const buffer = audioBufferRef.current
    if (!ctx || !buffer) return
    if (ctx.state === 'suspended') ctx.resume()

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRate
    source.connect(ctx.destination)
    source.start(0, Math.max(0, startOffsetRef.current))
    source.onended = () => {
      if (isPlayingRef.current) {
        isPlayingRef.current = false
        setIsPlaying(false)
        setAudioCompleted(true)
      }
    }
    sourceNodeRef.current = source
    startTimeRef.current = ctx.currentTime
    isPlayingRef.current = true
    setIsPlaying(true)
  }

  function pause() {
    const ctx = audioContextRef.current
    if (!ctx || !sourceNodeRef.current) return
    startOffsetRef.current = Math.min(
      startOffsetRef.current + (ctx.currentTime - startTimeRef.current),
      audioBufferRef.current?.duration ?? Infinity,
    )
    isPlayingRef.current = false
    sourceNodeRef.current.onended = null
    sourceNodeRef.current.stop()
    sourceNodeRef.current = null
    setIsPlaying(false)
  }

  function seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, audioBufferRef.current?.duration ?? 0))
    const wasPlaying = isPlayingRef.current
    if (wasPlaying) {
      isPlayingRef.current = false
      if (sourceNodeRef.current) { sourceNodeRef.current.onended = null; sourceNodeRef.current.stop(); sourceNodeRef.current = null }
    }
    startOffsetRef.current = target
    setCurrentTime(target)
    if (wasPlaying) play()
  }

  function togglePlay() {
    if (!audioBufferRef.current || isLoading) return
    if (isPlayingRef.current) pause()
    else play()
  }

  function skip(seconds: number) {
    seek(getAccurateCurrentTime() + seconds)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    seek(Number(e.target.value))
  }

  function navigateTo(id: string) {
    setActiveId(id)
    setDragStartIndex(null)
    setDragCurrentIndex(null)
    setPopover(null)
  }

  function goToPrev() {
    const idx = pendingGenerations.findIndex((g) => g.id === activeId)
    if (idx > 0) navigateTo(pendingGenerations[idx - 1].id)
  }

  function goToNext() {
    const idx = pendingGenerations.findIndex((g) => g.id === activeId)
    if (idx < pendingGenerations.length - 1) navigateTo(pendingGenerations[idx + 1].id)
  }

  // ─── Swipe navigation (mobile) ───────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) < 50) return

    const allIds = generations.map((g) => g.id)
    const currentIdx = allIds.indexOf(activeId)

    if (delta < -50 && currentIdx < allIds.length - 1) {
      pendingNavId.current = allIds[currentIdx + 1]
      setSlideDirection('left')
    } else if (delta > 50 && currentIdx > 0) {
      pendingNavId.current = allIds[currentIdx - 1]
      setSlideDirection('right')
    } else {
      return
    }

    setIsSliding(true)
    setTimeout(() => {
      if (pendingNavId.current) {
        navigateTo(pendingNavId.current)
        pendingNavId.current = null
      }
      setIsSliding(false)
      setSlideDirection(null)
    }, 200)
  }

  // ─── Word marking ────────────────────────────────────────────────────────────

  const getSelectedRange = useCallback((): number[] => {
    if (dragStartIndex === null || dragCurrentIndex === null) return []
    const lo = Math.min(dragStartIndex, dragCurrentIndex)
    const hi = Math.max(dragStartIndex, dragCurrentIndex)
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  }, [dragStartIndex, dragCurrentIndex])

  function handleWordMouseDown(e: React.MouseEvent, wordIndex: number) {
    e.preventDefault()
    isDragging.current = true
    setDragStartIndex(wordIndex)
    setDragCurrentIndex(wordIndex)
    setPopover(null)
  }

  function handleWordMouseOver(wordIndex: number) {
    if (!isDragging.current) return
    setDragCurrentIndex(wordIndex)
  }

  function handleWordMouseUp(e: React.MouseEvent, wordIndex: number) {
    if (!isDragging.current) return
    isDragging.current = false
    setDragCurrentIndex(wordIndex)

    const range = getSelectedRange()
    const wordTokens = tokens.filter((t) => t.type === 'word' && range.includes(t.wordIndex!))
    const selectedValues = wordTokens.map((t) => t.value)
    if (selectedValues.length === 0) return

    setPopover({ words: selectedValues, x: e.clientX, y: e.clientY })
  }

  function handleMarkDifficult() {
    if (!popover) return
    const phrase = popover.words.length > 1 ? popover.words.join(' ') : undefined
    const word = cleanWord(popover.words[0])
    if (!word) { setPopover(null); return }

    setMarkedWords((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(activeId) ?? [])
      popover.words.forEach((w) => set.add(cleanWord(w)))
      next.set(activeId, set)
      return next
    })

    startTransition(async () => {
      const result = await markWordForReview({
        generationId: activeId,
        playlistId: activeGen!.playlist_id,
        word,
        phrase,
        mode: 'reading',
      })
      if (!result.success) toast.error('Failed to mark word')
    })

    setPopover(null)
    setDragStartIndex(null)
    setDragCurrentIndex(null)
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-popover]')) setPopover(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ─── Session completion ───────────────────────────────────────────────────────

  function handleCompleteAndAdvance() {
    if (sessionTriggered.current.has(activeId) || isDone) return
    sessionTriggered.current.add(activeId)
    setCountdown(null)

    const capturedId = activeId
    const capturedCompleted = completedIds

    startTransition(async () => {
      const result = await processSessionEnd(capturedId)
      if (!result.success) {
        toast.error('Failed to process session')
        sessionTriggered.current.delete(capturedId)
        return
      }

      const newCompleted = new Set(capturedCompleted)
      newCompleted.add(capturedId)
      setCompletedIds(newCompleted)

      const remaining = generations.filter((g) => !newCompleted.has(g.id))
      if (remaining.length === 0) {
        setAllDone(true)
      } else {
        navigateTo(remaining[0].id)
        toast.success(`Session done · ${result.data.reinforced} reinforced, ${result.data.improved} improved`)
      }
    })
  }

  function toggleAutoAdvance() {
    const next = !autoAdvance
    setAutoAdvance(next)
    localStorage.setItem('earcast-auto-advance', String(next))
    if (!next) setCountdown(null)
  }

  // ─── All done screen ─────────────────────────────────────────────────────────

  if (allDone) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <div className="flex items-center justify-center size-16 rounded-full bg-primary/10 mx-auto">
          <CheckIcon className="size-8 text-primary" />
        </div>
        <p className="text-2xl font-bold">All caught up for today!</p>
        <p className="text-muted-foreground text-sm">
          You studied {completedCount} session{completedCount !== 1 ? 's' : ''}.
        </p>
        <Link href="/schedule">
          <Button className="mt-2">Back to Schedule</Button>
        </Link>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const selectedRange = getSelectedRange()

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 -mx-4 md:-mx-8 h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden">

      {/* ═══════════════ DESKTOP SIDEBAR ══════════════════════════════════════ */}
      <aside className="hidden md:flex flex-col w-[280px] shrink-0 border-r overflow-y-auto">
        <div className="px-4 pt-5 pb-3 border-b">
          <p className="font-semibold text-sm">Today&apos;s Study</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} of {generations.length} completed
          </p>
        </div>
        <QueueList
          generations={generations}
          activeId={activeId}
          completedIds={completedIds}
          isPlaying={isPlaying}
          onSelect={navigateTo}
        />
      </aside>

      {/* ═══════════════════════ MAIN ════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Swipeable content wrapper */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{
            transform: isSliding
              ? `translateX(${slideDirection === 'left' ? '-100%' : '100%'})`
              : 'translateX(0)',
            transition: isSliding ? 'transform 200ms ease-in-out' : 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >

          {/* ── ZONE 1: dots (mobile) + header + karaoke + controls (~50vh) ──── */}
          <div className="h-[50vh] shrink-0 flex flex-col px-4 md:px-8 pt-2 md:pt-4 pb-3 gap-1.5">

            {/* Mobile: dot navigation */}
            <div className="md:hidden flex flex-col items-center gap-1 shrink-0" suppressHydrationWarning>
              <div className="flex items-center justify-center gap-3 py-1">
                {generations.map((g) => {
                  const isActive = g.id === activeId
                  const isDoneG = completedIds.has(g.id)
                  return (
                    <button key={g.id} onClick={() => navigateTo(g.id)} className="flex items-center justify-center">
                      <div className={getDotClassName(isActive, isDoneG)} />
                    </button>
                  )
                })}
              </div>
              <p className="text-center text-sm font-medium leading-tight truncate max-w-[80vw]">
                {displayTitle}
              </p>
            </div>

            {/* Desktop header */}
            <div className="hidden md:flex items-start justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h1 className="font-bold text-base leading-tight truncate">{displayTitle}</h1>
                {displaySubtitle && (
                  <p className="text-xs text-muted-foreground truncate">{displaySubtitle}</p>
                )}
                <p className="text-xs text-muted-foreground/60">{relativeDate(activeGen.created_at)}</p>
              </div>
              {/* Karaoke / Full toggle */}
              <button
                onClick={() => setViewMode((v) => v === 'full' ? 'karaoke' : 'full')}
                className={`shrink-0 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  viewMode === 'karaoke'
                    ? 'bg-foreground text-background font-medium border-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {viewMode === 'karaoke' ? 'Karaoke' : 'Full'}
              </button>
            </div>

            {/* Mobile: karaoke toggle (above karaoke area) */}
            <div className="md:hidden flex justify-end shrink-0">
              <button
                onClick={() => setViewMode((v) => v === 'full' ? 'karaoke' : 'full')}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  viewMode === 'karaoke'
                    ? 'bg-foreground text-background font-medium border-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {viewMode === 'karaoke' ? 'Karaoke' : 'Full'}
              </button>
            </div>

            {/* Karaoke display — teleprompter */}
            {viewMode === 'karaoke' ? (
              <div
                ref={karaokeContainerRef}
                className="overflow-hidden select-none"
                style={{ height: LINE_HEIGHT * 3 }}
              >
                <div style={{ paddingTop: LINE_HEIGHT }}>
                  {lines.map((lineTokens, lineIdx) => {
                    const isActiveLine = lineIdx === currentLine
                    const isAdjacent = Math.abs(lineIdx - currentLine) === 1
                    return (
                      <div
                        key={lineIdx}
                        style={{
                          height: LINE_HEIGHT,
                          opacity: isActiveLine ? 1 : isAdjacent ? 0.35 : 0.08,
                        }}
                        className="flex items-center justify-center gap-1 flex-wrap text-base font-bold transition-opacity duration-700 px-4"
                      >
                        {lineTokens.map((token, tokenIdx) => {
                          if (token.type !== 'word') return null
                          const wi = token.wordIndex ?? -1
                          const clean = cleanWord(token.value)
                          const isMarked = activeMarked.has(clean)
                          const isCurrent = wi === currentWordIndex
                          const isSelected = selectedRange.includes(wi)
                          return (
                            <span
                              key={tokenIdx}
                              data-word-index={wi}
                              onMouseDown={(e) => handleWordMouseDown(e, wi)}
                              onMouseOver={() => handleWordMouseOver(wi)}
                              onMouseUp={(e) => handleWordMouseUp(e, wi)}
                              className={cn(
                                'cursor-pointer rounded px-0.5 transition-all duration-100',
                                isMarked
                                  ? 'bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-300'
                                  : isCurrent && isActiveLine
                                    ? 'bg-primary/20'
                                    : isSelected
                                      ? 'bg-primary/15'
                                      : '',
                              )}
                            >
                              {token.value}
                            </span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums shrink-0">
              <span className="w-7 text-right">{formatTime(currentTime)}</span>
              <div className="relative flex-1 h-1 rounded-full bg-muted group cursor-pointer">
                <div
                  className="absolute inset-y-0 left-0 bg-foreground rounded-full pointer-events-none"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-3 bg-background border-2 border-foreground rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="w-7">{formatTime(duration)}</span>
            </div>

            {/* Controls row */}
            <div className="relative flex items-center justify-center shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={goToPrev}
                  disabled={activeIndex <= 0}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Previous"
                >
                  <SkipBackIcon className="size-4" />
                </button>
                <button
                  onClick={() => skip(-5)}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Back 5s"
                >
                  <span className="flex items-center gap-0.5 text-xs font-medium">
                    <SkipBackIcon className="size-3.5" />5
                  </span>
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!audioBufferRef.current || isLoading}
                  className="size-11 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
                >
                  {isPlaying
                    ? <PauseIcon className="size-4 fill-current" />
                    : <PlayIcon className="size-4 fill-current ml-0.5" />}
                </button>
                <button
                  onClick={() => skip(5)}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Forward 5s"
                >
                  <span className="flex items-center gap-0.5 text-xs font-medium">
                    5<SkipForwardIcon className="size-3.5" />
                  </span>
                </button>
                <button
                  onClick={goToNext}
                  disabled={activeIndex >= pendingGenerations.length - 1}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Next"
                >
                  <SkipForwardIcon className="size-4" />
                </button>
              </div>
              {/* Speed pills — absolute right */}
              <div className="absolute right-0 flex items-center gap-1">
                {([0.5, 0.75, 1, 1.25] as const).map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                      playbackRate === rate
                        ? 'bg-foreground text-background font-medium'
                        : 'text-muted-foreground hover:text-foreground border'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── DIVIDER ─────────────────────────────────────────────────────────── */}
          <div className="border-t shrink-0" />

          {/* ── ZONE 2: full text + tabs (scrollable) ───────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-4 pb-36 space-y-4">

            {/* Tab bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/40">
                {(['en', 'pt', 'both'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDisplayMode(mode)}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${
                      displayMode === mode
                        ? 'bg-background shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'en' ? 'EN' : mode === 'pt' ? 'PT' : 'EN + PT'}
                  </button>
                ))}
              </div>
              {activeMarked.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {activeMarked.size} word{activeMarked.size !== 1 ? 's' : ''} marked
                </p>
              )}
            </div>

            {/* Text content */}
            <div className={`grid gap-6 ${displayMode === 'both' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {(displayMode === 'en' || displayMode === 'both') && (
                <div
                  className="text-sm leading-8 cursor-text select-none"
                  onMouseLeave={() => { if (isDragging.current) isDragging.current = false }}
                >
                  {tokens.map((token, i) => {
                    if (token.type === 'newline') return <br key={i} />
                    if (token.type === 'space') return <span key={i}>{token.value}</span>

                    const wi = token.wordIndex!
                    const clean = cleanWord(token.value)
                    const isMarked = activeMarked.has(clean)
                    const isSelected = selectedRange.includes(wi)
                    const isCurrent = wi === currentWordIndex

                    return (
                      <span
                        key={i}
                        data-word-index={wi}
                        onMouseDown={(e) => handleWordMouseDown(e, wi)}
                        onMouseOver={() => handleWordMouseOver(wi)}
                        onMouseUp={(e) => handleWordMouseUp(e, wi)}
                        className={`rounded px-0.5 cursor-pointer transition-all ${
                          isMarked
                            ? 'bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-300'
                            : isCurrent
                              ? 'bg-primary/20'
                              : isSelected
                                ? 'bg-primary/15'
                                : 'hover:bg-muted'
                        }`}
                      >
                        {token.value}
                      </span>
                    )
                  })}
                </div>
              )}

              {(displayMode === 'pt' || displayMode === 'both') && (
                <div className="text-sm leading-8 text-muted-foreground whitespace-pre-wrap">
                  {activeGen.text_pt}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixed: auto-advance toggle + Complete Session button ─────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">

        {/* Auto-advance toggle */}
        <div
          className="flex items-center gap-2 bg-background/90 backdrop-blur-sm border rounded-full px-3 py-1.5 shadow-sm"
          title="Automatically complete and advance when audio ends"
        >
          <button
            onClick={toggleAutoAdvance}
            aria-label={autoAdvance ? 'Disable auto-advance' : 'Enable auto-advance'}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoAdvance ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              autoAdvance ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-xs text-muted-foreground select-none">Auto-advance</span>
        </div>

        {/* Complete session + countdown row */}
        <div className="flex items-center gap-2">
          {/* Cancel countdown */}
          {countdown !== null && (
            <button
              onClick={() => setCountdown(null)}
              className="size-8 rounded-full bg-muted border flex items-center justify-center hover:bg-muted/80 transition-colors"
              title="Cancel auto-advance"
            >
              <XIcon className="size-3.5" />
            </button>
          )}

          {/* Button — four visual states */}
          {countdown !== null ? (
            /* Countdown: circular with animated SVG ring */
            <div className="relative size-16 flex items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="46"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="289"
                  strokeDashoffset={289 * (countdown / 3)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                  className="text-primary"
                />
              </svg>
              <span className="text-xs font-semibold leading-tight text-center">
                Next<br />{countdown}s
              </span>
            </div>
          ) : isDone ? (
            /* Done */
            <button
              disabled
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-green-600 text-white opacity-80 cursor-not-allowed flex items-center gap-1.5 shadow"
            >
              <CheckIcon className="size-3.5" />
              Done
            </button>
          ) : isPending ? (
            /* Saving */
            <button
              disabled
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-primary text-primary-foreground flex items-center gap-1.5 shadow opacity-80"
            >
              <Loader2Icon className="size-3.5 animate-spin" />
              Saving…
            </button>
          ) : audioCompleted ? (
            /* Active: audio finished */
            <button
              onClick={handleCompleteAndAdvance}
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
            >
              <CheckIcon className="size-3.5" />
              Complete Session
            </button>
          ) : (
            /* Inactive: audio still playing */
            <button
              disabled
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-muted text-muted-foreground opacity-40 cursor-not-allowed shadow"
            >
              Complete Session
            </button>
          )}
        </div>
      </div>

      {/* ── Word popover ──────────────────────────────────────────────────────── */}
      {popover && (
        <div
          data-popover
          className="fixed z-50 rounded-xl border bg-popover shadow-xl p-3 space-y-2.5 text-sm min-w-[160px]"
          style={{ left: Math.min(popover.x, window.innerWidth - 180), top: popover.y + 10 }}
        >
          <p className="font-semibold truncate max-w-[200px]">{popover.words.join(' ')}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleMarkDifficult} className="flex-1">
              Mark as difficult
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPopover(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── QueueList ────────────────────────────────────────────────────────────────

interface QueueListProps {
  generations: GenerationQueueItem[]
  activeId: string
  completedIds: Set<string>
  isPlaying: boolean
  onSelect: (id: string) => void
}

function QueueList({ generations, activeId, completedIds, isPlaying, onSelect }: QueueListProps) {
  return (
    <ul className="py-2">
      {generations.map((g) => {
        const isActive = g.id === activeId
        const isDone = completedIds.has(g.id)
        const displayName = g.title ?? g.playlist.name

        return (
          <li key={g.id}>
            <button
              onClick={() => onSelect(g.id)}
              className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                isActive ? 'bg-muted' : ''
              } ${isDone ? 'opacity-50' : ''}`}
            >
              {/* Left: playing indicator */}
              <div className="mt-1 shrink-0 w-4 flex justify-center">
                {isActive && isPlaying ? (
                  <PlayingBars />
                ) : isActive ? (
                  <div className="size-1.5 rounded-full bg-primary" />
                ) : (
                  <div className="size-1.5 rounded-full bg-transparent" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {g.playlist.name}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {relativeDate(g.created_at)}
                </p>
              </div>

              {/* Right: status dot */}
              <div className="mt-1 shrink-0 flex items-center">
                {isDone ? (
                  <div className="size-2.5 rounded-full bg-green-500" />
                ) : isActive ? (
                  <div className="size-2.5 rounded-full bg-primary" />
                ) : (
                  <div className="size-2.5 rounded-full border border-muted-foreground/30" />
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
