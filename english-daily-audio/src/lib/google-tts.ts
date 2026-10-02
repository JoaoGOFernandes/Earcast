import 'server-only'
import { v1beta1, protos } from '@google-cloud/text-to-speech'

type SynthesizeResponse = protos.google.cloud.texttospeech.v1beta1.ISynthesizeSpeechResponse
const { SSML_MARK } = protos.google.cloud.texttospeech.v1beta1.SynthesizeSpeechRequest.TimepointType

const client = new v1beta1.TextToSpeechClient()

export interface WordTimestamp {
  word: string
  start_ms: number
  end_ms: number
}

export interface TTSResult {
  audioBase64: string
  wordTimestamps: WordTimestamp[]
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToSSML(text: string): { ssml: string; words: string[] } {
  const tokens = text.split(/(\s+)/)
  const words: string[] = []
  let idx = 0
  const body = tokens
    .map((token) => {
      if (/^\s+$/.test(token)) return token
      const word = token.replace(/[^\w'-]/g, '')
      words.push(word)
      return `<mark name="w${idx++}"/>${escapeXml(token)}`
    })
    .join('')
  return { ssml: `<speak>${body}</speak>`, words }
}

export async function synthesizeWithWordTimestamps(
  text: string,
  voice = 'en-US-Neural2-D',
): Promise<TTSResult> {
  const { ssml, words } = textToSSML(text)

  const [response] = await (client.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: 'en-US', name: voice },
    audioConfig: { audioEncoding: 'MP3' },
    enableTimePointing: [SSML_MARK],
  }) as Promise<[SynthesizeResponse, unknown, unknown]>)

  const audioBase64 = Buffer.from(response.audioContent as Uint8Array).toString('base64')

  const timepoints = (response.timepoints ?? [])
    .slice()
    .sort((a, b) => (a.timeSeconds ?? 0) - (b.timeSeconds ?? 0))

  const wordTimestamps: WordTimestamp[] = timepoints.map((tp, i) => {
    const start_ms = Math.round((tp.timeSeconds ?? 0) * 1000)
    const rawEnd = i < timepoints.length - 1
      ? Math.round((timepoints[i + 1].timeSeconds ?? 0) * 1000)
      : Math.round(((tp.timeSeconds ?? 0) + 0.5) * 1000)
    return {
      word: words[i] ?? tp.markName ?? '',
      start_ms,
      end_ms: Math.max(rawEnd, start_ms + 100),
    }
  })

  return { audioBase64, wordTimestamps }
}
