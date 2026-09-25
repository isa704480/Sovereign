-- SOVEREIGN AI — server tomonidagi foydalanuvchi limiti (audit 2026-09-25)
--
-- 1. usage_daily: kunlik xabar hisoblagichi. Ilgari messages_today() brauzer
--    keyinroq syncConversation orqali yozadigan `messages` qatorlarini sanardi —
--    /api/chat'ga to'g'ridan-to'g'ri POST cheksiz edi. Endi server har so'rovda
--    atomik ravishda hisoblaydi.
-- 2. consume_message(p_limit)        — veb chat (authenticated, auth.uid()).
--    consume_message_for(uid, limit) — CLI (faqat service_role).
-- 3. cli_poll tokenni FAQAT BIR MARTA qaytaradi (delivered_at). Ilgari approve
--    qilingan kod 90 kun davomida tokenni har kimga qaytarardi (kod
--    /cli/connect?code=... havolasida, brauzer tarixida qoladi).

-- ═══════════════════════════════════════════════════════════════
-- 1. usage_daily
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.usage_daily (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  messages integer not null default 0,
  primary key (user_id, day)
);
alter table public.usage_daily enable row level security;
-- Siyosat yo'q: Data API orqali o'qib/yozib bo'lmaydi — faqat quyidagi
-- SECURITY DEFINER funksiyalar.

-- Ichki yordamchi: limit oshmasa +1 qiladi va true qaytaradi; aks holda false.
-- ON CONFLICT ... DO UPDATE ... WHERE qator qulfi ostida bajariladi — parallel
-- so'rovlar limitdan oshib keta olmaydi.
create or replace function public._consume_message(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if p_user is null or p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into public.usage_daily as u (user_id, day, messages)
  values (p_user, v_day, 1)
  on conflict (user_id, day) do update
     set messages = u.messages + 1
   where u.messages < p_limit
  returning u.messages into v_count;
  if not found then
    return false;
  end if;
  -- Eski kunlarni vaqti-vaqti bilan tozalash (jadval o'smasin).
  if random() < 0.001 then
    delete from public.usage_daily where day < v_day - 60;
  end if;
  return true;
end;
$$;
revoke all on function public._consume_message(uuid, integer) from public, anon, authenticated;

-- Veb chat: joriy foydalanuvchi (auth.uid()) uchun.
create or replace function public.consume_message(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._consume_message(auth.uid(), p_limit);
end;
$$;
revoke all on function public.consume_message(integer) from public, anon;
grant execute on function public.consume_message(integer) to authenticated;

-- CLI: server (service_role) token orqali aniqlangan foydalanuvchi uchun.
create or replace function public.consume_message_for(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._consume_message(p_user, p_limit);
end;
$$;
revoke all on function public.consume_message_for(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_message_for(uuid, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 2. cli_poll — token bir marta yetkaziladi
-- ═══════════════════════════════════════════════════════════════
alter table public.cli_sessions
  add column if not exists delivered_at timestamptz;

-- Migratsiyagacha approve bo'lgan sessiyalar allaqachon yetkazilgan hisoblanadi.
update public.cli_sessions
   set delivered_at = coalesce(last_used_at, now())
 where approved = true and delivered_at is null;

create or replace function public.cli_poll(p_code text)
returns table (approved boolean, token text)
language plpgsql
security definer
set search_path = public
as $$
declare v_token text;
begin
  update public.cli_sessions s
     set delivered_at = now()
   where s.code = p_code
     and s.approved = true
     and s.delivered_at is null
     and s.revoked_at is null
     and s.expires_at > now()
  returning s.token into v_token;
  if found then
    return query select true, v_token;
    return;
  end if;
  -- Hali tasdiqlanmagan (kutilmoqda). Yetkazilgan/eskirgan kod → qator yo'q.
  return query
    select false, null::text
      from public.cli_sessions s
     where s.code = p_code
       and s.approved = false
       and s.expires_at > now();
end;
$$;
revoke all on function public.cli_poll(text) from public;
grant execute on function public.cli_poll(text) to anon, authenticated;
