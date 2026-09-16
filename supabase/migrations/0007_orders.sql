-- SOVEREIGN AI — orders for plan payments (ZenoBank crypto checkout)
create table if not exists public.orders (
  id          text primary key,                -- our order id (sent to ZenoBank)
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan        text not null check (plan in ('starter', 'pro', 'ultra')),
  amount      text not null,
  currency    text not null default 'USD',
  status      text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  provider    text not null default 'zenobank',
  checkout_id text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists orders_user on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

drop policy if exists "orders: own select" on public.orders;
create policy "orders: own select" on public.orders for select using (auth.uid() = user_id);

drop policy if exists "orders: own insert" on public.orders;
create policy "orders: own insert" on public.orders for insert with check (auth.uid() = user_id);

-- Webhook applies payment via a definer function (no service-role key, bypasses
-- the plan-protect trigger safely, scoped to one order id).
create or replace function public.apply_order_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order_id and status <> 'paid';
  if not found then
    return false;
  end if;
  update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  update public.profiles
    set plan = o.plan, plan_expires_at = now() + interval '30 days'
    where id = o.user_id;
  return true;
end;
$$;

create or replace function public.expire_order(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders set status = 'expired' where id = p_order_id and status = 'pending';
  return found;
end;
$$;

revoke all on function public.apply_order_payment(text) from public;
revoke all on function public.expire_order(text) from public;
grant execute on function public.apply_order_payment(text) to anon, authenticated;
grant execute on function public.expire_order(text) to anon, authenticated;
