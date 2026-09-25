-- SOVEREIGN AI — to'lov qaytarilsa (refund / chargeback) tarifni ham qaytarib olish.
-- RollyPay to'lovdan keyin ham payment.refunded / payment.chargeback yuborishi mumkin.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded'));

-- Faqat 'paid' buyurtma uchun: shu buyurtma qo'shgan muddatni ayiradi; muddat
-- tugagan bo'lsa foydalanuvchi free'ga tushadi. Takroriy chaqiruv — false.
create or replace function public.revoke_order_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'paid' then
    return false;
  end if;
  update public.orders set status = 'refunded' where id = p_order_id;
  update public.profiles
    set plan_expires_at = plan_expires_at
          - case when o.billing_period = 'year' then interval '365 days' else interval '30 days' end
    where id = o.user_id and plan_expires_at is not null;
  update public.profiles
    set plan = 'free', plan_expires_at = null
    where id = o.user_id and plan_expires_at <= now();
  return true;
end;
$$;

revoke all on function public.revoke_order_payment(text) from public;
revoke execute on function public.revoke_order_payment(text) from anon, authenticated;
grant execute on function public.revoke_order_payment(text) to service_role;
