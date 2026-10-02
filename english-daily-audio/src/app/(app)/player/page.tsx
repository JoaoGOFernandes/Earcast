import Link from 'next/link'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getTodayGenerations } from '@/modules/generation/actions'
import { PlayerClient } from './player-client'

interface Props {
  searchParams: Promise<{ generationId?: string }>
}

function AllDoneToday() {
  return (
    <div className="max-w-md mx-auto py-20 text-center space-y-4">
      <div className="text-5xl">✓</div>
      <p className="text-2xl font-bold">All caught up!</p>
      <p className="text-muted-foreground text-sm">
        No pending audio sessions. Generate a new one from Schedule.
      </p>
      <Link
        href="/schedule"
        className="inline-block mt-2 text-sm text-primary underline underline-offset-4"
      >
        Go to Schedule
      </Link>
    </div>
  )
}

export default async function PlayerPage({ searchParams }: Props) {
  const { generationId } = await searchParams

  const generations = await getTodayGenerations()

  if (generations.length === 0) {
    return <AllDoneToday />
  }

  // Se vier generationId que está na lista → usa como inicial; caso contrário usa a primeira
  const initialId =
    generationId && generations.some((g) => g.id === generationId)
      ? generationId
      : generations[0].id

  // Gera signed URLs para todas as gerações da queue em paralelo
  const serviceSupabase = createSupabaseServiceClient()
  const urlEntries = await Promise.all(
    generations.map(async (g) => {
      if (!g.audio_path) return null
      const { data } = await serviceSupabase.storage
        .from('audio')
        .createSignedUrl(g.audio_path, 3600)
      return data?.signedUrl ? ([g.id, data.signedUrl] as const) : null
    }),
  )

  const signedUrls: Record<string, string> = Object.fromEntries(
    urlEntries.filter((e): e is [string, string] => e !== null),
  )

  return (
    <PlayerClient
      generations={generations}
      initialId={initialId}
      signedUrls={signedUrls}
    />
  )
}
