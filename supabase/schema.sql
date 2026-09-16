-- SOVEREIGN AI — barcha migratsiyalar bitta faylda (Supabase SQL Editor'ga to'liq joylashtiring)

-- SOVEREIGN AI — Phase 1 schema
-- Run this in Supabase Dashboard → SQL Editor (or `supabase db push`).

create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text,
  full_name            text,
  avatar_url           text,
  onboarding           jsonb,
  onboarding_completed boolean not null default false,
  default_model        text not null default 'claude-sonnet-4-5',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Onboarding answers and UI preferences.';

alter table public.profiles enable row level security;

drop policy if exists "profiles: own row select" on public.profiles;
create policy "profiles: own row select"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: own row update" on public.profiles;
create policy "profiles: own row update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Auto-create a profile row when a user signs up (email or OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- SOVEREIGN AI — Phase 2: conversations & messages
-- Content is stored as plain text for now; AES-256-GCM client-side encryption
-- (ARCHITECTURE.md §8) arrives with Phase 3 together with the personal vault.

create table if not exists public.conversations (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Yangi suhbat',
  model_id    text not null,
  research    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id              uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  model_id        text,
  citations       jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists conversations_user_updated on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_created on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations: own rows" on public.conversations;
create policy "conversations: own rows" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages: own rows" on public.messages;
create policy "messages: own rows" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute procedure public.set_updated_at();
