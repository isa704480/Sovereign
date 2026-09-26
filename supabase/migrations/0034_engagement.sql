-- SOVEREIGN — qayta jalb qilish: opt-in tip emaillari (2026-09-26).
-- Idempotent: qayta ishga tushirsa ham xato bermaydi.
--
-- Qoidalar (cron: /api/cron/engagement, soatiga bir marta):
--   * Faqat rozilik bergan (email_tips = true), emaili tasdiqlangan, bloklanmagan foydalanuvchi.
--   * Oxirgi faollik 30 soatdan eski bo'lsa.
--   * Bitta foydalanuvchiga ko'pi bilan 30 soatda 1 ta email.
--   * Ketma-ket ko'pi bilan 8 ta; foydalanuvchi qaytib kelsa (faollik > oxirgi email) hisob 0 dan.
--
-- Oxirgi faollik = eng kechkisi:
--   profiles.created_at, conversations.updated_at, usage_daily.day (+1 kun — kun oxiri,
--   ehtiyotkor taxmin), cli_sessions.last_used_at, auth.users.last_sign_in_at.

-- ═══════════════════════════════════════════════════════════════
-- 1. Ustunlar
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists email_tips        boolean not null default false,
  add column if not exists email_lang        text,
  add column if not exists last_tip_email_at timestamptz,
  add column if not exists tip_email_count   integer not null default 0,
  add column if not exists tip_email_seq     integer not null default 0;

comment on column public.profiles.email_tips is 'Opt-in: maslahat/yangilik emaillari (foydalanuvchi o''zi yoqadi/o''chiradi).';
comment on column public.profiles.email_lang is 'Tip emaillari tili (uz | uz-cyrl | ru | en). Opt-in paytida interfeys tilidan.';
comment on column public.profiles.last_tip_email_at is 'Oxirgi tip emaili vaqti (faqat server).';
comment on column public.profiles.tip_email_count is 'Foydalanuvchi qaytmaganidan beri ketma-ket yuborilgan tip emaillari (faqat server).';
comment on column public.profiles.tip_email_seq is 'Jami yuborilgan tip emaillari — maslahatlar navbati uchun (faqat server).';

