-- Altera o default da coluna e atualiza todos os usuários que ainda têm o valor padrão antigo (0.4).
alter table user_settings
  alter column relevance_threshold set default 0.2;

update user_settings
  set relevance_threshold = 0.2
  where relevance_threshold = 0.4;
