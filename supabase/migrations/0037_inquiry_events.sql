-- 0037: Chuqur so'rash (Deep Inquiry) telemetriyasi — docs/INQUIRY.md §A.10.
--
-- Maqsad: triage chegaralarini (INQUIRY_TUNING.clarityAsk va h.k.) haqiqiy ma'lumot bilan sozlash.
-- MAXFIYLIK: xom matn YO'Q (savol, goal, javoblar, slot nomlari yozilmaydi), user_id YO'Q.
-- Faqat enum/son/model id — server (src/lib/ai/inquiry/telemetry.ts) whitelist bilan yozadi.
--
-- Kirish: RLS yoqilgan, siyosat yo'q, anon/authenticated'dan barcha huquqlar olingan —
-- faqat service role (server) yozadi va o'qiydi. `outcome` ni mijoz server action
-- (logInquiryOutcome) orqali, faqat bir marta yangilaydi.
--
-- Kod bu migratsiyasiz ham ishlaydi: jadval bo'lmasa telemetriya jimgina yozilmaydi.

create table if not exists public.inquiry_events (
  id               uuid primary key,                       -- = InquiryEvent.inquiryId
  created_at       timestamptz not null default now(),
  surface          text not null check (surface in ('web', 'cli', 'cowork')),
  mode             text not null check (mode in ('auto', 'always', 'off')),
  gate             text not null check (gate in ('skip', 'parallel', 'blocking')),
  domain           text check (domain in ('legal', 'medical', 'financial', 'code', 'business',
                                          'personal', 'education', 'creative', 'general')),
  stakes           text check (stakes in ('low', 'medium', 'high')),
  clarity          real check (clarity between 0 and 1),
  decision_llm     text check (decision_llm in ('answer', 'ask', 'answer_then_ask')),
  decision_final   text not null check (decision_final in ('answer', 'ask', 'answer_then_ask')),
  n_questions      smallint not null default 0 check (n_questions between 0 and 20),
  n_critical       smallint not null default 0 check (n_critical between 0 and 20),
  n_dedup_dropped  smallint not null default 0 check (n_dedup_dropped between 0 and 20),
  n_safety_dropped smallint not null default 0 check (n_safety_dropped between 0 and 20),
  round            smallint not null default 1 check (round between 1 and 5),
  lang             text check (lang in ('uz', 'uz-cyrl', 'ru', 'en')),
  triage_model     text check (char_length(triage_model) <= 120),   -- mesh served modeli
  latency_ms       integer check (latency_ms between 0 and 600000),
  outcome          text check (outcome in ('answered', 'skipped', 'ignored', 'followup_clicked')),
  -- R1: "bitta karta = bitta bepul javob navbati" — /api/chat kartani ATOMIK egallaydi
  -- (update … where reply_claimed_at is null returning id). Vaqt belgisi, matn/user_id emas.
  reply_claimed_at timestamptz
);
-- Oldingi 0037 nusxasi qo'llangan bo'lsa ham (idempotent).
alter table public.inquiry_events add column if not exists reply_claimed_at timestamptz;

create index if not exists inquiry_events_created on public.inquiry_events (created_at desc);
create index if not exists inquiry_events_domain_created on public.inquiry_events (domain, created_at desc);

alter table public.inquiry_events enable row level security;
revoke all on table public.inquiry_events from public, anon, authenticated;
grant select, insert, update on table public.inquiry_events to service_role;

-- Himoya chizig'i (service role ham): yangilashda faqat `outcome` va `reply_claimed_at` o'zgaradi,
-- har biri faqat BIR MARTA yoziladi (EC-3: ikki tab parallel; R1: bepul javob navbati takrorlanmasin).
-- Ikkalasi mustaqil: karta "answered" deb belgilangani uning bepul javob navbatini to'smaydi.
-- Allaqachon yozilgan maydonni qayta yozish urinishi — yangilash jimgina o'tkazib yuboriladi
-- (qator qaytmaydi: server action ok=false, /api/chat navbatni oddiy hisoblaydi).
create or replace function public.inquiry_events_outcome_once()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_outcome   text        := new.outcome;
  v_claimed   timestamptz := new.reply_claimed_at;
  v_out_try   boolean     := new.outcome is distinct from old.outcome;
  v_claim_try boolean     := new.reply_claimed_at is distinct from old.reply_claimed_at;
begin
  if not v_out_try and not v_claim_try then
    return null;
  end if;
  if v_out_try and (old.outcome is not null or v_outcome is null) then
    return null;
  end if;
  if v_claim_try and (old.reply_claimed_at is not null or v_claimed is null) then
    return null;
  end if;
  new := old;
  if v_out_try then
    new.outcome := v_outcome;
  end if;
  if v_claim_try then
    new.reply_claimed_at := v_claimed;
  end if;
  return new;
end;
$$;
revoke all on function public.inquiry_events_outcome_once() from public, anon, authenticated;

drop trigger if exists inquiry_events_outcome_once on public.inquiry_events;
create trigger inquiry_events_outcome_once
  before update on public.inquiry_events
  for each row execute function public.inquiry_events_outcome_once();

-- Haftalik ko'rinish (§A.10): domen bo'yicha ask ulushi, skip-rate, answer-rate, karta tashlab
-- ketilishi (ignored), follow-up click-rate, triage latency p50/p95. security_invoker — RLS va
-- huquqlar chaqiruvchiniki (anon/authenticated o'qiy olmaydi).
-- Sozlash qoidasi: 7 kunlik skip_rate > 0.35 → clarityAsk −0.05; high-stakes domenda
-- followup_click_rate > 0.40 va ask_share < 0.10 → clarityAsk +0.05 (faqat INQUIRY_TUNING da, eval'dan o'tib).
create or replace view public.inquiry_weekly_stats
with (security_invoker = true)
as
select
  date_trunc('week', created_at)::date                                        as week,
  coalesce(domain, 'unknown')                                                 as domain,
  count(*)                                                                    as n,
  count(*) filter (where decision_final = 'ask')                              as n_ask,
  count(*) filter (where decision_final = 'answer_then_ask')                  as n_followup,
  round(avg((decision_final = 'ask')::int)::numeric, 3)                       as ask_share,
  round(
    (count(*) filter (where decision_final = 'ask' and outcome = 'skipped'))::numeric
    / nullif(count(*) filter (where decision_final = 'ask'), 0), 3)           as skip_rate,
  round(
    (count(*) filter (where decision_final = 'ask' and outcome = 'answered'))::numeric
    / nullif(count(*) filter (where decision_final = 'ask'), 0), 3)           as answer_rate,
  round(
    (count(*) filter (where decision_final = 'ask' and outcome = 'ignored'))::numeric
    / nullif(count(*) filter (where decision_final = 'ask'), 0), 3)           as ignore_rate,
  round(
    (count(*) filter (where decision_final = 'answer_then_ask' and outcome = 'followup_clicked'))::numeric
    / nullif(count(*) filter (where decision_final = 'answer_then_ask'), 0), 3) as followup_click_rate,
  round(avg(n_safety_dropped)::numeric, 3)                                    as avg_safety_dropped,
  round(avg(n_dedup_dropped)::numeric, 3)                                     as avg_dedup_dropped,
  percentile_cont(0.5)  within group (order by latency_ms)                    as p50_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)                    as p95_latency_ms
from public.inquiry_events
where created_at > now() - interval '12 weeks'
group by 1, 2;

revoke all on table public.inquiry_weekly_stats from public, anon, authenticated;
grant select on table public.inquiry_weekly_stats to service_role;
