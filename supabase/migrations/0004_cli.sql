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
