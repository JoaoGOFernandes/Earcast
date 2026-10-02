# Database — Earcast

## Schema completo

```sql
-- ============================================================
-- TEXTOS BRUTOS
-- ============================================================
create table texts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  content     text not null,
  status      text not null default 'locked'
                check (status in ('locked', 'unlocked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- VOCABULÁRIO EXTRAÍDO E CLASSIFICADO
-- ============================================================
create table vocabulary (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  word              text not null,
  source_text_id    uuid not null references texts(id) on delete cascade,
  relevance_score   float not null check (relevance_score >= 0 and relevance_score <= 1),
  relevance_reason  text,
  user_override     boolean not null default false,
  -- override_active: true = incluir mesmo abaixo do threshold
  --                  false = excluir mesmo acima do threshold
  --                  null = sem override (usa threshold)
  override_active   boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, word, source_text_id)
);

-- ============================================================
-- PLAYLISTS
-- ============================================================
create table playlists (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  source_text_ids   uuid[] not null,
  is_merged         boolean not null default false,
  merged_from_ids   uuid[],             -- playlist ids que foram mescladas
  status            text not null default 'active'
                      check (status in ('active', 'consolidating', 'archived')),
  dominance_score   float default 0     check (dominance_score >= 0 and dominance_score <= 1),
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

-- ============================================================
-- CONFIGURAÇÕES DE GERAÇÃO POR PLAYLIST
-- ============================================================
create table playlist_configs (
  id                    uuid primary key default gen_random_uuid(),
  playlist_id           uuid not null references playlists(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  theme                 text,                -- ex: "notícia de tecnologia"
  coverage_target       int not null default 85  -- % vocabulário conhecido
                          check (coverage_target between 50 and 100),
  complexity            int not null default 5   -- 1 (simples) a 10 (literário)
                          check (complexity between 1 and 10),
  voice                 text not null default 'en_US-lessac-medium',
  updated_at            timestamptz not null default now(),
  unique(playlist_id)
);

-- ============================================================
-- GERAÇÕES DIÁRIAS
-- ============================================================
create table generations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  playlist_id     uuid not null references playlists(id) on delete cascade,
  text_en         text not null,
  text_pt         text not null,
  audio_path      text,               -- path no Storage, null enquanto processing
  word_timestamps jsonb,              -- [{ word, start_ms, end_ms }]
  new_words       text[],             -- top-10 palavras por score usadas como destaque na geração (≠ "novas" no sentido SRS)
  status          text not null default 'processing'
                    check (status in ('processing', 'ready', 'error')),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- JOBS DE ÁUDIO (fila assíncrona)
-- ============================================================
create table audio_jobs (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null references generations(id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'processing', 'done', 'error')),
  attempts       int not null default 0,
  last_error     text,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- LSR ENGINE — REPETIÇÃO ESPAÇADA POR PALAVRA
-- ============================================================
create table word_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  word              text not null,
  playlist_id       uuid references playlists(id) on delete set null,
  -- null = palavra global (desvinculada de playlist específica)
  interval_days     int not null default 1,
  easiness_factor   float not null default 2.5,
  next_review_at    date not null default current_date + 1,
  last_reviewed_at  date,
  review_count      int not null default 0,
  difficulty_count  int not null default 0,
  is_global         boolean not null default false,
  -- Threshold: 3 marcações em playlists distintas → is_global = true
  distinct_playlist_difficulties  uuid[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, word)
);

-- ============================================================
-- EVENTOS DE MARCAÇÃO (Player)
-- ============================================================
create table review_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  generation_id  uuid not null references generations(id) on delete cascade,
  playlist_id    uuid not null references playlists(id),
  word           text not null,
  phrase         text,        -- contexto da frase onde a palavra apareceu
  mode           text not null check (mode in ('listening', 'reading')),
  marked_at      timestamptz not null default now()
);

-- ============================================================
-- CONFIGURAÇÕES DO USUÁRIO
-- ============================================================
create table user_settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  relevance_threshold       float not null default 0.2,
  daily_generation_hour     int not null default 7,  -- hora UTC
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
```

---

## Índices

```sql
create index on texts (user_id, status);
create index on vocabulary (user_id, source_text_id);
create index on vocabulary (user_id, relevance_score);
create index on playlists (user_id, status);
create index on generations (user_id, playlist_id, created_at desc);
create index on audio_jobs (status, next_retry_at);
create index on word_reviews (user_id, next_review_at);
create index on word_reviews (user_id, is_global);
create index on review_events (user_id, generation_id);
```

---

## RLS Policies

```sql
-- Ativa RLS em todas as tabelas
alter table texts enable row level security;
alter table vocabulary enable row level security;
alter table playlists enable row level security;
alter table playlist_configs enable row level security;
alter table generations enable row level security;
alter table audio_jobs enable row level security;
alter table word_reviews enable row level security;
alter table review_events enable row level security;
alter table user_settings enable row level security;

-- Política padrão: usuário só acessa seus próprios dados
-- (repita para cada tabela)

create policy "users manage own texts"
  on texts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own vocabulary"
  on vocabulary for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own playlists"
  on playlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own playlist_configs"
  on playlist_configs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own generations"
  on generations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users see own audio_jobs"
  on audio_jobs for select
  using (
    exists (
      select 1 from generations g
      where g.id = audio_jobs.generation_id
        and g.user_id = auth.uid()
    )
  );

create policy "users manage own word_reviews"
  on word_reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own review_events"
  on review_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypassa RLS (usado nas Edge Functions e webhooks)
-- Nunca use service role key no cliente

-- ============================================================
-- GRANTS para role authenticated (aplicados via migrations)
-- ============================================================
-- migration 20260616000002
grant select, insert, update, delete
  on texts, vocabulary, playlists, playlist_configs,
     generations, audio_jobs, word_reviews, review_events, user_settings
  to authenticated;

-- migration 20260616000003 (necessário para o trigger vocabulary_updated_at)
grant execute on function update_updated_at() to authenticated;
```

---

## Storage

```sql
-- Bucket privado para áudios
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false);

-- Apenas o service role escreve
-- Usuários leem via Signed URLs geradas server-side
create policy "service role manages audio"
  on storage.objects for all
  using (bucket_id = 'audio' and auth.role() = 'service_role');
```

---

## pg_cron — Rotina diária

```sql
-- Habilitar extensão (Supabase já tem disponível)
create extension if not exists pg_cron;

-- Função que enfileira geração diária para todos os usuários
create or replace function trigger_daily_generation()
returns void language plpgsql as $$
declare
  user_rec record;
begin
  for user_rec in
    select u.id as user_id, s.daily_generation_hour
    from auth.users u
    join user_settings s on s.user_id = u.id
    where extract(hour from now() at time zone 'UTC') = s.daily_generation_hour
  loop
    -- Insere um job de geração para cada playlist ativa do usuário
    insert into audio_jobs (generation_id, status)
    select gen_random_uuid(), 'pending'
    from playlists
    where user_id = user_rec.user_id
      and status = 'active';
  end loop;
end;
$$;

-- Roda a cada hora, a função filtra quem deve gerar agora
select cron.schedule(
  'daily-generation-check',
  '0 * * * *',
  $$ select trigger_daily_generation() $$
);
```

---

## Triggers úteis

```sql
-- Atualiza updated_at automaticamente
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger texts_updated_at
  before update on texts
  for each row execute function update_updated_at();

-- (repetir para vocabulary, word_reviews, audio_jobs, user_settings)

-- Cria user_settings ao registrar usuário
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```
