'use server'

import { getWordDetails as fetchWordDetails, type WordDetails } from './dictionary-lookup'
import { type Result } from '@/lib/result'

export async function getWordDetailsAction(
  word: string,
  context?: string,
): Promise<Result<WordDetails>> {
  return await fetchWordDetails(word, context)
}
