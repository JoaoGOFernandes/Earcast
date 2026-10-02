'use server'

import { revalidatePath } from 'next/cache'
import { type Result } from '@/lib/result'
import { mergePlaylists, unmergePlaylists } from './playlist-manager'

export async function mergePlaylistsAction(
  ids: string[],
  name: string,
): Promise<Result<{ id: string }>> {
  const result = await mergePlaylists(ids, name)
  if (result.success) revalidatePath('/schedule')
  return result
}

export async function unmergePlaylistAction(id: string): Promise<Result<void>> {
  const result = await unmergePlaylists(id)
  if (result.success) revalidatePath('/schedule')
  return result
}
