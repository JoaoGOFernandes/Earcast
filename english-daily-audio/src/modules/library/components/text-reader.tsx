'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowLeftIcon, LockIcon, UnlockIcon, Loader2Icon, PlusIcon, ScissorsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WordCalloutPopover } from './word-callout-popover'
import { unlockText, lockText } from '../actions'
import type { Database } from '@/types/supabase'

type Text = Database['public']['Tables']['texts']['Row']

interface Props {
  text: Text
  knownVocabWords: Set<string>
  onClose: () => void
}

export function TextReaderModal({ text, knownVocabWords, onClose }: Props) {
  const [status, setStatus] = useState<'locked' | 'unlocked'>(text.status as 'locked' | 'unlocked')
  const [selectedWord, setSelectedWord] = useState<{ word: string; sentence?: string } | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Support for text parts
  const [lines, setLines] = useState<string[]>(text.content.split('\n'))
  const [delimiterLineIndex, setDelimiterLineIndex] = useState<number>(lines.length)
  const [parts, setParts] = useState<{ name: string; content: string }[]>([
    { name: 'Parte 1', content: text.content },
  ])

  function handleUnlock() {
    startTransition(async () => {
      const res = await unlockText(text.id)
      if (res.success) {
        setStatus('unlocked')
        toast.success(`Texto desbloqueado! ${res.data.wordCount} palavras ativas extraídas.`)
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleLock() {
    startTransition(async () => {
      const res = await lockText(text.id)
      if (res.success) {
        setStatus('locked')
        toast.success('Texto bloqueado novamente')
      }
    })
  }

  function handleWordClick(event: React.MouseEvent<HTMLSpanElement>, rawWord: string, sentence: string) {
    if (status !== 'unlocked') return

    const rect = event.currentTarget.getBoundingClientRect()
    const cleanWord = rawWord.replace(/[^a-zA-Z']/g, '')
    if (!cleanWord) return

    setSelectedWord({ word: cleanWord, sentence })
    setPopoverPosition({
      top: rect.bottom + window.scrollY,
      left: Math.min(rect.left, window.innerWidth - 340),
    })
  }

  function addPartDelimiter() {
    if (delimiterLineIndex <= 0 || delimiterLineIndex >= lines.length) return
    const part1 = lines.slice(0, delimiterLineIndex).join('\n')
    const part2 = lines.slice(delimiterLineIndex).join('\n')
    setParts([
      { name: `Parte 1 (${delimiterLineIndex} linhas)`, content: part1 },
      { name: `Parte 2 (${lines.length - delimiterLineIndex} linhas)`, content: part2 },
    ])
    toast.success(`Texto dividido em 2 partes na linha ${delimiterLineIndex}`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 md:p-8 animate-in fade-in-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
              <ArrowLeftIcon className="size-4" />
              <span>Voltar para Biblioteca</span>
            </Button>
            <span className="text-muted-foreground">|</span>
            <h1 className="font-bold text-lg truncate max-w-md">{text.name}</h1>
            <Badge variant={status === 'unlocked' ? 'default' : 'secondary'}>
              {status === 'unlocked' ? 'Desbloqueado' : 'Bloqueado'}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {status === 'locked' ? (
              <Button size="sm" onClick={handleUnlock} disabled={isPending}>
                {isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Extraindo vocabulário…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <UnlockIcon className="size-3.5" />
                    Desbloquear Texto
                  </span>
                )}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleLock} disabled={isPending}>
                <LockIcon className="size-3.5 mr-1.5" />
                Bloquear
              </Button>
            )}
          </div>
        </div>

        {/* Info & Part Delimiter Controls */}
        <div className="bg-muted/40 p-4 rounded-xl border space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <span>
              {status === 'locked'
                ? '💡 Modo Leitura (Texto Bloqueado): Palavras destacadas em amarelo são novas no seu acervo.'
                : '✨ Modo Leitura Interativo (Texto Desbloqueado): Clique em qualquer palavra para ver tradução, pronúncia e conjugações.'}
            </span>
            <div className="flex items-center gap-2">
              <ScissorsIcon className="size-3.5" />
              <span>Delimitar Parte por linha:</span>
              <input
                type="number"
                min={1}
                max={lines.length - 1}
                value={delimiterLineIndex}
                onChange={(e) => setDelimiterLineIndex(Number(e.target.value))}
                className="w-16 h-7 rounded border text-center text-xs bg-background"
              />
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={addPartDelimiter}>
                Dividir em Partes
              </Button>
            </div>
          </div>

          {parts.length > 1 && (
            <div className="flex items-center gap-2 pt-1 border-t">
              <span className="text-xs font-semibold">Partes do Texto:</span>
              {parts.map((p, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {p.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Text Content Reader */}
        <div className="bg-card border rounded-xl p-6 sm:p-8 space-y-4 min-h-[400px]">
          {lines.map((line, lineIdx) => {
            if (!line.trim()) return <div key={lineIdx} className="h-4" />

            const words = line.split(/(\s+)/)
            const isDelimiterLine = lineIdx + 1 === delimiterLineIndex && parts.length > 1

            return (
              <div key={lineIdx} className="relative">
                <p className="text-base sm:text-lg leading-relaxed font-serif text-foreground/90">
                  {words.map((w, wordIdx) => {
                    const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '')
                    if (!cleanWord) return <span key={wordIdx}>{w}</span>

                    const isKnown = knownVocabWords.has(cleanWord)
                    const isNewInLocked = status === 'locked' && !isKnown

                    return (
                      <span
                        key={wordIdx}
                        onClick={(e) => handleWordClick(e, w, line)}
                        className={`inline-block transition-colors rounded px-0.5 ${
                          status === 'unlocked'
                            ? 'cursor-pointer hover:bg-primary/20 hover:text-primary'
                            : isNewInLocked
                            ? 'border-b-2 border-amber-500/70 bg-amber-500/10 font-medium'
                            : ''
                        }`}
                        title={
                          status === 'unlocked'
                            ? 'Clique para ver tradução e conjugações'
                            : isNewInLocked
                            ? 'Palavra nova no seu acervo'
                            : 'Palavra conhecida'
                        }
                      >
                        {w}
                      </span>
                    )
                  })}
                </p>

                {isDelimiterLine && (
                  <div className="my-3 border-b-2 border-dashed border-primary/50 flex items-center justify-center">
                    <span className="bg-primary/10 text-primary text-[10px] uppercase font-bold px-2 py-0.5 rounded-full -mt-2">
                      Fim da Parte 1 / Início da Parte 2
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Word Callout Popover */}
        {selectedWord && popoverPosition && (
          <div style={{ position: 'absolute', top: popoverPosition.top, left: popoverPosition.left }}>
            <WordCalloutPopover
              word={selectedWord.word}
              contextSentence={selectedWord.sentence}
              onClose={() => setSelectedWord(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
