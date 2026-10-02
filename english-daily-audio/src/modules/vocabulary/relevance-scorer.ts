import 'server-only'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { type Result, ok } from '@/lib/result'

export interface WordRelevance {
  word: string
  score: number  // 0.0 – 1.0
  reason: string
}

const RELEVANCE_PROMPT = (words: string[], context: string) => `
You are an English vocabulary analyst. Evaluate each word below for learning relevance.

Context (first 500 chars of the source text):
"""
${context.slice(0, 500)}
"""

Words to evaluate:
${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}

For each item, assign a relevance score from 0.0 to 1.0 based on:
- High score (0.7–1.0): intermediate/advanced vocabulary, phrasal verbs, idioms, collocations, academic words, or useful expressions worth studying.
- Medium score (0.3–0.6): useful but common vocabulary
- Low score (0.0–0.2): too simple, too rare/obscure, random word combinations that are NOT valid phrasal verbs, or personal proper nouns (names of people, fictional characters)
- Score exactly 0.0 if: the word/phrase is NOT English, or it is a person's proper name / fictional character name

IMPORTANT rules:
- Phrasal verbs and idioms (e.g., "give up", "turn off", "run out of") are HIGH PRIORITY vocabulary items — score them between 0.8 and 1.0 if they are valid English phrasal verbs or collocations in the context.
- Country names, nationalities, and place names (cities, rivers, continents) are valid English vocabulary — score them normally
- Only personal names (people, characters) get 0.0 for being proper nouns
- Any word that is not English must receive 0.0

Respond ONLY with a JSON array, no markdown:
[{"word":"...","score":0.0,"reason":"..."}]
`

function extractJsonArray(raw: string): WordRelevance[] | null {
  // 1. Tenta o raw direto (quando responseMimeType: "application/json" funcionou)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as WordRelevance[]
  } catch {
    // não era JSON puro — tenta regex
  }

  // 2. Extrai o primeiro [...] do texto (modelo adicionou texto extra)
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    if (Array.isArray(parsed)) return parsed as WordRelevance[]
  } catch {
    return null
  }

  return null
}

/**
 * Analisa a relevância das palavras via Gemini em lotes de 30.
 * Usa responseMimeType: "application/json" para forçar JSON puro,
 * com fallback por regex. Batches que falham retornam array vazio
 * em vez de abortar o unlock inteiro.
 */
export async function scoreWordRelevance(
  words: string[],
  contextText: string,
): Promise<Result<WordRelevance[]>> {
  const BATCH_SIZE = 30
  const results: WordRelevance[] = []

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)

    try {
      const response = await gemini.generateContent({
        model: GEMINI_MODEL,
        contents: RELEVANCE_PROMPT(batch, contextText),
        config: { responseMimeType: 'application/json' },
      })

      const raw = (response.text ?? '').trim()
      const parsed = extractJsonArray(raw)

      if (parsed === null) {
        console.error(`[relevance-scorer] batch ${i}: could not extract JSON array. raw response:`, raw)
        // Não aborta — batch é ignorado, palavras ficam sem score
        continue
      }

      results.push(...parsed)
    } catch (e) {
      console.error(`[relevance-scorer] batch ${i}: Gemini call failed:`, e)
      // Não aborta — batch é ignorado
      continue
    }
  }

  return ok(results)
}
