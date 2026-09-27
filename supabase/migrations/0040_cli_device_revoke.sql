-- SOVEREIGN AI — CLI/Cowork device-login: phishing'ga qarshi kontekst, rad etish va
-- server tomonida tokenni bekor qilish (audit cli-api-1, cli-api-2, cli-api-3, cli-api-4).
-- 0039 dan KEYIN ishga tushiriladi. Qayta ishga tushirish xavfsiz (idempotent).
-- Ilova kodi bu migratsiyasiz ham ishlaydi (yangi RPC topilmasa eski yo'lga qaytadi).
--
-- 1. cli_sessions.start_ip / start_country — kirishni BOSHLAGAN qurilma tarmog'i.
--    Tasdiqlash sahifasi uni brauzer tarmog'i bilan solishtiradi (boshqa mamlakat → ogohlantirish).
--    IP faqat qisqa muddat saqlanadi: cli_approve/cli_deny va cli_start tozalashi uni o'chiradi.
-- 2. cli_start(p_device, p_ip, p_country): kutish oynasi 10 → 5 daqiqa (CLI/Cowork 5 daqiqa kutadi,
--    kech tasdiqlangan "yetim" kod qolmaydi — cli-api-4).
-- 3. cli_deny(p_code): "Bekor qilish" tugmasi kodni serverda ham bekor qiladi.
-- 4. cli_revoke_self(p_token): `sov logout` / Cowork chiqishi tokenni serverda bekor qiladi
--    (POST /api/cli/logout). Veb "Ulangan qurilmalar" sahifasi 0012 dagi cli_sessions_list /
--    cli_revoke'dan foydalanadi (yangi SQL shart emas).
-- 5. 0039 ning 2-bosqichi: yetkazilgan tokenlarning plaintext nusxasini o'chirish (cli-api-3).

-- ═══════════════════════════════════════════════════════════════
-- 1. Ustunlar
-- ═══════════════════════════════════════════════════════════════
alter table public.cli_sessions add column if not exists start_ip text;
alter table public.cli_sessions add column if not exists start_country text;

-- cli_start tozalashi uchun (IP'si hali o'chirilmagan qatorlar kam bo'ladi).
create index if not exists cli_sessions_start_ip_pending
  on public.cli_sessions (created_at)
  where start_ip is not null;

-- ═══════════════════════════════════════════════════════════════
-- 2. cli_start: IP/mamlakat + 5 daqiqalik kutish oynasi
-- ═══════════════════════════════════════════════════════════════
-- Eski imzo (text) o'chiriladi: bir xil nomli ikki funksiya PostgREST'da
-- "could not choose the best candidate" xatosini beradi. Yangi imzodagi default'lar
-- tufayli eski chaqiruv ({p_device}) ham ishlayveradi.
drop function if exists public.cli_start(text);
create or replace function public.cli_start(
  p_device text default null,
  p_ip text default null,
  p_country text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare c text;
begin
  delete from public.cli_sessions where expires_at < now() - interval '1 hour';
  -- 0039: yetkazilmay qolgan tasdiqlangan tokenlar bekor qilinadi.
  update public.cli_sessions
     set token = null,
         revoked_at = now()
   where approved = true
     and delivered_at is null
     and revoked_at is null
     and coalesce(approved_at, created_at) < now() - interval '15 minutes';
  -- Maxfiylik: boshlovchi IP 1 soatdan ortiq saqlanmaydi (mamlakat qoladi — qurilmalar ro'yxati uchun).
  update public.cli_sessions
     set start_ip = null
   where start_ip is not null
     and created_at < now() - interval '1 hour';
  c := encode(gen_random_bytes(24), 'hex');
  insert into public.cli_sessions (code, device_name, start_ip, start_country, expires_at)
  values (
    c,
    left(coalesce(p_device, ''), 80),
    nullif(left(coalesce(p_ip, ''), 64), ''),
    nullif(upper(left(coalesce(p_country, ''), 2)), ''),
    now() + interval '5 minutes'
  );
  return c;
end;
$$;
revoke all on function public.cli_start(text, text, text) from public, anon, authenticated;
grant execute on function public.cli_start(text, text, text) to service_role;

-- Kutilayotgan qator uchun standart muddat ham 5 daqiqa (boshqa yo'l bilan qo'shilsa).
alter table public.cli_sessions alter column expires_at set default (now() + interval '5 minutes');

-- ═══════════════════════════════════════════════════════════════
-- 3. cli_approve: 0039 bilan bir xil + boshlovchi IP o'chiriladi
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
         start_ip = null,
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
-- 4. cli_deny: tasdiqlash sahifasidagi "Bekor qilish" — kutilayotgan kodni bekor qiladi
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_deny(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Faqat hali tasdiqlanmagan kod (kodni bilgan kirgan foydalanuvchi uni faqat o'chira oladi).
  update public.cli_sessions
     set revoked_at = now(),
         token = null,
         start_ip = null
   where code = p_code
     and approved = false
     and revoked_at is null;
  return found;
end;
$$;
revoke all on function public.cli_deny(text) from public, anon;
grant execute on function public.cli_deny(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 5. cli_revoke_self: token egasi (CLI/Cowork) o'z tokenini bekor qiladi
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_revoke_self(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text := public.cli_token_hash(p_token);
begin
  if v_hash is null then
    return false;
  end if;
  update public.cli_sessions
     set revoked_at = now(),
         token = null
   where token_hash = v_hash
     and revoked_at is null;
  if found then
    return true;
  end if;
  -- 0039 dan oldingi, hash'i yo'q qator (backward-compatible).
  update public.cli_sessions
     set revoked_at = now(),
         token = null
   where token_hash is null
     and token = p_token
     and revoked_at is null;
  return found;
end;
$$;
revoke all on function public.cli_revoke_self(text) from public;
grant execute on function public.cli_revoke_self(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 6. (0039, 2-bosqich) yetkazilgan tokenlarning plaintext nusxasi o'chiriladi.
--    Barcha qidiruvlar token_hash bo'yicha (0039); hash mos kelgan qatorlargina tegiladi.
--    0039 ishlayotgani tekshirilgandan keyin ishga tushiring.
-- ═══════════════════════════════════════════════════════════════
update public.cli_sessions
   set token = null
 where token is not null
   and delivered_at is not null
   and token_hash is not null
   and token_hash = public.cli_token_hash(token);
