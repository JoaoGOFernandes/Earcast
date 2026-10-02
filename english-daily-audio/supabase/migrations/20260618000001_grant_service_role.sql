-- Garante acesso total do service_role às tabelas do pipeline de áudio.
-- Necessário para que o webhook /api/webhooks/audio-ready e o job-dispatcher
-- consigam fazer INSERT/UPDATE usando a SUPABASE_SERVICE_ROLE_KEY.
--
-- APLICADO MANUALMENTE no Supabase Dashboard (SQL Editor) em 2026-06-18.
-- Manter aqui para documentação e reprodução em novos ambientes.

grant all on public.generations to service_role;
grant all on public.audio_jobs to service_role;
