import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getActivePlaylists } from '@/modules/schedule/playlist-manager'
import { ScheduleClient } from './schedule-client'
import type { Database } from '@/types/supabase'

type Generation = Database['public']['Tables']['generations']['Row']

export default async function SchedulePage() {
  const playlists = await getActivePlaylists()

  // Fetch latest generation per playlist
  // Tech debt: dedup in JS works for 1-5 users; migrate to DISTINCT ON query when volume grows
  let latestGenerations: Record<string, Generation> = {}

  if (playlists.length > 0) {
    const supabase = await createSupabaseServerClient()
    const ids = playlists.map((p) => p.id)
    const { data: generations } = await supabase
      .from('generations')
      .select('*')
      .in('playlist_id', ids)
      .order('created_at', { ascending: false })

    if (generations) {
      for (const gen of generations) {
        if (!latestGenerations[gen.playlist_id]) {
          latestGenerations[gen.playlist_id] = gen
        }
      }
    }
  }

  return (
    <ScheduleClient playlists={playlists} latestGenerations={latestGenerations} />
  )
}
