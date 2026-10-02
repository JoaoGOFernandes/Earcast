-- A tabela vocabulary tinha um trigger update_updated_at mas sem coluna updated_at.
-- Isso causava 42501 em todo UPDATE (overrideWordRelevance, upsert no unlock).

alter table vocabulary
  add column updated_at timestamptz not null default now();

-- Também garante permissão de execução da função trigger para authenticated.
grant execute on function update_updated_at() to authenticated;
