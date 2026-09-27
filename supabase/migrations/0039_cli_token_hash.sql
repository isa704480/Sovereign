-- SOVEREIGN AI — CLI tokenlarini hash'lash (known gap §8.8/3) + yetkazilmagan tokenlar oynasi.
-- Qayta ishga tushirish xavfsiz (idempotent). Ilova kodini o'zgartirish SHART EMAS:
-- barcha /api/cli marshrutlari tokenni faqat RPC'larga (p_token) uzatadi, jadvalni o'zi o'qimaydi.
--
-- 1. cli_sessions.token_hash (sha256 hex) + unique indeks + mavjud tokenlar uchun backfill.
--    Trigger: token qaysi funksiya yozmasin, hash doim sinxron (eski cli_approve qaytarilsa ham).
-- 2. Qidiruv hash bo'yicha; hash'i yo'q eski qatorlar uchun plaintext fallback (backward-compatible).
-- 3. cli_poll tokenni yetkazgach plaintext'ni o'chiradi (token = null) — bazada faqat hash qoladi.
-- 4. (cli-api-4) Tasdiqlangan, lekin yetkazilmagan token faqat approved_at + 15 daqiqa ichida
--    yetkaziladi; undan keyin cli_start tozalashi uni bekor qiladi (brauzer tarixidagi ?code= bilan
--    90 kun davomida tokenni olib ketish yopiladi).
-- 5. (Ixtiyoriy, 2-bosqich — pastda izohda) yetkazilgan barcha qatorlarning plaintext'ini o'chirish.

-- ═══════════════════════════════════════════════════════════════
-- 1. Ustunlar, indeks, hash yordamchisi, trigger, backfill
-- ═══════════════════════════════════════════════════════════════
alter table public.cli_sessions add column if not exists token_hash text;
alter table public.cli_sessions add column if not exists approved_at timestamptz;

create or replace function public.cli_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
           when p_token is null or length(p_token) = 0 or length(p_token) > 512 then null
           else encode(digest(p_token, 'sha256'), 'hex')
         end;
$$;
-- Faqat SECURITY DEFINER funksiyalar ichida (egasi huquqi bilan) ishlatiladi.
revoke all on function public.cli_token_hash(text) from public, anon, authenticated;
grant execute on function public.cli_token_hash(text) to service_role;

create or replace function public.cli_sessions_sync_token_hash()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.token is not null and (tg_op = 'INSERT' or new.token is distinct from old.token) then
    new.token_hash := public.cli_token_hash(new.token);
  end if;
  if new.approved and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.cli_sessions_sync_token_hash() from public, anon, authenticated;

drop trigger if exists cli_sessions_sync_token_hash on public.cli_sessions;
create trigger cli_sessions_sync_token_hash
  before insert or update on public.cli_sessions
  for each row execute procedure public.cli_sessions_sync_token_hash();

-- Backfill (trigger ham to'ldiradi, lekin aniq bo'lsin).
update public.cli_sessions
   set token_hash = public.cli_token_hash(token)
 where token is not null and token_hash is null;

-- Mavjud tasdiqlangan qatorlar: approved_at noma'lum → created_at (pending 10 daqiqa edi,
-- shuning uchun eski yetkazilmagan qatorlar yetkazish oynasidan tashqarida qoladi).
update public.cli_sessions
   set approved_at = created_at
 where approved = true and approved_at is null;

create unique index if not exists cli_sessions_token_hash_key
  on public.cli_sessions (token_hash)
  where token_hash is not null;

-- ═══════════════════════════════════════════════════════════════
-- 2. Token → foydalanuvchi: hash bo'yicha, fallback plaintext (faqat hash'i yo'q qatorlar)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_uid(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := public.cli_token_hash(p_token);
  v_uid uuid;
begin
  if v_hash is null then
    return null;
  end if;
  select s.user_id into v_uid
    from public.cli_sessions s
   where s.token_hash = v_hash
     and s.approved = true
     and s.revoked_at is null
     and s.expires_at > now()
   limit 1;
  if v_uid is null then
    -- Fallback: 0039 dan oldin yozilgan va hali hash'lanmagan qator (backward-compatible).
    select s.user_id into v_uid
      from public.cli_sessions s
     where s.token_hash is null
       and s.token = p_token
       and s.approved = true
       and s.revoked_at is null
       and s.expires_at > now()
     limit 1;
  end if;
  return v_uid;
end;
$$;
revoke all on function public.cli_uid(text) from public;
grant execute on function public.cli_uid(text) to anon, authenticated;

