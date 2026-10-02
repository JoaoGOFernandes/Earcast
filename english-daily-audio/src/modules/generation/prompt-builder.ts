import 'server-only'
import type { Database } from '@/types/supabase'

type PlaylistConfig = Database['public']['Tables']['playlist_configs']['Row']
type WordReview = Database['public']['Tables']['word_reviews']['Row']

export interface GenerationPromptParams {
  config: PlaylistConfig
  targetWords: string[]    // palavras SRS a incluir obrigatoriamente
  vocabularyPool: string[] // vocabulário extra da playlist para cobertura
  wordCount?: number
}

/**
 * Constrói o prompt para o Gemini gerar o texto em inglês do dia.
 */
export function buildGenerationPrompt(params: GenerationPromptParams): string {
  const {
    config,
    targetWords,
    vocabularyPool,
    wordCount = 250,
  } = params

  const complexityDesc = complexityLabel(config.complexity)

  const formats = [
    'Podcast Interview / Talk Show Dialogue (a dynamic exchange between an interviewer and an expert/guest)',
    'Mystery / Case Study Investigation (a problem or mystery being unraveled step-by-step)',
    'Confidential Letter / Personal Journal Entry (an intimate, revealing personal letter or secret diary entry)',
    'Operational Briefing / Survival Guide (a practical, high-stakes guide or instructions before a challenge)',
    'Documentary Narration (BBC / National Geographic style observational narrative)',
    'High-Stakes Dilemma / Decision Moment (a tense moment where characters face a critical choice under pressure)',
    'Retrospective Reflection (looking back years later on a pivotal event that changed everything)',
  ]
  const randomFormat = formats[Math.floor(Math.random() * formats.length)]

  const creativeDirection = config.theme
    ? `Creative direction / theme: ${config.theme}.`
    : `Suggested narrative style for this generation: ${randomFormat}. Adapt this format to feel 100% natural for the provided vocabulary domain.`

  return `
You are writing a short original story or article for an English language learner practicing listening comprehension.

CRITICAL CONTROLLED VOCABULARY RULE — STRICT ENFORCEMENT:
- You are generating a text for a student who MUST ONLY practice listening to words they already know.
- You MUST ONLY use content words (nouns, verbs, adjectives, adverbs) that appear in the MANDATORY WORDS list or the VOCABULARY POOL below.
- DO NOT introduce any new content words (no new nouns, verbs, adjectives, or adverbs) outside the provided lists. Re-use the provided words to build the story.
- You MAY freely use all standard English structural, functional, and connective "glue words" (articles: a, an, the; pronouns: I, you, he, she, it, we, they, my, your, his, her, its, this, that, which, who, what; prepositions: in, on, at, to, of, for, with, by, from, out, into, over, under, about; conjunctions: and, but, or, so, because, if, although, while, since, as, than; basic auxiliaries: is, am, are, was, were, do, did, have, had, can, could, will, would, should; basic high-frequency transitions & adverbs: that, about, how, when, where, why, then, also, just, only, very, more, most, too, even, always, never, before, after, again, still, well, like, now, here, there).

PHRASAL VERBS & GRAMMATICAL VARIATION:
- Treat multi-word phrasal verbs in the pool (e.g. "give up", "turn off", "look forward to") as unified cohesive units and use them naturally.
- Vary the verb tenses and grammatical structures of familiar verbs (use past, present, future, continuous, and perfect forms) so the learner hears familiar words in diverse syntactic roles.

NARRATIVE FORMAT & DIVERSITY:
- ${creativeDirection}
- Create a COMPLETELY ORIGINAL piece with new characters, a new setting, and a new plot.
- Do NOT copy, summarize, paraphrase, or retell any existing story or text.
- Recombine the allowed vocabulary palette into a fresh, captivating narrative.

Technical requirements:
- Length: approximately ${wordCount} words
- Target Vocabulary Coverage: use as many words from the pool as possible to reinforce them.

MANDATORY WORDS — you MUST use ALL of these naturally in the text:
${targetWords.join(', ')}

ALLOWED VOCABULARY POOL — ONLY use content words and phrasal verbs from this list:
${vocabularyPool.join(', ')}

Formatting rules — STRICT:
- Plain prose only. No markdown, no asterisks, no bold, no italic, no headers, no bullet points.
- Paragraphs separated by a single blank line.
- Write as if for a printed book, magazine article, or script.
- Do NOT include any translation, explanation, word list, or extra metadata.
- Output format: the VERY FIRST LINE must be "TITLE: [your creative title]", then a blank line, then the body.
- The title must be creative and evocative.
`.trim()
}

/**
 * Constrói o prompt para tradução do texto gerado para o português.
 */
export function buildTranslationPrompt(textEn: string): string {
  return `
Translate the following English text to Brazilian Portuguese.
Keep the same tone, style, and paragraph structure.
Output ONLY the Portuguese translation, nothing else.

"""
${textEn}
"""
`.trim()
}

function complexityLabel(level: number): string {
  if (level <= 2) return 'very simple, A1/A2 vocabulary, short sentences'
  if (level <= 4) return 'simple, B1 vocabulary, clear sentence structure'
  if (level <= 6) return 'intermediate, B2 vocabulary, varied sentence structure'
  if (level <= 8) return 'advanced, C1 vocabulary, complex sentences'
  return 'literary, C2 vocabulary, sophisticated prose'
}
