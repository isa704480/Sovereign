-- SOVEREIGN AI — 5-bosqich audit: baza xavfsizligi (database-1..6).
-- Qayta ishga tushirish xavfsiz (idempotent). Ilova kodini o'zgartirmasdan ishlaydi —
-- barcha RPC imzolari, grantlar va qaytish turlari o'zgarmagan (faqat yangi qo'shimchalar).
--
-- ESLATMA (tartib): bu fayl 0039_cli_token_hash.sql dan KEYIN yozildi, lekin raqami kichik.
-- db/migrate.ts qo'llanmagan fayllarni nomi bo'yicha tekshiradi, shuning uchun 0038 muammosiz
-- qo'llanadi. Bu fayl 0039'ga bog'liq emas (0039 ustunlariga tegadigan joy — shartli, 4-bo'lim),
-- toza bazada (0038 → 0039 tartibida) ham, prod'da (0039 → 0038) ham bir xil natija beradi.
--
-- 1 (HIGH, database-1)   record_token_usage (foydalanuvchi JWT): soxta sarf chegarasi.
-- 2 (LOW,  database-6)   answer_cache_write: uzunlik, kunlik limit, eski yozuvlarni tozalash.
-- 3 (LOW,  database-5)   messages.inserted_at (server vaqti) — admin faollik statistikasi shunga.
-- 4 (LOW,  database-2)   yetkazilgan / bekor qilingan CLI tokenlarining plaintext'i o'chiriladi.
-- 5 (LOW,  database-4)   CLI qurilma tasdig'i uchun qisqa user_code (2-argumentli cli_approve).

