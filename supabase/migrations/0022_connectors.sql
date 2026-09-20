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
