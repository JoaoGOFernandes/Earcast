import 'server-only'
import { z } from 'zod'

const EnvSchema = z.object({
  // Supabase — server-side
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Supabase — public (safe to expose)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Google Cloud
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  // JSON da service account — usado na Vercel; localmente fica vazio e o ADC do gcloud é usado
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
})

export const env = EnvSchema.parse(process.env)
