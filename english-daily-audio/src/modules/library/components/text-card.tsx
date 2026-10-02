'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { unlockText, deleteText } from '../actions'
import { TextReaderModal } from './text-reader'
import type { Database } from '@/types/supabase'

type Text = Database['public']['Tables']['texts']['Row']

export function TextCard({
  text,
  vocabCount,
  knownVocabWords = new Set(),
}: {
  text: Text
  vocabCount?: number
  knownVocabWords?: Set<string>
}) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showReader, setShowReader] = useState(false)

  function handleUnlock() {
    startTransition(async () => {
      const result = await unlockText(text.id)
      if (result.success) {
        toast.success(
          result.data.wordCount > 0
            ? `Unlocked — ${result.data.wordCount} active words extracted`
            : 'Text already unlocked',
        )
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDeleteConfirm() {
    startTransition(async () => {
      const result = await deleteText(text.id)
      if (!result.success) toast.error(result.error)
      setShowDeleteModal(false)
    })
  }

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-card hover:border-primary/50 transition-colors">
        <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setShowReader(true)}>
          <div className="min-w-0">
            <p className="font-medium truncate hover:text-primary transition-colors">{text.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(text.created_at).toLocaleDateString('en-US', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <Badge variant={text.status === 'unlocked' ? 'default' : 'secondary'}>
            {text.status}
          </Badge>
        </div>

        {text.status === 'unlocked' && vocabCount !== undefined && (
          <p className="text-sm text-muted-foreground">
            {vocabCount} active words
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button size="sm" variant="secondary" onClick={() => setShowReader(true)}>
            Read text
          </Button>

          {text.status === 'locked' ? (
            <Button size="sm" onClick={handleUnlock} disabled={isPending}>
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Extracting…
                </span>
              ) : (
                'Unlock text'
              )}
            </Button>
          ) : (
            <a
              href={`/vocabulary?textId=${text.id}`}
              className="inline-flex items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium h-7 gap-1 hover:bg-muted hover:text-foreground transition-colors"
            >
              View vocabulary
            </a>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive ml-auto"
            onClick={() => setShowDeleteModal(true)}
            disabled={isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      {showReader && (
        <TextReaderModal
          text={text}
          knownVocabWords={knownVocabWords}
          onClose={() => setShowReader(false)}
        />
      )}

      <Dialog
        open={showDeleteModal}
        onOpenChange={(o) => { if (!o) setShowDeleteModal(false) }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete text</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">"{text.name}"</span>?
            This will also remove all extracted vocabulary and cannot be undone.
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isPending}
            >
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Deleting…
                </span>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
