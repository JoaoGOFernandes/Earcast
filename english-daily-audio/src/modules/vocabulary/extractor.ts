// Stopwords básicas do inglês — expandir se necessário
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'nor',
  'so', 'yet', 'as', 'if', 'then', 'than', 'that', 'this', 'it', 'its',
  'he', 'she', 'they', 'we', 'i', 'you', 'his', 'her', 'their', 'our',
  'my', 'your', 'what', 'which', 'who', 'whom', 'when', 'where', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'up', 'out', 'about', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'own', 'same', 'too', 'very',
])

/**
 * Tokeniza o texto e retorna palavras únicas e phrasal verbs candidatos ao vocabulário.
 * Remove stopwords isoladas, pontuação e palavras muito curtas, mas preserva phrasal verbs e collocations.
 */
export function extractCandidateWords(text: string): string[] {
  const cleanText = text.toLowerCase().replace(/[^a-z\-\s']/g, ' ')
  const rawWords = cleanText.split(/\s+/).filter((w) => w.length > 0)

  const candidates = new Set<string>()

  // 1. Single words (filtrando stopwords e palavras curtas)
  for (const word of rawWords) {
    if (word.length >= 3 && !STOPWORDS.has(word) && !/^-+$/.test(word)) {
      candidates.add(word)
    }
  }

  // 2. Candidate Phrasal Verbs e Collocations (bigrams e trigrams com preposições/partículas de phrasal verb)
  const PHRASAL_PARTICLES = new Set([
    'up', 'out', 'off', 'on', 'in', 'down', 'away', 'back', 'over', 'into',
    'about', 'after', 'through', 'for', 'along', 'across', 'around', 'with',
  ])

  for (let i = 0; i < rawWords.length - 1; i++) {
    const w1 = rawWords[i]
    const w2 = rawWords[i + 1]

    // Bigram phrasal verb: [verb] + [particle] (ex: give up, turn off, run out)
    if (w1.length >= 2 && PHRASAL_PARTICLES.has(w2) && !STOPWORDS.has(w1)) {
      candidates.add(`${w1} ${w2}`)
    }

    // Trigram phrasal verb: [verb] + [particle] + [prep/particle] (ex: run out of, look forward to)
    if (i < rawWords.length - 2) {
      const w3 = rawWords[i + 2]
      if (w1.length >= 2 && PHRASAL_PARTICLES.has(w2) && PHRASAL_PARTICLES.has(w3)) {
        candidates.add(`${w1} ${w2} ${w3}`)
      }
    }
  }

  return Array.from(candidates)
}

/**
 * Conta a frequência de cada palavra no texto original.
 * Útil para o Gemini decidir relevância por frequência.
 */
export function countWordFrequencies(text: string): Map<string, number> {
  const freq = new Map<string, number>()
  const tokens = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)

  for (const token of tokens) {
    if (token.length < 2) continue
    freq.set(token, (freq.get(token) ?? 0) + 1)
  }

  return freq
}
