-- SOVEREIGN — Token tizimi + Admin panel infratuzilmasi

-- ═══════════════════════════════════════════════════════════════
-- 1. profiles.is_admin flag (admin panelga faqat admin kiradi)
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ═══════════════════════════════════════════════════════════════
-- 2. Token hisobini messages jadvaliga qo'shish
-- ═══════════════════════════════════════════════════════════════
alter table public.messages
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists model_id text,
  add column if not exists provider text;

create index if not exists messages_created_user_idx on public.messages (created_at, user_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. profiles.tokens_used_month — oy davomida ishlatilgan token
-- Har oy boshida 0 ga tushiriladi (yoki plan yangilanganda)
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists tokens_used_month bigint not null default 0,
  add column if not exists tokens_month_start timestamptz not null default date_trunc('month', now());

-- Foydalanuvchining hozirgi token holatini qaytaradi (aniq son ko'rinmaydi!)
create or replace function public.my_token_status()
returns table (
  used bigint,
  limit_month bigint,
  ratio real,
  period_start timestamptz,
  period_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with prof as (
    select p.tokens_used_month as used,
           p.tokens_month_start,
           p.plan
      from public.profiles p
     where p.id = auth.uid()
  ),
  lim as (
    select case p.plan
             when 'free'    then 150000
             when 'starter' then 450000
             when 'pro'     then 1500000
             when 'ultra'   then 3000000
             else 0
           end::bigint as limit_month,
           p.tokens_used_month as used,
           p.tokens_month_start as period_start,
           (p.tokens_month_start + interval '1 month') as period_end
      from public.profiles p
     where p.id = auth.uid()
  )
  select
    l.used,
    l.limit_month,
    case when l.limit_month = 0 then 0
         else least(1.0, l.used::real / l.limit_month::real)
    end as ratio,
    l.period_start,
    l.period_end
  from lim l;
$$;

revoke all on function public.my_token_status() from public;
grant execute on function public.my_token_status() to authenticated;

-- Har xabarga tokenlarni qo'shib profil counterini yangilash
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
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  -- Har oy boshida hisoblagichni tozalash (idempotent)
  update public.profiles
     set tokens_used_month = case
           when tokens_month_start < date_trunc('month', now())
             then p_input_tokens + p_output_tokens
           else tokens_used_month + p_input_tokens + p_output_tokens
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
-- 4. Admin analytics RPClari — faqat is_admin=true bo'lganlar chaqira oladi
-- ═══════════════════════════════════════════════════════════════

-- Umumiy foydalanuvchi soni + oy bo'yicha DAU/WAU/MAU
create or replace function public.admin_users_summary()
returns table (
  total_users bigint,
  new_today bigint,
  dau bigint,
  wau bigint,
  mau bigint,
  paying_users bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles) as total_users,
    (select count(*) from public.profiles where created_at >= now() - interval '1 day') as new_today,
    (select count(distinct user_id) from public.messages
       where created_at >= now() - interval '1 day' and user_id is not null) as dau,
    (select count(distinct user_id) from public.messages
       where created_at >= now() - interval '7 days' and user_id is not null) as wau,
    (select count(distinct user_id) from public.messages
       where created_at >= now() - interval '30 days' and user_id is not null) as mau,
    (select count(*) from public.profiles
       where plan <> 'free' and (plan_expires_at is null or plan_expires_at > now())) as paying_users
  where exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

revoke all on function public.admin_users_summary() from public;
grant execute on function public.admin_users_summary() to authenticated;

-- Kunlik daromad va tokenlar (oxirgi 30 kun)
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
  with days as (
    select generate_series(
      (now() - (p_days || ' days')::interval)::date,
      now()::date,
      interval '1 day'
    )::date as day
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

-- Tarif bo'yicha taqsimot (pie chart uchun)
create or replace function public.admin_plan_distribution()
returns table (
  plan text,
  users_count bigint,
  active_users bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.plan, 'free') as plan,
    count(*) as users_count,
    count(*) filter (
      where exists (
        select 1 from public.messages m
         where m.user_id = p.id and m.created_at >= now() - interval '7 days'
      )
    ) as active_users
    from public.profiles p
   where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true)
   group by p.plan;
$$;

revoke all on function public.admin_plan_distribution() from public;
grant execute on function public.admin_plan_distribution() to authenticated;

-- Oxirgi to'lovlar ro'yxati (jadval uchun)
create or replace function public.admin_recent_orders(p_limit integer default 25)
returns table (
  id text,
  user_email text,
  plan text,
  amount text,
  currency text,
  status text,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    p.email as user_email,
    o.plan,
    o.amount,
    o.currency,
    o.status,
    o.paid_at,
    o.created_at
    from public.orders o
    left join public.profiles p on p.id = o.user_id
   where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true)
   order by o.created_at desc
   limit p_limit;
$$;

revoke all on function public.admin_recent_orders(integer) from public;
grant execute on function public.admin_recent_orders(integer) to authenticated;

-- Foydalanuvchi admin ekanligini tekshirish helper
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user_id), false);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