-- (qaytish turi o'zgarmagan — drop shart emas, grantlar saqlanadi)
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
set search_path = public, extensions
as $$
declare
  v_hash text := public.cli_token_hash(p_token);
  v_code text;
begin
  if v_hash is null then
    return;
  end if;
  select s.code into v_code
    from public.cli_sessions s
   where s.token_hash = v_hash
     and s.approved = true
     and s.revoked_at is null
     and s.expires_at > now()
   limit 1;
  if v_code is null then
    -- Fallback + lazy backfill (trigger token_hash'ni to'ldiradi).
    select s.code into v_code
      from public.cli_sessions s
     where s.token_hash is null
       and s.token = p_token
       and s.approved = true
       and s.revoked_at is null
       and s.expires_at > now()
     limit 1;
    if v_code is not null then
      update public.cli_sessions
         set token_hash = public.cli_token_hash(p_token)
       where code = v_code and token_hash is null;
    end if;
  end if;
  if v_code is null then
    return;
  end if;

  update public.cli_sessions set last_used_at = now() where code = v_code;
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
     where s.code = v_code
       and s.user_id is not null;
end;
$$;
revoke all on function public.cli_whoami(text) from public;
grant execute on function public.cli_whoami(text) to anon, authenticated;

create or replace function public.cli_update_settings(
  p_token text,
  p_enabled_skills text[] default null,
  p_default_model text default null,
  p_memory_enabled boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid := public.cli_uid(p_token);
begin
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

create or replace function public.cli_messages_today(p_token text)
returns integer
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_uid uuid := public.cli_uid(p_token);
begin
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
-- 3. cli_approve: token + hash + approved_at (0035 xatti-harakati saqlanadi)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  -- Egasining o'z tasdiqlangan sessiyasi — o'zgarishsiz muvaffaqiyat (0035).
  if exists (
    select 1 from public.cli_sessions
     where code = p_code and approved = true and user_id = v_uid and revoked_at is null
  ) then
    return true;
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         approved_at = now(),
         token = v_token,                       -- faqat yetkazilgunga qadar (cli_poll o'chiradi)
         token_hash = public.cli_token_hash(v_token),
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and approved = false
     and expires_at > now();
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public, anon;
grant execute on function public.cli_approve(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. cli_poll: bir marta yetkazish, keyin plaintext o'chiriladi; yetkazish oynasi 15 daqiqa
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_poll(p_code text)
returns table (approved boolean, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_token text;
begin
  select s.token into v_token
    from public.cli_sessions s
   where s.code = p_code
     and s.approved = true
     and s.delivered_at is null
     and s.revoked_at is null
     and s.expires_at > now()
     and s.token is not null
     and coalesce(s.approved_at, s.created_at) > now() - interval '15 minutes'
   for update;
  if found then
    update public.cli_sessions s
       set delivered_at = now(),
           token = null          -- bazada faqat token_hash qoladi
     where s.code = p_code;
    return query select true, v_token;
    return;
  end if;
  -- Hali tasdiqlanmagan (kutilmoqda). Yetkazilgan/eskirgan kod → qator yo'q.
  return query
    select false, null::text
      from public.cli_sessions s
     where s.code = p_code
       and s.approved = false
       and s.revoked_at is null
       and s.expires_at > now();
end;
$$;
revoke all on function public.cli_poll(text) from public, anon, authenticated;
grant execute on function public.cli_poll(text) to service_role;

-- cli_start: eskirganlarni o'chirish + yetkazilmay qolgan tasdiqlangan tokenlarni bekor qilish.
create or replace function public.cli_start(p_device text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare c text;
begin
  delete from public.cli_sessions where expires_at < now() - interval '1 hour';
  update public.cli_sessions
     set token = null,
         revoked_at = now()
   where approved = true
     and delivered_at is null
     and revoked_at is null
     and coalesce(approved_at, created_at) < now() - interval '15 minutes';
  c := encode(gen_random_bytes(24), 'hex');
  insert into public.cli_sessions (code, device_name) values (c, left(coalesce(p_device, ''), 80));
  return c;
end;
$$;
revoke all on function public.cli_start(text) from public, anon, authenticated;
grant execute on function public.cli_start(text) to service_role;

create index if not exists cli_sessions_undelivered
  on public.cli_sessions (approved_at)
  where approved = true and delivered_at is null and revoked_at is null;

-- ═══════════════════════════════════════════════════════════════
-- 5. (2-BOSQICH — deploy va tekshiruvdan keyin qo'lda) yetkazilgan qatorlarning plaintext'i.
--    Yuqoridagi funksiyalar hash bo'yicha qidiradi, shuning uchun bu xavfsiz; fallback faqat
--    token_hash IS NULL qatorlar uchun kerak, backfill'dan keyin bunday qator qolmaydi.
-- ═══════════════════════════════════════════════════════════════
-- update public.cli_sessions
--    set token = null
--  where token is not null
--    and token_hash is not null
--    and delivered_at is not null;
