'use client'

import { type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface Props {
  textCount: number
  textsContent: ReactNode
  vocabContent: ReactNode
}

export function LibraryTabs({ textCount, textsContent, vocabContent }: Props) {
  return (
    <Tabs defaultValue="texts" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {textCount} text{textCount !== 1 ? 's' : ''}
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="texts">Texts</TabsTrigger>
          <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="texts">
        {textsContent}
      </TabsContent>
      <TabsContent value="vocabulary">
        {vocabContent}
      </TabsContent>
    </Tabs>
  )
}
