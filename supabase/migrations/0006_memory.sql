-- SOVEREIGN AI — persistent memory (facts the AI remembers across chats)
create table if not exists public.memory_nodes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  kind        text not null default 'fact' check (kind in ('fact', 'preference', 'project', 'person')),
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists memory_user_created on public.memory_nodes (user_id, created_at desc);

alter table public.memory_nodes enable row level security;

drop policy if exists "memory: own rows" on public.memory_nodes;
create policy "memory: own rows" on public.memory_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Memory on/off preference lives on the profile.
alter table public.profiles
  add column if not exists memory_enabled boolean not null default true;
