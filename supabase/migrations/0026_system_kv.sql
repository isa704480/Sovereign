-- SOVEREIGN AI — tizim holati (kalit/qiymat). Hozircha: OmniRoute watchdog'ning
-- oxirgi restart vaqti — serverless instansiyalar orasida umumiy cooldown uchun.
create table if not exists public.system_kv (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.system_kv enable row level security;
-- Siyosat yo'q: faqat service_role (server) o'qiydi/yozadi.
