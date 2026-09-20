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
