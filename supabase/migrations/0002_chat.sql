-- SOVEREIGN AI — Phase 2: conversations & messages
-- Content is stored as plain text for now; AES-256-GCM client-side encryption
-- (ARCHITECTURE.md §8) arrives with Phase 3 together with the personal vault.

create table if not exists public.conversations (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Yangi suhbat',
  model_id    text not null,
  research    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id              uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  model_id        text,
  citations       jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists conversations_user_updated on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_created on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations: own rows" on public.conversations;
create policy "conversations: own rows" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages: own rows" on public.messages;
create policy "messages: own rows" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute procedure public.set_updated_at();
