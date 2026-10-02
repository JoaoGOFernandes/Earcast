-- SQL MIGRATION: Execute este snippet no SQL Editor do Supabase se necessário:
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS pronunciation text;
ALTER TABLE public.texts ADD COLUMN IF NOT EXISTS parts jsonb DEFAULT '[]'::jsonb;
