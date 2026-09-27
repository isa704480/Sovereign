-- SOVEREIGN AI — ops bot hodisalari (Telegram lentasi va admin "Ops lentasi" kartasi uchun).
--
-- IXTIYORIY. Asosiy ombor — Upstash (ops:events ro'yxati). Bu jadval:
--   * Upstash sozlanmagan bo'lsa — hodisalar ro'yxati shu yerda saqlanadi;
--   * Upstash bilan birga OPS_EVENTS_TABLE=1 bo'lsa — uzoq muddatli nusxa.
-- Ilova kodi bu migratsiyasiz ham ishlaydi (jadval topilmasa bir marta log va jim davom).
--
-- MAXFIYLIK: faqat niqoblangan / yig'ma qiymatlar (email "ab***@domen", mamlakat kodi, tarif,
-- summa, provayder/model id, xato sinfi). Xabar matni, IP, token, to'liq email, user_id YO'Q.
-- RLS yoqilgan, siyosat yo'q: anon/authenticated o'qiy olmaydi — faqat service_role (server).
-- Qayta ishga tushirish xavfsiz (idempotent).

create table if not exists public.ops_events (
  id    text primary key check (char_length(id) <= 200),         -- barqaror dedupe id ("signup:<uuid>", "breaker:groq::open:<min>")
  t     timestamptz not null default now(),
  type  text not null check (type in (
          'signup', 'payment', 'renewal', 'refund', 'chargeback', 'breaker', 'failover',
          'budget', 'release', 'deploy', 'device_login', 'device_revoke')),
  d     jsonb not null default '{}'::jsonb check (pg_column_size(d) <= 4096)
);

create index if not exists ops_events_t on public.ops_events (t desc);
create index if not exists ops_events_type_t on public.ops_events (type, t desc);

alter table public.ops_events enable row level security;
revoke all on table public.ops_events from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_events to service_role;

-- Saqlash muddati: 90 kundan eski hodisalar (Upstash ro'yxati 35 kun). Qo'lda yoki pg_cron bilan:
--   select public.ops_events_prune();
create or replace function public.ops_events_prune()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (delete from public.ops_events where t < now() - interval '90 days' returning 1)
  select count(*)::integer from d;
$$;
revoke all on function public.ops_events_prune() from public, anon, authenticated;
grant execute on function public.ops_events_prune() to service_role;
