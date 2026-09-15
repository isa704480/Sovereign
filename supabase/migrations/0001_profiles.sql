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
