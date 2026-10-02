'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SparklesIcon, ScissorsIcon, ArrowLeftIcon, FileTextIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createText } from '../actions'

type ImportMode = 'paste' | 'pdf'

async function extractPdfText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions, version } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    let lastY: number | null = null
    let lineStr = ''

    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = item.str
      const transform = item.transform as number[]
      const y = transform ? transform[5] : null

      // Check if new line or header
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 8) {
        pages.push(lineStr.trim())
        lineStr = ''
      }

      // Preserve bold / headings formatting from PDF item font
      const isBold = 'fontName' in item && typeof item.fontName === 'string' && /bold/i.test(item.fontName)
      if (isBold && str.trim().length > 0) {
        lineStr += ` **${str.trim()}** `
      } else {
        lineStr += str
      }

      lastY = y
    }
    if (lineStr.trim()) pages.push(lineStr.trim())
  }

  return pages
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Automático: Remove números de página, cabeçalhos de editoras e rodapés repetitivos.
 */
function autoCleanHeadersFooters(rawText: string): string {
  const lines = rawText.split('\n')
  const cleaned: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Filter page numbers (e.g. "Page 1 of 10", "12", "- 5 -")
    if (/^(page\s+\d+|-\s*\d+\s*-|\d{1,3})$/i.test(trimmed)) continue
    // Filter common publisher headers / footers
    if (/^(copyright|all rights reserved|www\.|http|downloaded from)/i.test(trimmed)) continue
    cleaned.push(line)
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function ImportDialog({ variant = 'button' }: { variant?: 'button' | 'card' }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>('paste')
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [isPending, startTransition] = useTransition()
  const [isExtractingPdf, setIsExtractingPdf] = useState(false)
  const [textName, setTextName] = useState('')
  const [textContent, setTextContent] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setOpen(false)
    setMode('paste')
    setStep('input')
    setTextName('')
    setTextContent('')
  }

  async function processPdfFile(file: File) {
    setIsExtractingPdf(true)
    try {
      const extracted = await extractPdfText(file)
      const fileName = file.name.replace(/\.pdf$/i, '')
      setTextName(fileName)
      setTextContent(extracted)
      setStep('preview')
      toast.success(`PDF extracted — ${extracted.split(/\s+/).length} words`)
    } catch {
      toast.error('Failed to extract PDF. Try pasting the text instead.')
    } finally {
      setIsExtractingPdf(false)
    }
  }

  function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    processPdfFile(file)
  }

  function handleProceedToPreview() {
    if (!textName.trim()) {
      toast.error('Please enter a name for the text.')
      return
    }
    if (!textContent.trim() || textContent.trim().length < 50) {
      toast.error('Text content must be at least 50 characters.')
      return
    }
    setStep('preview')
  }

  function handleAutoClean() {
    const cleaned = autoCleanHeadersFooters(textContent)
    setTextContent(cleaned)
    toast.success('Cleaned headers, footers, and page numbers!')
  }

  function handleConfirmImport() {
    startTransition(async () => {
      const result = await createText({ name: textName, content: textContent })
      if (result.success) {
        toast.success('Text imported successfully!')
        handleClose()
      } else {
        toast.error(result.error)
      }
    })
  }

  const busy = isPending || isExtractingPdf

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true) }}>
      {variant === 'card' ? (
        <DialogTrigger
          render={
            <button className="flex items-center justify-center w-full h-full min-h-[120px] rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/50 transition-colors" />
          }
        >
          <span className="text-sm font-medium">+ Import text</span>
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>+ Import text</DialogTrigger>
      )}

      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Import text</span>
            {step === 'preview' && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setStep('input')}>
                <ArrowLeftIcon className="size-3.5" /> Back to edit
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: INPUT MODE */}
        {step === 'input' && (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="inline-flex rounded-lg border bg-muted p-0.5 text-sm w-fit">
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  mode === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >
                Paste text
              </button>
              <button
                type="button"
                onClick={() => setMode('pdf')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  mode === 'pdf' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >
                Upload PDF
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Text Name</Label>
              <Input
                ref={nameRef}
                id="name"
                value={textName}
                onChange={(e) => setTextName(e.target.value)}
                placeholder="e.g. Jack and the Beanstalk"
                maxLength={200}
              />
            </div>

            {mode === 'paste' ? (
              <div className="space-y-1.5">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  rows={9}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your English text here..."
                  className="resize-none font-mono text-sm"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                  <input type="file" accept=".pdf" className="sr-only" onChange={handlePdfChange} disabled={busy} />
                  {isExtractingPdf ? (
                    <span className="text-sm text-muted-foreground">Extracting PDF text…</span>
                  ) : (
                    <div className="text-center">
                      <FileTextIcon className="size-6 text-primary mx-auto mb-1" />
                      <p className="text-sm font-medium">Click or drag a PDF file here</p>
                      <p className="text-xs text-muted-foreground">Preserves Markdown formatting & titles</p>
                    </div>
                  )}
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleProceedToPreview} disabled={!textName.trim() || !textContent.trim()}>
                Preview & Clean →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & CLEAN */}
        {step === 'preview' && (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border">
              <span className="text-xs text-muted-foreground">
                Review and clean your text before saving. Use Auto-clean to remove PDF headers and page numbers.
              </span>
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs shrink-0" onClick={handleAutoClean}>
                <SparklesIcon className="size-3.5 text-amber-500" />
                Auto-clean Headers & Footers
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preview-content">Edit & Fine-tune Content</Label>
              <Textarea
                id="preview-content"
                rows={12}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="font-mono text-sm leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">{textContent.split(/\s+/).length} words</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
                <Button onClick={handleConfirmImport} disabled={isPending}>
                  {isPending ? 'Importing…' : 'Confirm & Save Text'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
