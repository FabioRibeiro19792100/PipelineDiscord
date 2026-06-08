create extension if not exists pgcrypto;

create table if not exists public.pipeline_stages (
  slug text primary key,
  name text not null,
  owner text,
  blocker_text text not null,
  is_active boolean not null default true,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_history (
  id uuid primary key default gen_random_uuid(),
  stage_slug text not null references public.pipeline_stages(slug) on delete cascade,
  entry_date date not null,
  description text not null,
  evidence_url text,
  is_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stage_slug, entry_date)
);

create table if not exists public.pipeline_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  external_url text not null,
  published_on date not null,
  views integer,
  visits integer,
  joins integer,
  participants integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stage_status_events (
  id uuid primary key default gen_random_uuid(),
  stage_slug text not null references public.pipeline_stages(slug) on delete cascade,
  is_active boolean not null,
  changed_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_pipeline_stages_updated_at on public.pipeline_stages;
create trigger touch_pipeline_stages_updated_at
before update on public.pipeline_stages
for each row execute function public.touch_updated_at();

drop trigger if exists touch_pipeline_history_updated_at on public.pipeline_history;
create trigger touch_pipeline_history_updated_at
before update on public.pipeline_history
for each row execute function public.touch_updated_at();

drop trigger if exists touch_pipeline_assets_updated_at on public.pipeline_assets;
create trigger touch_pipeline_assets_updated_at
before update on public.pipeline_assets
for each row execute function public.touch_updated_at();

alter table public.pipeline_stages enable row level security;
alter table public.pipeline_history enable row level security;
alter table public.pipeline_assets enable row level security;
alter table public.pipeline_stage_status_events enable row level security;

drop policy if exists "pipeline stages read" on public.pipeline_stages;
create policy "pipeline stages read" on public.pipeline_stages
for select using (true);

drop policy if exists "pipeline stages write" on public.pipeline_stages;
create policy "pipeline stages write" on public.pipeline_stages
for all using (true) with check (true);

drop policy if exists "pipeline history read" on public.pipeline_history;
create policy "pipeline history read" on public.pipeline_history
for select using (true);

drop policy if exists "pipeline history write" on public.pipeline_history;
create policy "pipeline history write" on public.pipeline_history
for all using (true) with check (true);

drop policy if exists "pipeline assets read" on public.pipeline_assets;
create policy "pipeline assets read" on public.pipeline_assets
for select using (true);

drop policy if exists "pipeline assets write" on public.pipeline_assets;
create policy "pipeline assets write" on public.pipeline_assets
for all using (true) with check (true);

drop policy if exists "pipeline status read" on public.pipeline_stage_status_events;
create policy "pipeline status read" on public.pipeline_stage_status_events
for select using (true);

drop policy if exists "pipeline status write" on public.pipeline_stage_status_events;
create policy "pipeline status write" on public.pipeline_stage_status_events
for all using (true) with check (true);

insert into public.pipeline_stages (slug, name, owner, blocker_text, is_active, position)
values
  ('tiktok-ads', 'TikTok Ads', 'Nicolas', 'Nenhum novo tráfego entra no pipeline. Os demais elos ficam dependentes de bases já existentes.', true, 0),
  ('landing', 'Landing', 'Jeff', 'O tráfego chega, mas a pessoa não encontra o caminho claro para entrar na comunidade.', true, 1),
  ('discord', 'Discord', 'Nicolas / Murilo', 'Pessoas entram no Discord, mas não entendem regras, próximos passos ou onde participar.', true, 2),
  ('programacao', 'Programação', 'Nicolas', 'A comunidade perde motivo para retornar, conversar e participar depois da entrada inicial.', true, 3)
on conflict (slug) do update
set
  name = excluded.name,
  owner = excluded.owner,
  blocker_text = excluded.blocker_text,
  is_active = excluded.is_active,
  position = excluded.position;
