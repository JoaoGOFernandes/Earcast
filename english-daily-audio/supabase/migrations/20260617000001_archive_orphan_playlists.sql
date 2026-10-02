-- Arquiva playlists ativas cujos source_text_ids apontam para textos que não existem mais.
-- Remove IDs órfãos do array e arquiva playlists que ficam vazias.

update playlists
set
  source_text_ids = filtered.valid_ids,
  status         = case when array_length(filtered.valid_ids, 1) > 0 then status else 'archived' end,
  archived_at    = case when array_length(filtered.valid_ids, 1) > 0 then archived_at else now() end
from (
  select
    p.id,
    array(
      select tid
      from unnest(p.source_text_ids) as tid
      where exists (select 1 from texts t where t.id = tid)
    ) as valid_ids
  from playlists p
  where p.status = 'active'
) as filtered
where playlists.id = filtered.id
  and filtered.valid_ids <> playlists.source_text_ids;
