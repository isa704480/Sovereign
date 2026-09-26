-- SOVEREIGN AI — tarif darajasini hisobga oladigan to'lov qo'llash (audit 2-bosqich).
--
-- Muammolar:
--  1) Arzon yillik + qimmat oylik = butun yil qimmat tarif (plan = o.plan, qolgan
--     muddat ham yangi tarifga o'tardi).
--  2) Pastroq tarif sotib olinsa / eski Dodo obunasi yangilansa, yuqori tarif tushardi.
--  3) Refund/chargeback faqat kunlarni ayirardi, yuqori tarif saqlanib qolardi.
--  4) Bir martalik promokod parallel "pending" buyurtmalar bilan ko'p marta ishlatilardi.
--
-- Qoida: har to'lov — QIYMAT. Foydalanuvchi har doim eng yuqori faol tarifda qoladi;
-- qolgan muddat va yangi davr shu tarifga OYLIK NARX NISBATI bo'yicha aylantiriladi.
-- (Narxlar src/config/plans.ts bilan bir xil bo'lishi kerak.)

-- ── Yordamchi funksiyalar ─────────────────────────────────────────
create or replace function public.plan_rank(p text)
returns integer language sql immutable as $$
  select case p when 'starter' then 1 when 'pro' then 2 when 'ultra' then 3 else 0 end
$$;

create or replace function public.plan_month_price(p text)
returns double precision language sql immutable as $$
  select case p when 'starter' then 5.99 when 'pro' then 21.99 when 'ultra' then 109.99 else 0 end
$$;

-- ── Buyurtmada "oldin/keyin" holati (refund'da tiklash uchun) ─────
alter table public.orders add column if not exists prev_plan text;
alter table public.orders add column if not exists prev_expires_at timestamptz;
alter table public.orders add column if not exists granted_plan text;
alter table public.orders add column if not exists granted_until timestamptz;
alter table public.orders add column if not exists provider_payment_id text;
create index if not exists orders_provider_payment on public.orders (provider_payment_id) where provider_payment_id is not null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded', 'review'));

-- ── Yagona hisob-kitob: qiymatni eng yuqori faol tarifga aylantirish ──
-- p_add — sotib olingan davr (30/365 kun). Profil qatori qulflanadi.
create or replace function public._entitle(p_user_id uuid, p_plan text, p_add interval, p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  active boolean;
  target text;
  rem interval := interval '0';
  new_exp timestamptz;
begin
  select plan, plan_expires_at into cur from public.profiles where id = p_user_id for update;
  if not found then
    return false;
  end if;
  -- Muddatsiz pullik tarif (admin bergan) — tegmaymiz.
  if public.plan_rank(cur.plan) > 0 and cur.plan_expires_at is null then
    return true;
  end if;

  active := public.plan_rank(cur.plan) > 0 and cur.plan_expires_at > now();
  target := case when active and public.plan_rank(cur.plan) > public.plan_rank(p_plan) then cur.plan else p_plan end;
  if active then
    rem := (cur.plan_expires_at - now()) * (public.plan_month_price(cur.plan) / public.plan_month_price(target));
  end if;
  new_exp := now() + rem + p_add * (public.plan_month_price(p_plan) / public.plan_month_price(target));

  if p_order_id is not null then
    update public.orders
       set prev_plan = cur.plan, prev_expires_at = cur.plan_expires_at,
           granted_plan = target, granted_until = new_exp
     where id = p_order_id;
  end if;
  update public.profiles set plan = target, plan_expires_at = new_exp where id = p_user_id;
  return true;
end;
$$;

revoke all on function public._entitle(uuid, text, interval, text) from public, anon, authenticated;

-- ── RollyPay / ZenoBank: bir martalik buyurtma ────────────────────
create or replace function public.apply_order_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status in ('paid', 'refunded', 'review') then
    return false;
  end if;
  -- Bir martalik promokod: shu foydalanuvchi uni allaqachon to'lov bilan ishlatgan
  -- bo'lsa (parallel pending buyurtmalar) — tarif ochilmaydi, qo'lda ko'rib chiqiladi.
  if o.promo_code is not null and exists (
       select 1 from public.orders x
        where x.user_id = o.user_id and x.promo_code = o.promo_code
          and x.status = 'paid' and x.id <> o.id) then
    update public.orders set status = 'review', paid_at = now() where id = p_order_id;
    return false;
  end if;
  update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  perform public._entitle(
    o.user_id, o.plan,
    case when o.billing_period = 'year' then interval '365 days' else interval '30 days' end,
    o.id);
  return true;
end;
$$;

revoke all on function public.apply_order_payment(text) from public, anon, authenticated;
grant execute on function public.apply_order_payment(text) to service_role;

-- ── Dodo obunasi: mutlaq sana (keyingi to'lov kuni) ────────────────
-- subscription.active va payment.succeeded bir xarid uchun ikkalasi keladi —
-- shuning uchun bu funksiya IDEMPOTENT (qayta chaqiruv natijani o'zgartirmaydi).
drop function if exists public.apply_plan_until(uuid, text, timestamptz);
create or replace function public.apply_plan_until(
  p_user_id uuid, p_plan text, p_until timestamptz, p_order_id text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  active boolean;
  new_exp timestamptz;
begin
  if p_plan not in ('starter', 'pro', 'ultra') then
    raise exception 'invalid plan';
  end if;
  if p_until is null or p_until < now() then
    return false;
  end if;
  select plan, plan_expires_at into cur from public.profiles where id = p_user_id for update;
  if not found then
    return false;
  end if;
  if public.plan_rank(cur.plan) > 0 and cur.plan_expires_at is null then
    return true;
  end if;
  active := public.plan_rank(cur.plan) > 0 and cur.plan_expires_at > now();

  if active and public.plan_rank(cur.plan) > public.plan_rank(p_plan) then
    -- Pastroq tarif obunasi yuqori faol tarifni tushirmaydi.
    return true;
  elsif active and cur.plan = p_plan then
    new_exp := greatest(cur.plan_expires_at, p_until);
  elsif active then
    -- Yuqoriga o'tish: pastroq tarifning qolgan qiymati yangi tarifga aylantiriladi.
    new_exp := greatest(p_until, now() + (cur.plan_expires_at - now())
                 * (public.plan_month_price(cur.plan) / public.plan_month_price(p_plan)));
  else
    new_exp := p_until;
  end if;

  if p_order_id is not null then
    update public.orders
       set prev_plan = coalesce(prev_plan, cur.plan),
           prev_expires_at = coalesce(prev_expires_at, cur.plan_expires_at),
           granted_plan = p_plan, granted_until = new_exp
     where id = p_order_id;
  end if;
  update public.profiles set plan = p_plan, plan_expires_at = new_exp where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.apply_plan_until(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_plan_until(uuid, text, timestamptz, text) to service_role;

-- ── Refund / chargeback: berilganini qaytarib olish ───────────────
create or replace function public.revoke_order_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  cur record;
  new_exp timestamptz;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status not in ('paid', 'review') then
    return false;
  end if;
  update public.orders set status = 'refunded' where id = p_order_id;
  if o.status = 'review' then
    return true; -- tarif ochilmagan edi
  end if;

  select plan, plan_expires_at into cur from public.profiles where id = o.user_id for update;
  if not found or (public.plan_rank(cur.plan) > 0 and cur.plan_expires_at is null) then
    return true;
  end if;

  if o.granted_until is not null and cur.plan = o.granted_plan and cur.plan_expires_at = o.granted_until then
    -- Shu to'lovdan keyin hech narsa o'zgarmagan — oldingi holat to'liq tiklanadi.
    if public.plan_rank(o.prev_plan) > 0 and o.prev_expires_at > now() then
      update public.profiles set plan = o.prev_plan, plan_expires_at = o.prev_expires_at where id = o.user_id;
    else
      update public.profiles set plan = 'free', plan_expires_at = null where id = o.user_id;
    end if;
    return true;
  end if;

  -- Keyin boshqa to'lovlar ham bo'lgan: shu buyurtma qiymatini joriy tarifda ayiramiz.
  if public.plan_rank(cur.plan) > 0 and cur.plan_expires_at is not null then
    new_exp := cur.plan_expires_at
      - (case when o.billing_period = 'year' then interval '365 days' else interval '30 days' end)
        * (public.plan_month_price(o.plan) / public.plan_month_price(cur.plan));
    if new_exp <= now() then
      update public.profiles set plan = 'free', plan_expires_at = null where id = o.user_id;
    else
      update public.profiles set plan_expires_at = new_exp where id = o.user_id;
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.revoke_order_payment(text) from public, anon, authenticated;
grant execute on function public.revoke_order_payment(text) to service_role;

-- ── Promokod: parallel "pending" buyurtmalar ham hisoblanadi ──────
create or replace function public.create_promo_order(
  p_order_id       text,
  p_user_id        uuid,
  p_plan           text,
  p_amount         text,
  p_currency       text,
  p_provider       text,
  p_billing_period text,
  p_promo_code     text,
  p_max_uses       integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine integer;
  v_used integer;
begin
  if p_order_id is null or p_order_id not like 'sov\_%' then
    raise exception 'invalid order id';
  end if;
  if p_promo_code is null or length(p_promo_code) = 0 or length(p_promo_code) > 64 then
    raise exception 'invalid promo code';
  end if;
  if coalesce(p_max_uses, 0) < 1 then
    raise exception 'invalid max uses';
  end if;

  perform pg_advisory_xact_lock(hashtext('promo:' || p_promo_code));

  select count(*) into v_mine
    from public.orders
   where promo_code = p_promo_code
     and user_id = p_user_id
     and status in ('paid', 'review');
  if v_mine > 0 then
    return 'already_used';
  end if;
  -- Shu foydalanuvchining shu koddagi eski ochiq buyurtmalari bekor qilinadi — qayta
  -- urinish ishlaydi, lekin kod bir nechta havolaga tarqalmaydi. Eski havola baribir
  -- to'lansa, apply_order_payment uni 'review'ga o'tkazadi (tarif ikki marta ochilmaydi).
  update public.orders set status = 'cancelled'
   where promo_code = p_promo_code and user_id = p_user_id and status = 'pending';

  select count(distinct user_id) into v_used
    from public.orders
   where promo_code = p_promo_code
     and user_id <> p_user_id
     and (status in ('paid', 'review') or (status = 'pending' and created_at >= now() - interval '1 hour'));
  if v_used >= p_max_uses then
    return 'used_up';
  end if;

  insert into public.orders (id, user_id, plan, amount, currency, status, provider, promo_code, billing_period)
  values (p_order_id, p_user_id, p_plan, p_amount, p_currency, 'pending', p_provider, p_promo_code,
          coalesce(p_billing_period, 'month'));
  return 'ok';
end;
$$;

revoke all on function public.create_promo_order(text, uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_promo_order(text, uuid, text, text, text, text, text, text, integer) to service_role;
