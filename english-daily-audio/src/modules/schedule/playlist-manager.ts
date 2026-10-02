import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { type Result, ok, err } from '@/lib/result'
import type { Database } from '@/types/supabase'

type Playlist = Database['public']['Tables']['playlists']['Row']

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * Cria uma playlist automaticamente ao desbloquear um texto.
 */
export async function createPlaylistForText(
  textId: string,
  textName: string,
): Promise<Result<{ id: string }>> {
  const userId = await getCurrentUserId()
  if (!userId) return err('Not authenticated')

  const supabase = await createSupabaseServerClient()

  const { data: playlistData, error: playlistError } = await supabase
    .from('playlists')
    .insert({
      user_id: userId,
      name: textName,
      source_text_ids: [textId],
    })
    .select('id')
    .single()

  if (playlistError) return err(playlistError.message)

  const { error: configError } = await supabase
    .from('playlist_configs')
    .insert({
      user_id: userId,
      playlist_id: playlistData.id,
    })

  if (configError) return err(configError.message)

  return ok(playlistData)
}

/**
 * Mescla duas ou mais playlists em uma nova, arquivando as originais.
 */
export async function mergePlaylists(
  playlistIds: string[],
  mergedName: string,
): Promise<Result<{ id: string }>> {
  if (playlistIds.length < 2) return err('Need at least 2 playlists to merge')

  const userId = await getCurrentUserId()
  if (!userId) return err('Not authenticated')

  const supabase = await createSupabaseServerClient()

  const { data: originals, error: fetchError } = await supabase
    .from('playlists')
    .select('*')
    .in('id', playlistIds)

  if (fetchError) return err(fetchError.message)

  const allTextIds = originals.flatMap((p) => p.source_text_ids)

  const { data: merged, error: mergeError } = await supabase
    .from('playlists')
    .insert({
      user_id: userId,
      name: mergedName,
      source_text_ids: allTextIds,
      is_merged: true,
      merged_from_ids: playlistIds,
    })
    .select('id')
    .single()

  if (mergeError) return err(mergeError.message)

  const { error: archiveError } = await supabase
    .from('playlists')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .in('id', playlistIds)

  if (archiveError) return err(archiveError.message)

  return ok(merged)
}

/**
 * Desfaz uma mesclagem: restaura as playlists originais e arquiva a mesclada.
 */
export async function unmergePlaylists(
  mergedPlaylistId: string,
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient()

  const { data: merged, error: fetchError } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', mergedPlaylistId)
    .single()

  if (fetchError) return err(fetchError.message)
  if (!merged.merged_from_ids?.length) return err('Playlist was not created by merging')

  const { error: restoreError } = await supabase
    .from('playlists')
    .update({ status: 'active', archived_at: null })
    .in('id', merged.merged_from_ids)

  if (restoreError) return err(restoreError.message)

  const { error: archiveError } = await supabase
    .from('playlists')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', mergedPlaylistId)

  if (archiveError) return err(archiveError.message)

  return ok(undefined)
}

export async function getActivePlaylists(): Promise<Playlist[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
