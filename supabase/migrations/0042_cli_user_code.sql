-- SOVEREIGN AI — CLI/Cowork device-login: terib kiritiladigan kod (RFC 8628 user code) —
-- baza darajasidagi "ikkinchi qulf". Qayta ishga tushirish xavfsiz (idempotent).
--
-- TARTIB (muhim):
--   1) Yangi veb kodni deploy qiling (approveCliDevice → cli_approve_verified, topilmasa cli_approve).
--   2) 0038 → 0039 → 0040 → 0041 qo'llangan bo'lsin (0039: token_hash/approved_at, 0040: start_ip).
--   3) Keyin shu faylni qo'llang.
--   Eski veb kod (bu o'zgarishdan oldingi) cli_approve'ni foydalanuvchi JWT bilan chaqiradi —
--   bu fayl uni authenticated'dan olib qo'yadi, shuning uchun 1-qadamsiz CLI/Cowork login ishlamay qoladi.
--
-- Ilova kodi bu migratsiyasiz ham to'liq himoyalangan: user code = HMAC(server siri, device kodi)
-- (bazada saqlanmaydi), tekshiruv, 10 daqiqalik muddat va noto'g'ri urinishlar chegarasi serverda.
-- Bu fayl faqat quyidagini kafolatlaydi: tasdiqlashning YAGONA yo'li — server (service role),
-- u esa faqat to'g'ri terilgan koddan keyin chaqiradi. Tizimga kirgan foydalanuvchi (yoki uni
-- aldab brauzer konsolida skript ishga tushirtirgan hujumchi) PostgREST orqali kodsiz tasdiqlay olmaydi.
--
-- 1. cli_approve_verified(p_code, p_uid) — faqat service_role. 0040 dagi cli_approve bilan bir xil
--    semantika (faqat pending → approved, token + hash, 90 kun, egasining qayta chaqiruvi → true),
--    foydalanuvchi id'si esa parametr (server supabase.auth.getUser() bilan tekshirgan).
--    Qo'shimcha: kutilayotgan kod yaratilganidan 10 daqiqadan keyin tasdiqlanmaydi (user code muddati).
-- 2. cli_approve(text) va 0038 dagi cli_approve(text, text) — authenticated'dan olib qo'yiladi.
-- 3. 0038 dagi user_code ustunining default'i olib tashlanadi: ilova bazadagi kodni ishlatmaydi
--    (HMAC), har yangi qatorda hech kim ko'rmaydigan tasodifiy kod yaratish shart emas.

-- ═══════════════════════════════════════════════════════════════
-- 1. cli_approve_verified — server (service role) orqali tasdiqlash
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_approve_verified(p_code text, p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if p_uid is null or p_code is null or length(p_code) = 0 then
    return false;
  end if;
  -- Egasining o'z tasdiqlangan sessiyasi — o'zgarishsiz muvaffaqiyat (0035 / 0040 bilan bir xil).
  if exists (
    select 1 from public.cli_sessions
     where code = p_code and approved = true and user_id = p_uid and revoked_at is null
  ) then
    return true;
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update public.cli_sessions
     set user_id = p_uid,
         approved = true,
         approved_at = now(),
         token = v_token,                       -- faqat yetkazilgunga qadar (cli_poll o'chiradi)
         token_hash = public.cli_token_hash(v_token),
         start_ip = null,
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and approved = false
     and expires_at > now()
     and created_at > now() - interval '10 minutes';
  return found;
end;
$$;
revoke all on function public.cli_approve_verified(text, uuid) from public, anon, authenticated;
grant execute on function public.cli_approve_verified(text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 2. To'g'ridan-to'g'ri (kodsiz) tasdiqlash yo'llari yopiladi
-- ═══════════════════════════════════════════════════════════════
revoke all on function public.cli_approve(text) from public, anon, authenticated;
grant execute on function public.cli_approve(text) to service_role;

do $$
begin
  -- 0038 (5-bo'lim) qo'llangan bo'lsa.
  if to_regprocedure('public.cli_approve(text, text)') is not null then
    execute 'revoke all on function public.cli_approve(text, text) from public, anon, authenticated';
    execute 'grant execute on function public.cli_approve(text, text) to service_role';
  end if;
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. 0038 dagi user_code default'i (ishlatilmaydi)
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cli_sessions' and column_name = 'user_code'
  ) then
    execute 'alter table public.cli_sessions alter column user_code drop default';
  end if;
end
$$;