alter table public.profiles drop constraint if exists profiles_email_lang_check;
alter table public.profiles
  add constraint profiles_email_lang_check
  check (email_lang is null or email_lang in ('uz', 'uz-cyrl', 'ru', 'en'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Himoya: hisoblagichlarni faqat server o'zgartiradi.
-- email_tips va email_lang — foydalanuvchi o'zi (RLS "own row update").
-- protect_plan_columns (0028) ga tegmaymiz — alohida trigger.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.protect_engagement_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.last_tip_email_at is distinct from old.last_tip_email_at or
       new.tip_email_count   is distinct from old.tip_email_count or
       new.tip_email_seq     is distinct from old.tip_email_seq then
      raise exception 'engagement counters can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_engagement on public.profiles;
create trigger profiles_protect_engagement
  before update on public.profiles
  for each row execute procedure public.protect_engagement_columns();

-- ═══════════════════════════════════════════════════════════════
-- 3. Oxirgi faollik (ichki yordamchi)
-- ═══════════════════════════════════════════════════════════════
create or replace function public._engagement_last_activity(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select p.created_at from public.profiles p where p.id = p_user),
    (select max(c.updated_at) from public.conversations c where c.user_id = p_user),
    (select ((max(u.day) + 1)::timestamp at time zone 'utc') from public.usage_daily u where u.user_id = p_user),
    (select max(s.last_used_at) from public.cli_sessions s where s.user_id = p_user),
    (select a.last_sign_in_at from auth.users a where a.id = p_user)
  );
$$;
revoke all on function public._engagement_last_activity(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. Navbatdagi oluvchilar (faqat o'qiydi; cron va ?dry=1 uchun)
-- tip_seq — maslahatlar ro'yxatidagi navbat (jami yuborilganlar soni).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.engagement_due_recipients(
  p_limit     integer  default 50,
  p_gap_hours integer  default 30,
  p_max       integer  default 8
)
returns table (
  user_id           uuid,
  email             text,
  full_name         text,
  lang              text,
  tip_seq           integer,
  last_activity     timestamptz,
  last_tip_email_at timestamptz,
  tip_email_count   integer
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id,
           a.email::text                              as email,
           p.full_name,
           coalesce(p.email_lang, 'en')               as lang,
           p.tip_email_seq,
           p.last_tip_email_at,
           p.tip_email_count,
           public._engagement_last_activity(p.id)     as la
      from public.profiles p
      join auth.users a on a.id = p.id
     where p.email_tips = true
       and a.email is not null
       and a.email_confirmed_at is not null
       and a.deleted_at is null
       and (a.banned_until is null or a.banned_until < now())
       and (p.last_tip_email_at is null
            or p.last_tip_email_at < now() - make_interval(hours => greatest(p_gap_hours, 1)))
  )
  select b.id, b.email, b.full_name, b.lang, b.tip_email_seq, b.la, b.last_tip_email_at, b.tip_email_count
    from base b
   where b.la < now() - make_interval(hours => greatest(p_gap_hours, 1))
     and (b.last_tip_email_at is null              -- hali yuborilmagan
          or b.la > b.last_tip_email_at            -- oxirgi emaildan keyin qaytgan
          or b.tip_email_count < greatest(p_max, 0))
   order by b.last_tip_email_at nulls first, b.la
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.engagement_due_recipients(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.engagement_due_recipients(integer, integer, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 5. Yuborishdan OLDIN band qilish (claim). Qaytaradi: band qilingan vaqt yoki null
-- (boshqa cron ishga tushishi ulgurgan / rozilik qaytarilgan / hali 30 soat o'tmagan /
-- limit tugagan). Parallel cron'lar bitta foydalanuvchiga ikki marta yozmaydi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.engagement_mark_sent(
  p_user      uuid,
  p_gap_hours integer default 30,
  p_max       integer default 8
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_la  timestamptz := public._engagement_last_activity(p_user);
  v_gap interval    := make_interval(hours => greatest(p_gap_hours, 1));
  v_now timestamptz := clock_timestamp();
begin
  if p_user is null or v_la is null or v_la >= now() - v_gap then
    return null;
  end if;
  update public.profiles p
     set tip_email_count   = case when p.last_tip_email_at is null or v_la > p.last_tip_email_at
                                  then 1 else p.tip_email_count + 1 end,
         tip_email_seq     = p.tip_email_seq + 1,
         last_tip_email_at = v_now
   where p.id = p_user
     and p.email_tips = true
     and (p.last_tip_email_at is null or p.last_tip_email_at < now() - v_gap)
     and (p.last_tip_email_at is null or v_la > p.last_tip_email_at or p.tip_email_count < greatest(p_max, 0));
  if not found then
    return null;
  end if;
  return v_now;
end;
$$;
revoke all on function public.engagement_mark_sent(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.engagement_mark_sent(uuid, integer, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 6. Yuborish muvaffaqiyatsiz bo'lsa — band qilishni qaytarish (faqat shu claim bo'lsa).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.engagement_unmark(
  p_user       uuid,
  p_claimed_at timestamptz,
  p_prev_at    timestamptz,
  p_prev_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
     set last_tip_email_at = p_prev_at,
         tip_email_count   = greatest(coalesce(p_prev_count, 0), 0),
         tip_email_seq     = greatest(p.tip_email_seq - 1, 0)
   where p.id = p_user
     and p.last_tip_email_at = p_claimed_at;
  return found;
end;
$$;
revoke all on function public.engagement_unmark(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.engagement_unmark(uuid, timestamptz, timestamptz, integer) to service_role;
