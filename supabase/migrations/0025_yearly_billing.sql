-- SOVEREIGN AI — yillik obuna. Kripto (ZenoBank) to'lovi bir martalik:
-- oylik buyurtma 30 kun, yillik buyurtma 365 kun beradi. Dodo (karta) muddatni
-- webhook'dagi next_billing_date dan oladi (apply_plan_until), bu yerga tegmaydi.
alter table public.orders
  add column if not exists billing_period text not null default 'month';

do $$ begin
  alter table public.orders
    add constraint orders_billing_period_check check (billing_period in ('month', 'year'));
exception when duplicate_object then null;
end $$;

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
    set plan = o.plan,
        plan_expires_at = greatest(coalesce(plan_expires_at, now()), now())
          + case when o.billing_period = 'year' then interval '365 days' else interval '30 days' end
    where id = o.user_id;
  return true;
end;
$$;

revoke execute on function public.apply_order_payment(text) from anon, authenticated, public;
grant execute on function public.apply_order_payment(text) to service_role;
