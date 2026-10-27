import 'server-only'
import { z } from 'zod'
import { env } from '@/lib/env'

const ServiceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
})

export type GoogleCredentials = z.infer<typeof ServiceAccountSchema>

function parseCredentials(raw: string | undefined): GoogleCredentials | undefined {
  if (!raw) return undefined

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY não é um JSON válido')
  }

  const parsed = ServiceAccountSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY sem client_email/private_key válidos')
  }

  return {
    client_email: parsed.data.client_email,
    // A Vercel pode guardar a chave com "\n" literal em vez de quebra de linha
    private_key: parsed.data.private_key.replace(/\\n/g, '\n'),
  }
}

// undefined → bibliotecas do Google caem no ADC local (gcloud auth application-default login)
export const googleCredentials = parseCredentials(env.GOOGLE_SERVICE_ACCOUNT_KEY)
