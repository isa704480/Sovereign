-- FIX 20: CLI sessiya cheksiz emas — tokenning `expires_at` ni tekshiradi.
-- Approved holatida `expires_at` yangilanib +90 kun beriladi.

alter table public.cli_sessions
  add column if not exists revoked_at timestamptz;

drop function if exists public.cli_approve(text);
create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and (approved = false or user_id = v_uid);
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public;
grant execute on function public.cli_approve(text) to authenticated;

drop function if exists public.cli_whoami(text);
create or replace function public.cli_whoami(p_token text)
returns table (user_id uuid, email text, plan text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cli_sessions
     set last_used_at = now()
   where token = p_token
     and approved = true
     and revoked_at is null
     and expires_at > now();
  return query
    select s.user_id, pr.email, coalesce(pr.plan, 'free')
      from public.cli_sessions s
      join public.profiles pr on pr.id = s.user_id
     where s.token = p_token
       and s.user_id is not null
       and s.approved = true
       and s.revoked_at is null
       and s.expires_at > now();
end;
$$;
revoke all on function public.cli_whoami(text) from public;
grant execute on function public.cli_whoami(text) to anon, authenticated;

-- Foydalanuvchi o'z sessiyalarini ko'radi va bekor qila oladi.
create or replace function public.cli_sessions_list()
returns table (code text, device_name text, created_at timestamptz, expires_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.code, s.device_name, s.created_at, s.expires_at, s.last_used_at
    from public.cli_sessions s
   where s.user_id = auth.uid() and s.revoked_at is null and s.approved = true
   order by s.created_at desc;
$$;
revoke all on function public.cli_sessions_list() from public;
grant execute on function public.cli_sessions_list() to authenticated;

create or replace function public.cli_revoke(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cli_sessions
     set revoked_at = now()
   where code = p_code and user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.cli_revoke(text) from public;
grant execute on function public.cli_revoke(text) to authenticated;
