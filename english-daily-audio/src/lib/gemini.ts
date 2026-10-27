import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { env } from '@/lib/env'
import { googleCredentials } from '@/lib/google-credentials'

const ai = new GoogleGenAI({
  vertexai: true,
  project: env.GOOGLE_CLOUD_PROJECT,
  location: 'us-central1',
  ...(googleCredentials && { googleAuthOptions: { credentials: googleCredentials } }),
})

export const GEMINI_MODEL = 'gemini-2.5-flash'
export const gemini = ai.models
