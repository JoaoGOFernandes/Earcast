-- Adiciona coluna reviewed para marcar gerações cujas sessões de listening
-- já foram processadas pelo LSR Engine.
-- Usado por processSessionEnd para garantir idempotência.
--
-- APLICAR MANUALMENTE no Supabase Dashboard (SQL Editor).

alter table public.generations
  add column if not exists reviewed boolean not null default false;
