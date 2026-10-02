import 'server-only'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { buildTranslationPrompt } from './prompt-builder'
import { type Result, ok, err } from '@/lib/result'

const TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout after 120s')), TIMEOUT_MS),
    ),
  ])
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .trim()
}

/**
 * Gera o texto em inglês usando o Gemini com o prompt fornecido.
 */
export async function generateEnglishText(
  prompt: string,
): Promise<Result<string>> {
  try {
    const response = await withTimeout(
      gemini.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 1.5 },
      }),
    )
    return ok(stripMarkdown(response.text ?? ''))
  } catch (e) {
    return err(`Generation failed: ${String(e)}`)
  }
}

/**
 * Traduz o texto para o português usando o Gemini.
 */
export async function translateToPt(textEn: string): Promise<Result<string>> {
  try {
    const prompt = buildTranslationPrompt(textEn)
    const response = await withTimeout(
      gemini.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      }),
    )
    return ok((response.text ?? '').trim())
  } catch (e) {
    return err(`Translation failed: ${String(e)}`)
  }
}
