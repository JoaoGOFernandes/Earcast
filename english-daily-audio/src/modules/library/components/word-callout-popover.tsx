'use client'

import { useState, useEffect } from 'react'
import { Volume2Icon, ArrowRightIcon, ArrowLeftIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getWordDetailsAction } from '@/modules/vocabulary/actions'
import type { WordDetails } from '@/modules/vocabulary/dictionary-lookup'

interface Props {
  word: string
  contextSentence?: string
  onClose: () => void
}

export function WordCalloutPopover({ word, contextSentence, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<WordDetails | null>(null)
  const [activeTab, setActiveTab] = useState<'main' | 'conjugations'>('main')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    getWordDetailsAction(word, contextSentence).then((res) => {
      if (!isMounted) return
      setLoading(false)
      if (res.success) {
        setDetails(res.data)
      } else {
        setError(res.error)
      }
    })

    return () => {
      isMounted = false
    }
  }, [word, contextSentence])

  function playAudio() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(word)
      utterance.lang = 'en-US'
      utterance.rate = 0.9
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className="absolute z-50 mt-2 w-80 rounded-xl border bg-popover p-4 shadow-xl text-popover-foreground animate-in fade-in-0 zoom-in-95">
      <div className="flex items-center justify-between border-b pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base capitalize">{word}</span>
          {details?.wordType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {details.wordType}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" onClick={playAudio} title="Ouvir pronúncia">
            <Volume2Icon className="size-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} title="Fechar">
            ✕
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin text-primary" />
          <span className="text-xs">Consultando dicionário…</span>
        </div>
      ) : error ? (
        <div className="py-3 text-xs text-destructive text-center">
          Não foi possível carregar os detalhes: {error}
        </div>
      ) : details ? (
        <div className="space-y-3">
          {activeTab === 'main' ? (
            /* TAB 1: Tradução + Pronúncia */
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Tradução:</span>
                <p className="font-medium text-foreground">{details.translation}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground block font-medium">Pronúncia:</span>
                <p className="font-mono text-xs text-primary flex items-center gap-1.5">
                  <span>{details.pronunciation}</span>
                  {details.phoneticPt && <span className="text-muted-foreground font-sans">({details.phoneticPt})</span>}
                </p>
              </div>

              {details.exampleSentence && (
                <div className="bg-muted/50 p-2 rounded-lg text-xs italic text-muted-foreground mt-2 border">
                  "{details.exampleSentence}"
                </div>
              )}

              {details.conjugations && (
                <div className="pt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => setActiveTab('conjugations')}
                  >
                    <span>Conjugações & Flexões</span>
                    <ArrowRightIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: Conjugações e Flexões Gramaticais */
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b pb-1">
                <span className="font-semibold text-muted-foreground">Tabela Gramatical</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] gap-1 px-1.5"
                  onClick={() => setActiveTab('main')}
                >
                  <ArrowLeftIcon className="size-3" />
                  <span>Voltar</span>
                </Button>
              </div>

              {details.conjugations?.present && (
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span className="text-muted-foreground font-medium">Presente:</span>
                  <span className="font-mono font-medium">{details.conjugations.present}</span>
                </div>
              )}
              {details.conjugations?.past && (
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span className="text-muted-foreground font-medium">Passado Simples:</span>
                  <span className="font-mono font-medium">{details.conjugations.past}</span>
                </div>
              )}
              {details.conjugations?.pastParticiple && (
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span className="text-muted-foreground font-medium">Particípio Passado:</span>
                  <span className="font-mono font-medium">{details.conjugations.pastParticiple}</span>
                </div>
              )}
              {details.conjugations?.continuous && (
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span className="text-muted-foreground font-medium">Gerúndio (-ing):</span>
                  <span className="font-mono font-medium">{details.conjugations.continuous}</span>
                </div>
              )}
              {details.conjugations?.persons?.thirdPerson && (
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span className="text-muted-foreground font-medium">3ª Pessoa / Plural:</span>
                  <span className="font-mono font-medium">{details.conjugations.persons.thirdPerson}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
