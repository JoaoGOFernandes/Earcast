import 'server-only'
import type { Database } from '@/types/supabase'

type Playlist = Database['public']['Tables']['playlists']['Row']

/**
 * Sugere o melhor candidato para mesclar quando dois textos têm vocabulário
 * sobreposto. Retorna as playlists ordenadas por menor dominance_score
 * (menos dominadas = mais benefício de integrar vocabulário novo).
 */
export function rankMergeCandidates(
  playlists: Playlist[],
  excludeIds: string[] = [],
): Playlist[] {
  return playlists
    .filter((p) => p.status === 'active' && !excludeIds.includes(p.id))
    .sort((a, b) => (a.dominance_score ?? 0) - (b.dominance_score ?? 0))
}

/**
 * Detecta conflito de configuração entre playlists a mesclar:
 * diferença de complexity > 3 ou vozes diferentes são alertas.
 */
export interface MergeConflict {
  type: 'complexity' | 'voice'
  message: string
}

export function detectMergeConflicts(
  configA: Database['public']['Tables']['playlist_configs']['Row'],
  configB: Database['public']['Tables']['playlist_configs']['Row'],
): MergeConflict[] {
  const conflicts: MergeConflict[] = []

  if (Math.abs(configA.complexity - configB.complexity) > 3) {
    conflicts.push({
      type: 'complexity',
      message: `Complexity gap: ${configA.complexity} vs ${configB.complexity}. The merged playlist will use the average.`,
    })
  }

  if (configA.voice !== configB.voice) {
    conflicts.push({
      type: 'voice',
      message: `Different voices: ${configA.voice} vs ${configB.voice}. The merged playlist will keep the first.`,
    })
  }

  return conflicts
}
