-- FIX / FEATURE: Plan muddati va CLI↔Web sync
-- 1. profiles ga enabled_skills TEXT[] qo'shamiz
-- 2. cli_whoami xohlagan barcha sozlamalarni qaytaradi
-- 3. cli_update_settings RPC — CLI Web bilan bir xil sozlamani sinxronlaydi
-- 4. plan_status helper — expired / expiring_soon / active

-- ═══════════════════════════════════════════════════════════════
-- 1. profiles.enabled_skills ustuni
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists enabled_skills text[] not null default '{"ui-ux-pro-max","clean-code"}';

-- ═══════════════════════════════════════════════════════════════
-- 2. cli_whoami — endi skillar va model ham qaytaradi
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.cli_whoami(text);
create or replace function public.cli_whoami(p_token text)
returns table (
  user_id uuid,
  email text,
  plan text,
  plan_expires_at timestamptz,
  default_model text,
  enabled_skills text[],
  memory_enabled boolean
)
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
    select
      s.user_id,
      pr.email,
      coalesce(pr.plan, 'free'),
      pr.plan_expires_at,
      coalesce(pr.default_model, 'meta-llama/llama-3.3-70b-instruct:free'),
      coalesce(pr.enabled_skills, ARRAY['ui-ux-pro-max','clean-code']::text[]),
      coalesce(pr.memory_enabled, true)
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

-- ═══════════════════════════════════════════════════════════════
-- 3. cli_update_settings — CLI'dagi o'zgarishlar profilga yoziladi
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_update_settings(
  p_token text,
  p_enabled_skills text[] default null,
  p_default_model text default null,
  p_memory_enabled boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select user_id into v_uid
    from public.cli_sessions
   where token = p_token
     and approved = true
     and revoked_at is null
     and expires_at > now();
  if v_uid is null then
    return false;
  end if;

  update public.profiles
     set enabled_skills = coalesce(p_enabled_skills, enabled_skills),
         default_model = coalesce(p_default_model, default_model),
         memory_enabled = coalesce(p_memory_enabled, memory_enabled)
   where id = v_uid;
  return true;
end;
$$;
revoke all on function public.cli_update_settings(text, text[], text, boolean) from public;
grant execute on function public.cli_update_settings(text, text[], text, boolean) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. plan_status — barcha profilelar bo'yicha holat
-- ═══════════════════════════════════════════════════════════════
create or replace function public.plan_status(p_user_id uuid default auth.uid())
returns table (
  plan text,
  state text,           -- 'free' | 'active' | 'expiring_soon' | 'expired'
  days_left integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.plan, 'free') as plan,
    case
      when p.plan = 'free' or p.plan is null then 'free'
      when p.plan_expires_at is null then 'active'
      when p.plan_expires_at < now() then 'expired'
      when p.plan_expires_at < now() + interval '7 days' then 'expiring_soon'
      else 'active'
    end as state,
    case
      when p.plan = 'free' or p.plan is null then null
      when p.plan_expires_at is null then null
      else greatest(0, extract(day from (p.plan_expires_at - now()))::integer)
    end as days_left,
    p.plan_expires_at as expires_at
    from public.profiles p
   where p.id = p_user_id;
$$;

revoke all on function public.plan_status(uuid) from public;
grant execute on function public.plan_status(uuid) to authenticated;

-- Har profil egasi o'z profilining `enabled_skills` va boshqa sozlamalarni
-- yangilashi mumkin — RLS `own profile update` allaqachon ruxsat beradi.
