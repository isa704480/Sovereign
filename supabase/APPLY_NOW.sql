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

-- ============================================================
-- 0020_admin_onboarding_stats.sql
-- ============================================================
-- Admin: onboarding statistikasi — davlatlar bo'yicha ro'yxatdan o'tganlar soni,
-- yosh guruhlari taqsimoti va o'rtacha yosh (guruh o'rtalari bo'yicha taxmin).
-- Ma'lumot profiles.onboarding JSON ichida: {"country":"UZ","ageGroup":"25-34",...}

create or replace function public.admin_onboarding_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with guard as (
    select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true
  ),
  rows as (
    select
      nullif(upper(p.onboarding->>'country'), '') as country,
      nullif(p.onboarding->>'ageGroup', '')       as age_group,
      p.created_at
    from public.profiles p
    where exists (select 1 from guard)
  ),
  age_mid as (
    select age_group,
      case age_group
        when 'u18'   then 16
        when '18-24' then 21
        when '25-34' then 29.5
        when '35-44' then 39.5
        when '45-54' then 49.5
        when '55+'   then 60
        else null end as mid
    from rows where age_group is not null
  )
  select json_build_object(
    'total_users',      (select count(*) from rows),
    'with_country',     (select count(*) from rows where country is not null),
    'with_age',         (select count(*) from rows where age_group is not null),
    'avg_age',          (select round(avg(mid)::numeric, 1) from age_mid where mid is not null),
    'by_country',       coalesce((select json_agg(t) from (
                          select country, count(*)::int as users
                          from rows where country is not null
                          group by country order by users desc, country
                        ) t), '[]'::json),
    'by_age',           coalesce((select json_agg(t) from (
                          select age_group, count(*)::int as users
                          from rows where age_group is not null
                          group by age_group
                          order by array_position(array['u18','18-24','25-34','35-44','45-54','55+'], age_group)
                        ) t), '[]'::json),
    'signups_30d',      (select count(*) from rows where created_at >= now() - interval '30 days')
  );
$$;

revoke all on function public.admin_onboarding_stats() from public;
grant execute on function public.admin_onboarding_stats() to authenticated;

insert into public._migrations (name) values ('0020_admin_onboarding_stats.sql') on conflict do nothing;

-- ============ 0021_admin_model_stats.sql ============
-- Admin: model statistikasi — qaysi model ko'p ishlatilgan (assistant xabarlari soni)
-- va "yaxshi ishlayapti" proksi: o'rtacha javob uzunligi (output token) hamda
-- foydalanuvchilar qamrovi. Ma'lumot messages jadvalidan (role='assistant').

create or replace function public.admin_model_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with guard as (
    select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true
  ),
  rows as (
    select
      coalesce(nullif(m.model_id, ''), nullif(c.model_id, ''), 'auto') as model_id,
      coalesce(m.input_tokens, 0)  as in_tokens,
      coalesce(m.output_tokens, 0) as out_tokens,
      m.user_id,
      m.created_at
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.role = 'assistant'
      and exists (select 1 from guard)
  ),
  agg as (
    select
      model_id,
      count(*)::int                         as messages,
      count(distinct user_id)::int          as users,
      sum(in_tokens)::bigint                as in_tokens,
      sum(out_tokens)::bigint               as out_tokens,
      (sum(in_tokens) + sum(out_tokens))::bigint as total_tokens,
      round(avg(nullif(out_tokens, 0)))::int as avg_out,
      max(created_at)                        as last_used
    from rows
    group by model_id
  )
  select json_build_object(
    'total_messages', coalesce((select sum(messages) from agg), 0),
    'total_tokens',   coalesce((select sum(total_tokens) from agg), 0),
    'active_models',  coalesce((select count(*) from agg), 0),
    'by_model',       coalesce((select json_agg(t) from (
                        select model_id, messages, users, in_tokens, out_tokens,
                               total_tokens, coalesce(avg_out, 0) as avg_out, last_used
                        from agg
                        order by messages desc, total_tokens desc
                      ) t), '[]'::json)
  );
$$;

revoke all on function public.admin_model_stats() from public;
grant execute on function public.admin_model_stats() to authenticated;

insert into public._migrations (name) values ('0021_admin_model_stats.sql') on conflict do nothing;

-- ============ 0022_connectors.sql ============
-- Ulanishlar (Connectors): foydalanuvchi Gmail/Sheets/Figma/MCP kabi tashqi
-- servislarni ulaydi va yoqib/o'chirib turadi (ChatGPT'dagi connectors kabi).
-- config JSON ichida token/sozlama saqlanadi (maxfiy — klientga qaytarilmaydi).

create table if not exists public.connector_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  connector_id text not null,
  enabled      boolean not null default true,
  config       jsonb  not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, connector_id)
);

alter table public.connector_accounts enable row level security;

drop policy if exists "connectors: own rows" on public.connector_accounts;
create policy "connectors: own rows" on public.connector_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists connector_accounts_user on public.connector_accounts (user_id);

drop trigger if exists connector_accounts_set_updated_at on public.connector_accounts;
create trigger connector_accounts_set_updated_at
  before update on public.connector_accounts
  for each row execute procedure public.set_updated_at();

insert into public._migrations (name) values ('0022_connectors.sql') on conflict do nothing;
