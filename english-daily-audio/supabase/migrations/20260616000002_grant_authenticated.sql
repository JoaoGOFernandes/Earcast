-- Concede permissões ao role authenticated em todas as tabelas.
-- Necessário no Supabase moderno onde auto_expose_new_tables é false por padrão.
-- O RLS continua sendo a barreira real — esses GRANTs apenas permitem o Postgres
-- chegar até as policies.

grant select, insert, update, delete on public.texts            to authenticated;
grant select, insert, update, delete on public.vocabulary       to authenticated;
grant select, insert, update, delete on public.playlists        to authenticated;
grant select, insert, update, delete on public.playlist_configs to authenticated;
grant select, insert, update, delete on public.generations      to authenticated;
grant select                         on public.audio_jobs       to authenticated;
grant select, insert, update, delete on public.word_reviews     to authenticated;
grant select, insert, update, delete on public.review_events    to authenticated;
grant select, insert, update, delete on public.user_settings    to authenticated;

-- service_role bypassa RLS e já tem acesso implícito — não precisa de GRANT explícito.
-- anon não precisa acessar nenhuma tabela diretamente (auth via cookie).
