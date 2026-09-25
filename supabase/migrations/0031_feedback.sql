-- SOVEREIGN AI — foydalanuvchi fikr-mulohazalari (taklif / xato / shikoyat).
-- Faqat server (service role, /api/feedback) yozadi va o'qiydi; RLS yoqilgan,
-- siyosat yo'q — brauzerdan to'g'ridan-to'g'ri o'qib/yozib bo'lmaydi.
-- Ko'rish: Supabase → Table Editor → feedback.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  email       text,
  kind        text not null check (kind in ('idea', 'bug', 'complaint', 'other')),
  message     text not null check (char_length(message) between 3 and 4000),
  page        text,
  lang        text,
  user_agent  text,
  status      text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on table public.feedback from anon, authenticated;
