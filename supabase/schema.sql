-- SOVEREIGN AI — barcha migratsiyalar bitta faylda (Supabase SQL Editor'ga to'liq joylashtiring)

-- ==== supabase/migrations/0001_profiles.sql ====
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

-- ==== supabase/migrations/0002_chat.sql ====
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

-- ==== supabase/migrations/0003_plans.sql ====
-- SOVEREIGN AI — subscription plan on profiles
alter table public.profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'starter', 'pro', 'ultra')),
  add column if not exists plan_expires_at timestamptz;

comment on column public.profiles.plan is 'free | starter | pro | ultra (payment integration later)';

-- Users must not be able to upgrade themselves through the Data API.
create or replace function public.protect_plan_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated'
     and (new.plan is distinct from old.plan or new.plan_expires_at is distinct from old.plan_expires_at) then
    raise exception 'plan can only be changed by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_plan on public.profiles;
create trigger profiles_protect_plan
  before update on public.profiles
  for each row execute procedure public.protect_plan_columns();

-- Daily usage counter helper (user messages today, UTC)
create or replace function public.messages_today(uid uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.messages
  where user_id = uid
    and role = 'user'
    and created_at >= date_trunc('day', now());
$$;

-- ==== supabase/migrations/0004_cli.sql ====
-- SOVEREIGN AI — CLI device login (browser approval flow)
-- The table is never exposed through the Data API (RLS on, no policies);
-- only the SECURITY DEFINER functions below touch it, each scoped to a
-- high-entropy code/token, so no service-role key is required.

create table if not exists public.cli_sessions (
  code         text primary key,
  token        text unique,
  user_id      uuid references auth.users (id) on delete cascade,
  device_name  text,
  approved     boolean not null default false,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  last_used_at timestamptz
);

alter table public.cli_sessions enable row level security;
-- (no policies → the Data API cannot read or write this table)

-- 1) CLI starts a login: returns a fresh device code.
create or replace function public.cli_start(p_device text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  delete from public.cli_sessions where expires_at < now() - interval '1 hour';
  c := encode(gen_random_bytes(24), 'hex');
  insert into public.cli_sessions (code, device_name) values (c, left(coalesce(p_device, ''), 80));
  return c;
end;
$$;

-- 2) CLI polls: returns the token once the browser approved it.
create or replace function public.cli_poll(p_code text)
returns table (approved boolean, token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select s.approved, case when s.approved then s.token else null end
    from public.cli_sessions s
    where s.code = p_code and s.expires_at > now();
end;
$$;

-- 3) Browser (logged-in user) approves a code → issues a token bound to them.
create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid; t text;
begin
  uid := auth.uid();
  if uid is null then
    return false;
  end if;
  t := 'sov_' || encode(gen_random_bytes(32), 'hex');
  update public.cli_sessions
    set approved = true, user_id = uid, token = t
    where code = p_code and approved = false and expires_at > now();
  return found;
end;
$$;

-- 4) Chat route resolves a token → user id + plan.
create or replace function public.cli_whoami(p_token text)
returns table (user_id uuid, email text, plan text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cli_sessions set last_used_at = now() where token = p_token;
  return query
    select s.user_id, pr.email, coalesce(pr.plan, 'free')
    from public.cli_sessions s
    join public.profiles pr on pr.id = s.user_id
    where s.token = p_token and s.user_id is not null;
end;
$$;

revoke all on function public.cli_start(text) from public;
revoke all on function public.cli_poll(text) from public;
revoke all on function public.cli_approve(text) from public;
revoke all on function public.cli_whoami(text) from public;
grant execute on function public.cli_start(text) to anon, authenticated;
grant execute on function public.cli_poll(text) to anon, authenticated;
grant execute on function public.cli_approve(text) to authenticated;
grant execute on function public.cli_whoami(text) to anon, authenticated;

-- ==== supabase/migrations/0005_pgcrypto.sql ====
-- gen_random_bytes() (used by the CLI login functions) needs pgcrypto.
create extension if not exists pgcrypto with schema extensions;

-- Make the extension schema visible to the SECURITY DEFINER functions.
alter function public.cli_start(text) set search_path = public, extensions;
alter function public.cli_approve(text) set search_path = public, extensions;

