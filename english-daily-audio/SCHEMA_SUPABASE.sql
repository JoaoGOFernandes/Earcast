-- ============================================================
-- EARCAST — SCHEMA COMPLETO DO SUPABASE
-- Copie todo este conteúdo e cole no SQL Editor do Supabase (Run)
-- ============================================================

-- 1. TABELAS PRINCIPAIS
create table if not exists public.texts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  content     text not null,
  status      text not null default 'locked' check (status in ('locked', 'unlocked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.vocabulary (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  word              text not null,
  source_text_id    uuid not null references texts(id) on delete cascade,
  relevance_score   float not null check (relevance_score >= 0 and relevance_score <= 1),
  relevance_reason  text,
  user_override     boolean not null default false,
  override_active   boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, word, source_text_id)
);

create table if not exists public.playlists (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  source_text_ids   uuid[] not null,
  is_merged         boolean not null default false,
  merged_from_ids   uuid[],
  status            text not null default 'active' check (status in ('active', 'consolidating', 'archived')),
  dominance_score   float default 0 check (dominance_score >= 0 and dominance_score <= 1),
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create table if not exists public.playlist_configs (
  id                uuid primary key default gen_random_uuid(),
  playlist_id       uuid not null references playlists(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  theme             text,
  coverage_target   int not null default 85 check (coverage_target between 50 and 100),
  complexity        int not null default 5  check (complexity between 1 and 10),
  voice             text not null default 'en_US-lessac-medium',
  updated_at        timestamptz not null default now(),
  unique(playlist_id)
);

create table if not exists public.generations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  playlist_id     uuid not null references playlists(id) on delete cascade,
  title           text,
  text_en         text not null,
  text_pt         text not null,
  audio_path      text,
  word_timestamps jsonb,
  new_words       text[],
  reviewed        boolean not null default false,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  created_at      timestamptz not null default now()
);

create table if not exists public.audio_jobs (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null references generations(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  attempts       int not null default 0,
  last_error     text,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.word_reviews (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  word                            text not null,
  playlist_id                     uuid references playlists(id) on delete set null,
  interval_days                   int not null default 1,
  easiness_factor                 float not null default 2.5,
  next_review_at                  date not null default current_date + 1,
  last_reviewed_at                date,
  review_count                    int not null default 0,
  difficulty_count                int not null default 0,
  is_global                       boolean not null default false,
  distinct_playlist_difficulties  uuid[] not null default '{}',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique(user_id, word)
);

create table if not exists public.review_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  generation_id  uuid not null references generations(id) on delete cascade,
  playlist_id    uuid not null references playlists(id),
  word           text not null,
  phrase         text,
  mode           text not null check (mode in ('listening', 'reading')),
  marked_at      timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  relevance_threshold     float not null default 0.2,
  daily_generation_hour   int not null default 7,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 2. ÍNDICES
create index if not exists idx_texts_user_status on texts (user_id, status);
create index if not exists idx_vocab_user_source on vocabulary (user_id, source_text_id);
create index if not exists idx_vocab_user_score on vocabulary (user_id, relevance_score);
create index if not exists idx_playlists_user_status on playlists (user_id, status);
create index if not exists idx_generations_user_pl_created on generations (user_id, playlist_id, created_at desc);
create index if not exists idx_audio_jobs_status_retry on audio_jobs (status, next_retry_at);
create index if not exists idx_word_reviews_user_next on word_reviews (user_id, next_review_at);
create index if not exists idx_word_reviews_user_global on word_reviews (user_id, is_global);
create index if not exists idx_review_events_user_gen on review_events (user_id, generation_id);

-- 3. RLS (ROW LEVEL SECURITY)
alter table texts enable row level security;
alter table vocabulary enable row level security;
alter table playlists enable row level security;
alter table playlist_configs enable row level security;
alter table generations enable row level security;
alter table audio_jobs enable row level security;
alter table word_reviews enable row level security;
alter table review_events enable row level security;
alter table user_settings enable row level security;

-- POLÍTICAS
drop policy if exists "users manage own texts" on texts;
create policy "users manage own texts" on texts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own vocabulary" on vocabulary;
create policy "users manage own vocabulary" on vocabulary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own playlists" on playlists;
create policy "users manage own playlists" on playlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own playlist_configs" on playlist_configs;
create policy "users manage own playlist_configs" on playlist_configs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own generations" on generations;
create policy "users manage own generations" on generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users see own audio_jobs" on audio_jobs;
create policy "users see own audio_jobs" on audio_jobs for select using (exists (select 1 from generations g where g.id = audio_jobs.generation_id and g.user_id = auth.uid()));

drop policy if exists "users manage own word_reviews" on word_reviews;
create policy "users manage own word_reviews" on word_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own review_events" on review_events;
create policy "users manage own review_events" on review_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own settings" on user_settings;
create policy "users manage own settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. GRANTS
grant all on public.texts to authenticated, service_role;
grant all on public.vocabulary to authenticated, service_role;
grant all on public.playlists to authenticated, service_role;
grant all on public.playlist_configs to authenticated, service_role;
grant all on public.generations to authenticated, service_role;
grant all on public.audio_jobs to authenticated, service_role;
grant all on public.word_reviews to authenticated, service_role;
grant all on public.review_events to authenticated, service_role;
grant all on public.user_settings to authenticated, service_role;

-- 5. FUNÇÕES E TRIGGERS
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

grant execute on function update_updated_at() to authenticated, service_role;

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Cria user_settings para usuários existentes que ainda não têm
insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- 6. STORAGE POLICIES
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

drop policy if exists "service role manages audio" on storage.objects;
create policy "service role manages audio"
  on storage.objects for all
  using (bucket_id = 'audio');