-- ═══════════════════════════════════════════════════════════════
-- 1 (HIGH, database-1): record_token_usage — har qanday foydalanuvchi PostgREST orqali
-- to'g'ridan-to'g'ri chaqirib ixtiyoriy model/provayder/upstream bilan soxta "sarf" yozardi.
-- Byudjet himoyasi (src/lib/econ/budget.ts) shu jadvaldan sarfni hisoblaydi va sarf
-- daromadning 50% idan oshsa BARCHA pullik foydalanuvchilarni tekin modellarga o'tkazadi.
-- Teskari hujum: har xil model satri yangi PK qatori → 100k qatordan keyin haqiqiy sarf
-- hisobdan tushib qoladi (guard ochiq qoladi).
--
-- To'liq tuzatish — ilova tomonda (veb chat record_token_usage_for'ni service client bilan
-- chaqirsin, keyin 0040'da bu funksiya authenticated'dan revoke qilinsin). Bu yerda —
-- chuqur himoya (defense in depth), veb chat xatti-harakati o'zgarmaydi:
--   a) Bitta chaqiruv jadvalga ham ko'pi bilan 100k (kirish+chiqish) yozadi — oylik kvota
--      (tokens_used_month) bilan bir xil. Ilova katta sarfni ≤100k bo'laklab yuboradi
--      (src/lib/chat/usage-chunks.ts), shuning uchun halol hisob yo'qolmaydi. Ilgari 200k edi.
--   b) Tarifning oylik token limiti × 1.5 + 200k (limitga yaqin katta so'rov, triage, parallel
--      so'rovlar uchun zaxira) dan oshgan yozuvlar narxlanmaydigan "~over-quota" qatoriga
--      yoziladi (tokenlar hisoblanadi, narx — yo'q; admin kartasida "unpriced" signal).
--      Ilova limitdan oshgan so'rovni rad etadi, shuning uchun halol foydalanuvchi bunga
--      deyarli yetmaydi; soxta sarf esa har akkauntga tarif limiti bilan cheklanadi
--      (free: ~425k token ≈ ko'pi bilan ~$11 ro'yxat narxida, ilgari — cheksiz).
--   c) Bir foydalanuvchi bir kunda ko'pi bilan 40 xil (model, provayder, upstream) qatori;
--      undan keyingi yangi kombinatsiyalar ham "~over-quota" qatoriga tushadi (qator portlashi yo'q).
-- profiles.tokens_used_month (kvota) avvalgidek oshadi.
-- ═══════════════════════════════════════════════════════════════

-- Tariflarning oylik token limiti (src/config/plans.ts limits.tokensPerMonth bilan bir xil
-- bo'lishi kerak — db/security-hardening.test.ts tekshiradi).
create or replace function public.plan_month_tokens(p text)
returns bigint
language sql
immutable
as $$
  select case p
           when 'starter' then 450000
           when 'pro'     then 1500000
           when 'ultra'   then 3000000
           else 150000
         end::bigint
$$;

create or replace function public.record_token_usage(
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null,
  p_upstream_model text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_exp timestamptz;
  v_used bigint;
  v_start timestamptz;
  v_day date := (now() at time zone 'utc')::date;
  -- _record_token_usage bilan bir xil normallashtirish (PK taqqoslash uchun).
  v_model text := left(coalesce(p_model, ''), 120);
  v_provider text := left(lower(coalesce(p_provider, '')), 40);
  v_upstream text := left(coalesce(p_upstream_model, ''), 160);
  v_untrusted boolean := false;
  v_in integer := least(greatest(0, coalesce(p_input_tokens, 0)), 100000);
  v_out integer := least(greatest(0, coalesce(p_output_tokens, 0)), 100000);
begin
  if v_uid is null then
    return;
  end if;
  -- (a) Bitta chaqiruv: kirish+chiqish ≤ 100k (nisbat saqlanadi).
  if v_in + v_out > 100000 then
    v_in := round(v_in::numeric * 100000 / (v_in + v_out))::integer;
    v_out := 100000 - v_in;
  end if;
  if v_in + v_out = 0 then
    return;
  end if;
  select pr.plan, pr.plan_expires_at, pr.tokens_used_month, pr.tokens_month_start
    into v_plan, v_exp, v_used, v_start
    from public.profiles pr
   where pr.id = v_uid;
  if not found then
    return;
  end if;
  -- effectivePlan (src/lib/auth/profile.ts): muddati o'tgan pullik tarif → free.
  if public.plan_rank(v_plan) = 0 or (v_exp is not null and v_exp < now()) then
    v_plan := 'free';
  end if;
  -- Yangi oy: hisob hali nollanmagan bo'lsa ham eski qiymat hisobga olinmaydi.
  if v_start is null or v_start < date_trunc('month', now()) then
    v_used := 0;
  end if;

  -- (b) Oylik tarif limiti × 1.5 + 200k dan keyin — narxlanmaydi.
  if coalesce(v_used, 0) >= public.plan_month_tokens(v_plan) * 3 / 2 + 200000 then
    v_untrusted := true;
  -- (c) Kunlik 40 xil qatordan keyin yangi kombinatsiya — narxlanmaydi.
  elsif not exists (
          select 1 from public.token_usage_daily t
           where t.day = v_day and t.user_id = v_uid
             and t.model = v_model and t.provider = v_provider and t.upstream_model = v_upstream
        )
    and (select count(*) from (
           select 1 from public.token_usage_daily t
            where t.day = v_day and t.user_id = v_uid
            limit 40
         ) x) >= 40 then
    v_untrusted := true;
  end if;

  if v_untrusted then
    -- Narxlanmaydi (unit economics'da "unpriced" sifatida ko'rinadi — admin uchun signal).
    v_model := '~over-quota';
    v_provider := '';
    v_upstream := '';
  end if;

  perform public._record_token_usage(v_uid, v_in, v_out, v_model, v_provider, v_upstream);
end;
$$;
revoke all on function public.record_token_usage(integer, integer, text, text, text) from public, anon;
grant execute on function public.record_token_usage(integer, integer, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2 (LOW, database-6): answer_cache_write — hajm/son chegarasi yo'q edi, jadval hech qachon
-- tozalanmasdi (24 soat faqat qidiruv filtri). Free akkaunt diskni to'ldirib, butun
-- loyihani read-only holatga tushira olardi. Imzo va grantlar o'zgarmagan; chegaradan
-- oshgan yozuv indamay tashlab yuboriladi (ilova xatoni baribir e'tiborsiz qoldiradi).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.answer_cache_write(
  p_query_hash text,
  p_query text,
  p_answer text,
  p_model text,
  p_embedding extensions.vector(1536)
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  -- Ilova chegaralari (src/lib/ai/cache.ts): javob ≤ 8000, so'rov ≤ 500, hash 16 belgi.
  if p_query_hash is null or length(p_query_hash) = 0 or length(p_query_hash) > 128
     or p_query is null or length(p_query) > 2000
     or p_answer is null or length(p_answer) > 8000
     or p_model is null or length(p_model) > 200
     or p_embedding is null then
    return;
  end if;
  -- Bir foydalanuvchi 24 soatda ko'pi bilan 500 ta yozuv (qidiruv baribir 24 soatlik).
  if (select count(*) from (
        select 1 from public.answer_cache ac
         where ac.user_id = v_uid
           and ac.created_at > now() - interval '24 hours'
         limit 500
      ) x) >= 500 then
    return;
  end if;
  -- Vaqti-vaqti bilan eski yozuvlarni tozalash (qidiruv faqat 24 soatlikni ko'radi).
  if random() < 0.01 then
    delete from public.answer_cache where created_at < now() - interval '48 hours';
  end if;
  insert into public.answer_cache (user_id, query_hash, query, answer, model, embedding)
  values (v_uid, p_query_hash, p_query, p_answer, p_model, p_embedding)
  on conflict do nothing;
end
$$;
revoke all on function public.answer_cache_write(text, text, text, text, extensions.vector) from public, anon;
grant execute on function public.answer_cache_write(text, text, text, text, extensions.vector) to authenticated;

-- Bir martalik tozalash: 48 soatdan eski yozuvlar hech qachon qaytarilmaydi.
delete from public.answer_cache where created_at < now() - interval '48 hours';

-- ═══════════════════════════════════════════════════════════════
-- 3 (LOW, database-5): messages.created_at klient tomonidan yoziladi (offline sinxron
-- tartibi uchun kerak — o'zgartirilmaydi), shuning uchun istalgan foydalanuvchi o'tgan
-- sanaga yozib admin DAU/WAU/MAU va kunlik statistikani buzardi. Endi server vaqti
-- (inserted_at) alohida saqlanadi: INSERT'da doim now(), UPDATE'da o'zgarmaydi.
-- Eski qatorlarda inserted_at NULL → coalesce(inserted_at, created_at).
-- ═══════════════════════════════════════════════════════════════
alter table public.messages add column if not exists inserted_at timestamptz;
alter table public.messages alter column inserted_at set default now();

create or replace function public.messages_set_inserted_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.inserted_at := now();
  else
    new.inserted_at := old.inserted_at;
  end if;
  return new;
end;
$$;
revoke all on function public.messages_set_inserted_at() from public, anon, authenticated;

drop trigger if exists messages_set_inserted_at on public.messages;
create trigger messages_set_inserted_at
  before insert or update on public.messages
  for each row execute procedure public.messages_set_inserted_at();

-- 0015 bilan bir xil, faqat vaqt ustuni server vaqti.
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
       where coalesce(inserted_at, created_at) >= now() - interval '1 day' and user_id is not null) as dau,
    (select count(distinct user_id) from public.messages
       where coalesce(inserted_at, created_at) >= now() - interval '7 days' and user_id is not null) as wau,
    (select count(distinct user_id) from public.messages
       where coalesce(inserted_at, created_at) >= now() - interval '30 days' and user_id is not null) as mau,
    (select count(*) from public.profiles
       where plan <> 'free' and (plan_expires_at is null or plan_expires_at > now())) as paying_users
  where exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;
revoke all on function public.admin_users_summary() from public;
grant execute on function public.admin_users_summary() to authenticated;

-- 0035 bilan bir xil (qaytish turi o'zgarmagan), faqat faollik server vaqti bo'yicha.
create or replace function public.admin_daily_stats(p_days integer default 30)
returns table (
  day date,
  new_users bigint,
  active_users bigint,
  messages_count bigint,
  tokens_used bigint,
  revenue_usd numeric,
  revenue_rub numeric
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
       where coalesce(m.inserted_at, m.created_at)::date = d.day) as active_users,
    (select count(*) from public.messages m
       where coalesce(m.inserted_at, m.created_at)::date = d.day and m.role = 'user') as messages_count,
    (select coalesce(sum(u.input_tokens + u.output_tokens), 0)::bigint
       from public.token_usage_daily u
      where u.day = d.day) as tokens_used,
    (select coalesce(sum(o.amount::numeric), 0)
       from public.orders o
      where o.paid_at::date = d.day and o.status = 'paid'
        and upper(coalesce(o.currency, 'USD')) = 'USD') as revenue_usd,
    (select coalesce(sum(o.amount::numeric), 0)
       from public.orders o
      where o.paid_at::date = d.day and o.status = 'paid'
        and upper(o.currency) = 'RUB') as revenue_rub
  from days d
  where exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  order by d.day desc;
$$;
revoke all on function public.admin_daily_stats(integer) from public, anon;
grant execute on function public.admin_daily_stats(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4 (LOW, database-2): 0039 dan oldin yetkazilgan CLI/Cowork tokenlari bazada plaintext
-- qolgan edi (0039 ning 2-bosqichi izohda). Qidiruv hash bo'yicha (0039), shuning uchun
-- token_hash bor yetkazilgan qatorlarning plaintext'ini o'chirish xavfsiz.
-- Shartli: toza bazada bu fayl 0039 dan oldin ishlaydi (token_hash hali yo'q) — o'tkaziladi.
-- Yetkazilmagan (cli_poll kutayotgan) qatorlarga TEGILMAYDI — CLI login buzilmaydi.
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cli_sessions' and column_name = 'token_hash'
  ) then
    execute $q$
      update public.cli_sessions
         set token = null
       where token is not null
         and token_hash is not null
         and delivered_at is not null
    $q$;
  end if;
end
$$;

-- Bekor qilingan yoki muddati o'tgan sessiya tokeni hech qayerda ishlamaydi — plaintext kerak emas.
update public.cli_sessions
   set token = null
 where token is not null
   and (revoked_at is not null or expires_at <= now());

-- ═══════════════════════════════════════════════════════════════
-- 5 (LOW, database-4): qurilma kodi fishingi. /cli/connect?code=... havolasini yuborib,
-- tizimga kirgan qurbon "Ruxsat berish"ni bossa, hujumchining CLI'si 90 kunlik token olardi.
-- Yechim (standart device flow): qisqa user_code faqat CLI/Cowork terminalida ko'rsatiladi,
-- URL'da emas; veb sahifa uni qo'lda kiritishni so'raydi. 5 marta xato → sessiya bekor.
--
-- Bu yerda — faqat bazaning qo'shimcha qismi (orqaga mos): user_code ustuni (cli_start
-- yozgan har yangi qatorga default orqali), cli_user_code (service role — /api/cli/start
-- CLI'ga qaytaradi), cli_approve(p_code, p_user_code). Eski cli_approve(p_code) o'zgarmagan;
-- veb + CLI + Cowork yangilangach 0040'da authenticated'dan revoke qilinadi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_gen_user_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  -- Chalkash belgilarsiz (0/O, 1/I yo'q), aniq 32 belgi → 256 % 32 = 0, bias yo'q.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(8);
  r text := '';
begin
  for i in 0..7 loop
    r := r || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return r;
end;
$$;
revoke all on function public.cli_gen_user_code() from public, anon, authenticated;
grant execute on function public.cli_gen_user_code() to service_role;

alter table public.cli_sessions add column if not exists user_code text;
alter table public.cli_sessions add column if not exists approve_attempts integer not null default 0;
-- Mavjud qatorlar NULL qoladi (kutilayotganlar 10 daqiqada eskiradi); yangi qatorlar — default.
alter table public.cli_sessions alter column user_code set default public.cli_gen_user_code();

-- /api/cli/start (service role): cli_start qaytargan code uchun user_code — faqat CLI'ga.
create or replace function public.cli_user_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.user_code
    from public.cli_sessions s
   where s.code = p_code
     and s.approved = false
     and s.revoked_at is null
     and s.expires_at > now()
   limit 1
$$;
revoke all on function public.cli_user_code(text) from public, anon, authenticated;
grant execute on function public.cli_user_code(text) to service_role;

create or replace function public.cli_approve(p_code text, p_user_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_expected text;
  -- "abcd-efgh", " ABCD EFGH " → "ABCDEFGH"
  v_input text := upper(regexp_replace(coalesce(p_user_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select s.user_code into v_expected
    from public.cli_sessions s
   where s.code = p_code
     and s.approved = false
     and s.revoked_at is null
     and s.expires_at > now()
   for update;
  if not found then
    -- Kutilayotgan kod yo'q: egasining o'z tasdiqlangan sessiyasi → true (0035), aks holda false.
    return public.cli_approve(p_code);
  end if;
  if v_expected is null or length(v_input) = 0 or v_input <> v_expected then
    update public.cli_sessions
       set approve_attempts = approve_attempts + 1,
           revoked_at = case when approve_attempts + 1 >= 5 then now() else revoked_at end
     where code = p_code;
    return false;
  end if;
  -- Kod to'g'ri — asosiy mantiq (token, hash, muddat) bitta joyda: cli_approve(p_code).
  return public.cli_approve(p_code);
end;
$$;
revoke all on function public.cli_approve(text, text) from public, anon;
grant execute on function public.cli_approve(text, text) to authenticated;

-- database-3 (connector tokenlari shifrlanmagan) — bu faylda emas: ilova darajasidagi
-- AES-256-GCM ("enc:v1:") va 0040_connector_token_encryption.sql bilan yopiladi.
