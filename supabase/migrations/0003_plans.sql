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
