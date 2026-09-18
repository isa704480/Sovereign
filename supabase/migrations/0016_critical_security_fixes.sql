-- KRITIK xavfsizlik tuzatishlari — audit 2026-09-18
-- 4 ta CRITICAL + 3 ta HIGH davomiy zaifliklarni yopadi.

-- ═══════════════════════════════════════════════════════════════
-- FIX 1 (CRITICAL): is_admin ustunini foydalanuvchi o'zi o'zgartira olmasin
-- FIX 2 (CRITICAL): tokens_used_month va tokens_month_start ni ham
-- ═══════════════════════════════════════════════════════════════
create or replace function public.protect_plan_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.plan is distinct from old.plan or
       new.plan_expires_at is distinct from old.plan_expires_at then
      raise exception 'plan can only be changed by the server';
    end if;
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin can only be changed by the server';
    end if;
    if new.tokens_used_month is distinct from old.tokens_used_month or
       new.tokens_month_start is distinct from old.tokens_month_start then
      raise exception 'token usage can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

-- Column-level UPDATE ni ham bekor qilamiz — defense in depth
revoke update (is_admin, tokens_used_month, tokens_month_start) on public.profiles from authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 2 (CRITICAL) davomi: record_token_usage manfiy son qabul qilmaydi
-- ═══════════════════════════════════════════════════════════════
create or replace function public.record_token_usage(
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_in integer := greatest(0, coalesce(p_input_tokens, 0));
  v_out integer := greatest(0, coalesce(p_output_tokens, 0));
  v_total integer := v_in + v_out;
begin
  if v_uid is null then return; end if;
  if v_total = 0 then return; end if;
  if v_total > 100000 then v_total := 100000; end if; -- bir chaqiruvda maksimum 100k
  update public.profiles
     set tokens_used_month = case
           when tokens_month_start < date_trunc('month', now())
             then v_total
           else greatest(0, tokens_used_month) + v_total
         end,
         tokens_month_start = case
           when tokens_month_start < date_trunc('month', now())
             then date_trunc('month', now())
           else tokens_month_start
         end
   where id = v_uid;
end;
$$;
revoke all on function public.record_token_usage(integer, integer, text, text) from public;
grant execute on function public.record_token_usage(integer, integer, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 3 (CRITICAL): plan_status IDOR — auth.uid() bilan gate
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.plan_status(uuid);
create or replace function public.plan_status(p_user_id uuid default auth.uid())
returns table (
  plan text,
  state text,
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
   where p.id = p_user_id
     and p.id = auth.uid();  -- IDOR yopildi: faqat o'zining plan holati
$$;

revoke all on function public.plan_status(uuid) from public;
grant execute on function public.plan_status(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 5+18 (HIGH): messages jadvalida token maydonlarini foydalanuvchi
-- INSERT paytida yozib qo'ymasin — server tanlagan qiymat qoladi.
-- ═══════════════════════════════════════════════════════════════
alter table public.messages
  add constraint messages_tokens_non_negative check (
    (input_tokens is null or input_tokens >= 0) and
    (output_tokens is null or output_tokens >= 0)
  );

-- Trigger: authenticated user INSERT paytida input_tokens/output_tokens NULL bo'lsin
create or replace function public.messages_strip_tokens_on_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    new.input_tokens := null;
    new.output_tokens := null;
    new.created_at := coalesce(new.created_at, now());
    -- Foydalanuvchi kelajakdagi vaqtni yoza olmaydi
    if new.created_at > now() + interval '1 minute' then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_strip_tokens on public.messages;
create trigger messages_strip_tokens
  before insert on public.messages
  for each row execute procedure public.messages_strip_tokens_on_insert();

-- ═══════════════════════════════════════════════════════════════
-- FIX 10 (HIGH): orders — foydalanuvchi soxta "paid" order yasay olmasin.
-- INSERT policy'ga qat'iy check qo'shamiz.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "orders: own insert" on public.orders;
create policy "orders: own insert" on public.orders
  for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and plan in ('starter', 'pro', 'ultra')
    and id like 'sov_%'
  );

-- ═══════════════════════════════════════════════════════════════
-- FIX 21 (MEDIUM): admin_daily_stats p_days ni cheklash
-- ═══════════════════════════════════════════════════════════════
create or replace function public.admin_daily_stats(p_days integer default 30)
returns table (
  day date,
  new_users bigint,
  active_users bigint,
  messages_count bigint,
  tokens_used bigint,
  revenue_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with clamped as (select least(greatest(coalesce(p_days, 30), 1), 365) as d),
  days as (
    select generate_series(
      (now() - (c.d || ' days')::interval)::date,
      now()::date,
      interval '1 day'
    )::date as day
    from clamped c
  )
  select
    d.day,
    (select count(*) from public.profiles pr where pr.created_at::date = d.day) as new_users,
    (select count(distinct user_id) from public.messages m
       where m.created_at::date = d.day) as active_users,
    (select count(*) from public.messages m
       where m.created_at::date = d.day and m.role = 'user') as messages_count,
    (select coalesce(sum(coalesce(m.input_tokens, 0) + coalesce(m.output_tokens, 0)), 0)
       from public.messages m
      where m.created_at::date = d.day) as tokens_used,
    (select coalesce(sum(o.amount::numeric), 0)
       from public.orders o
      where o.paid_at::date = d.day and o.status = 'paid') as revenue_usd
  from days d
  where exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  order by d.day desc;
$$;
revoke all on function public.admin_daily_stats(integer) from public;
grant execute on function public.admin_daily_stats(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 23 (HIGH): cli_messages_today — approved_at ustuni yo'q edi
-- (approved boolean bor). Quota check silent-fail qilardi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_messages_today(p_token text)
returns integer
language plpgsql
stable
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
     and expires_at > now()
   limit 1;
  if v_uid is null then
    return 0;
  end if;
  return (
    select count(*)::int
      from public.messages m
     where m.user_id = v_uid
       and m.role = 'user'
       and m.created_at >= date_trunc('day', now())
  );
end;
$$;
revoke all on function public.cli_messages_today(text) from public;
grant execute on function public.cli_messages_today(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 26 (MEDIUM): my_token_status endi FAQAT ratio qaytaradi.
-- Ilgari used/limit_month ham qaytardi — mahsulot va'dasini buzardi.
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.my_token_status();
create or replace function public.my_token_status()
returns table (
  ratio real,
  state text
)
language sql
stable
security definer
set search_path = public
as $$
  with prof as (
    select
      p.tokens_used_month as used,
      case p.plan
        when 'free'    then 150000
        when 'starter' then 450000
        when 'pro'     then 1500000
        when 'ultra'   then 3000000
        else 0
      end::bigint as lim,
      p.plan_expires_at
      from public.profiles p
     where p.id = auth.uid()
  )
  select
    case when p.lim = 0 then 0
         else least(1.0, p.used::real / p.lim::real)
    end as ratio,
    case
      when p.lim = 0 then 'unlimited'
      when p.used >= p.lim then 'empty'
      when p.used >= p.lim * 0.9 then 'low'
      when p.used >= p.lim * 0.6 then 'mid'
      else 'high'
    end as state
    from prof p;
$$;
revoke all on function public.my_token_status() from public;
grant execute on function public.my_token_status() to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 22 (MEDIUM): cli_approve endi tokenni ROTATE qiladi (coalesce emas).
-- Ilgari birinchi tokendan boshlab abadiy ishlar edi.
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.cli_approve(text);
create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         -- Har approve'da yangi token — token compromise abadiy qolmasligi uchun
         token = encode(gen_random_bytes(32), 'hex'),
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and (approved = false or user_id = v_uid);
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public;
grant execute on function public.cli_approve(text) to authenticated;
