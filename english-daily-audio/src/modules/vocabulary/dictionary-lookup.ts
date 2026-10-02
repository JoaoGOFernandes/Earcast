import 'server-only'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { type Result, ok, err } from '@/lib/result'

export interface ConjugationDetails {
  present?: string
  past?: string
  pastParticiple?: string
  continuous?: string
  persons?: {
    firstPerson?: string
    thirdPerson?: string
    plural?: string
  }
}

export interface WordDetails {
  word: string
  translation: string
  pronunciation: string
  phoneticPt?: string
  wordType: string
  conjugations?: ConjugationDetails
  exampleSentence?: string
}

// In-memory cache for instant <5ms responses
const dictionaryCache = new Map<string, WordDetails>()

const LOOKUP_PROMPT = (word: string, context?: string) => `
You are an English linguistic and dictionary expert. Provide a detailed linguistic analysis for the English word or phrasal verb: "${word}".
${context ? `Context of occurrence: "${context.slice(0, 200)}"` : ''}

Respond ONLY with a JSON object in this exact schema, with NO markdown formatting:
{
  "word": "${word}",
  "translation": "Tradução precisa em português do Brasil",
  "pronunciation": "Representação fonética IPA (ex: /ˈwɜːrk/ ou /ˈpɪkt/)",
  "phoneticPt": "Guia de pronúncia aproximada em português (ex: uôrc / pík-t)",
  "wordType": "Classe gramatical (Verb, Noun, Adjective, Phrasal Verb, Idiom, Slang, Adverb)",
  "conjugations": {
    "present": "Forma no presente (ex: work / works)",
    "past": "Passado simples (ex: worked)",
    "pastParticiple": "Particípio passado (ex: worked)",
    "continuous": "Gerúndio / Contínuo -ing (ex: working)",
    "persons": {
      "firstPerson": "1ª pessoa (I/We work)",
      "thirdPerson": "3ª pessoa do singular (He/She/It works)",
      "plural": "Forma no plural (se for substantivo, ex: works/books)"
    }
  },
  "exampleSentence": "Uma frase simples de exemplo em inglês com tradução entre parênteses"
}
`.trim()

/**
 * Consulta sob demanda com cache instantâneo (<5ms) de palavra ou phrasal verb.
 */
export async function getWordDetails(word: string, context?: string): Promise<Result<WordDetails>> {
  const key = word.toLowerCase().trim()
  if (dictionaryCache.has(key)) {
    return ok(dictionaryCache.get(key)!)
  }

  try {
    const response = await gemini.generateContent({
      model: GEMINI_MODEL,
      contents: LOOKUP_PROMPT(word, context),
      config: { responseMimeType: 'application/json' },
    })

    const raw = (response.text ?? '').trim()
    const parsed = JSON.parse(raw) as WordDetails
    dictionaryCache.set(key, parsed)
    return ok(parsed)
  } catch (e) {
    return err(`Failed to fetch details for "${word}": ${String(e)}`)
  }
}
