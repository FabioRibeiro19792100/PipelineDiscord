alter table public.pipeline_assets
add column if not exists creators integer;

alter table public.pipeline_assets
add column if not exists plugin_accesses integer;

update public.pipeline_assets
set creators = participants
where creators is null
  and participants is not null;

insert into public.pipeline_stages (slug, name, owner, blocker_text, is_active, position)
values
  ('plugin', 'Plugin', 'Jeff', 'A pessoa entra no Discord, mas não ativa o plugin de inspeção Roblox. Sem isso, perdemos a métrica inicial de creators.', false, 3)
on conflict (slug) do update
set
  name = excluded.name,
  owner = excluded.owner,
  blocker_text = excluded.blocker_text,
  is_active = excluded.is_active,
  position = excluded.position;

alter table public.pipeline_stages
alter column is_active set default false;

update public.pipeline_stages
set is_active = false
where slug in ('tiktok-ads', 'landing', 'discord', 'plugin', 'programacao');

update public.pipeline_stages
set position = 4
where slug = 'programacao';
