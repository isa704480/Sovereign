-- SOVEREIGN: kutilayotgan migratsiyalar (0017 + 0018 + 0019).
-- Supabase -> SQL Editor -> New query -> shu faylni to'liq qo'ying -> Run.
-- Bir necha marta ishga tushirsangiz ham xavfsiz (if not exists / or replace).

-- ============================================================
-- 0017_dodo_payments.sql
-- ============================================================
-- Dodo Payments: webhook idempotency + plan activation until a given date.

create table if not exists public.webhook_events (
  id          text primary key,
  provider    text not null,
  type        text,
  received_at timestamptz not null default now()
);
alter table public.webhook_events enable row level security;
-- No policies: only the service role (webhook handler) touches this table.

-- Sets the plan and extends expiry to at least p_until. Never shortens an
-- existing paid period. Service role only.
create or replace function public.apply_plan_until(
  p_user_id uuid,
  p_plan text,
  p_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan not in ('starter', 'pro', 'ultra') then
    raise exception 'invalid plan';
  end if;
  if p_until is null or p_until < now() then
    return false;
  end if;
  update public.profiles
     set plan = p_plan,
         plan_expires_at = greatest(coalesce(plan_expires_at, now()), p_until)
   where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.apply_plan_until(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_plan_until(uuid, text, timestamptz) to service_role;

-- ============================================================
-- 0018_training_samples.sql
-- ============================================================
-- Tella 2 uchun trening ma'lumotlari: boshqa modellarning javoblari saqlanadi,
-- keyin ular QLoRA fine-tune uchun JSONL sifatida eksport qilinadi (distillation).
--
-- Maxfiylik qoidalari (kod tomonida ham ta'minlangan):
--   • Foydalanuvchi sozlamalardan o'chirib qo'ysa — yozilmaydi.
--   • Biriktirilgan fayl, bilim bazasi, Cowork papkasi yoki Maxfiy rejim
--     ishlatilgan suhbat umuman yozilmaydi.
--   • user_id saqlanmaydi — kim yozgani bog'lanmaydi.

create table if not exists public.training_samples (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  -- Javobni bergan model (masalan "claude-sonnet-4-5") — sifat tahlili uchun.
  model text not null,
  question text not null,
  answer text not null,
  -- Foydalanuvchi bahosi: 1 = foydali, -1 = foydasiz, null = baholanmagan.
  rating smallint,
  -- Fine-tune paytida takroriy savollarni tashlash uchun.
  question_hash text not null,
  used_at timestamptz
);

create index if not exists training_samples_created on public.training_samples (created_at desc);
create unique index if not exists training_samples_hash on public.training_samples (question_hash);

-- Faqat service_role yozadi va o'qiydi. Hech bir foydalanuvchi ko'ra olmaydi.
alter table public.training_samples enable row level security;

-- Foydalanuvchi ixtiyori: javoblarim Tella'ni o'rgatishda ishlatilsinmi.
alter table public.profiles
  add column if not exists training_opt_in boolean not null default true;

-- ============================================================
-- 0019_shared_conversations.sql
-- ============================================================
-- Suhbatni havola bilan ulashish. Havola tasodifiy 16 belgili id — topib bo'lmaydi.
-- Ulashilgan nusxa "muzlatilgan": keyingi xabarlar unga tushmaydi.

create table if not exists public.shared_conversations (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Suhbat',
  model_id    text,
  -- [{role, content, modelId, createdAt}] — biriktirmalar va maxfiy maydonlar olib tashlangan.
  messages    jsonb not null,
  created_at  timestamptz not null default now(),
  views       integer not null default 0
);

create index if not exists shared_conversations_user on public.shared_conversations (user_id, created_at desc);

alter table public.shared_conversations enable row level security;

-- Egasi yaratadi va o'chiradi.
drop policy if exists "shared: owner insert" on public.shared_conversations;
create policy "shared: owner insert" on public.shared_conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "shared: owner delete" on public.shared_conversations;
create policy "shared: owner delete" on public.shared_conversations
  for delete using (auth.uid() = user_id);

drop policy if exists "shared: owner select" on public.shared_conversations;
create policy "shared: owner select" on public.shared_conversations
  for select using (auth.uid() = user_id);

-- Havolani bilgan har kim (anon ham) o'qiy oladi — id ni taxmin qilib bo'lmaydi.
drop policy if exists "shared: public read by id" on public.shared_conversations;
create policy "shared: public read by id" on public.shared_conversations
  for select to anon, authenticated using (true);

-- Ko'rishlar soni — anon uchun update ochib bo'lmaydi, shuning uchun RPC.
create or replace function public.shared_conversation_view(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shared_conversations set views = views + 1 where id = p_id;
$$;
revoke all on function public.shared_conversation_view(text) from public;
grant execute on function public.shared_conversation_view(text) to anon, authenticated;

-- ============================================================
-- Migratsiya jurnali
-- ============================================================
insert into public._migrations (name) values
  ('0017_dodo_payments.sql'),
  ('0018_training_samples.sql'),
  ('0019_shared_conversations.sql')
on conflict do nothing;
