-- SOVEREIGN — xavfsizlik mustahkamlash (audit 2026-09-25).
-- Idempotent: qayta ishga tushirsa ham xato bermaydi.

-- ═══════════════════════════════════════════════════════════════
-- 1 (HIGH): shared_conversations — "using (true)" policy anon kalit bilan
-- BARCHA ulashilgan suhbatlarni ro'yxatlashga imkon berardi. Endi ommaviy
-- o'qish faqat aniq id bo'yicha, user_id'siz, definer funksiya orqali.
-- Egasining insert/select/delete policy'lari (0019) o'zgarmaydi.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "shared: public read by id" on public.shared_conversations;

create or replace function public.get_shared_conversation(p_id text)
returns table (
  id          text,
  title       text,
  model_id    text,
  messages    jsonb,
  created_at  timestamptz,
  views       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.model_id, s.messages, s.created_at, s.views
    from public.shared_conversations s
   where p_id ~ '^[A-Za-z0-9]{16}$'
     and s.id = p_id
   limit 1;
$$;

revoke all on function public.get_shared_conversation(text) from public;
grant execute on function public.get_shared_conversation(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2 (MED): orders — foydalanuvchi o'zi ixtiyoriy amount/currency/provider/
-- promo_code/billing_period bilan order yozolmasin. Buyurtmalarni faqat server
-- (service role) yaratadi. "own select" policy qoladi.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "orders: own insert" on public.orders;

-- ═══════════════════════════════════════════════════════════════
-- 3 (MED): apply_order_payment — parallel webhooklar bir order'ni ikki marta
-- qo'llamasin (muddat ikki barobar uzaymasin): qator FOR UPDATE bilan qulflanadi.
-- billing_period mantiqi (0025): oylik 30 kun, yillik 365 kun.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.apply_order_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status = 'paid' then
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

revoke all on function public.apply_order_payment(text) from public;
revoke execute on function public.apply_order_payment(text) from anon, authenticated;
grant execute on function public.apply_order_payment(text) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 4 (MED): profiles.email — Dodo webhook email bo'yicha foydalanuvchini topadi.
-- Foydalanuvchi o'z profiles.email'ini birovnikiga o'zgartirib to'lovni
-- "o'g'irlay" olmasin: email endi faqat server/service role tomonidan o'zgaradi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.protect_plan_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.plan is distinct from old.plan or
       new.plan_expires_at is distinct from old.plan_expires_at then
      raise exception 'plan can only be changed by the server';
    end if;
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin can only be changed by the server';
    end if;
    if new.tokens_used_month is distinct from old.tokens_used_month or
       new.tokens_month_start is distinct from old.tokens_month_start then
      raise exception 'token usage can only be changed by the server';
    end if;
    if new.email is distinct from old.email then
      raise exception 'email can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5 (MED): promokod poygasi — tekshirish va order yozish bitta tranzaksiyada,
-- kod bo'yicha advisory lock ostida. Faqat service role chaqiradi.
-- Qaytaradi: 'ok' | 'already_used' | 'used_up'.
--   * shu foydalanuvchi kodni to'lov bilan ishlatgan bo'lsa → already_used;
--   * boshqa foydalanuvchilar (to'langan + oxirgi 1 soatdagi ochiq checkout)
--     soni limitga yetgan bo'lsa → used_up (o'zining qayta urinishi joy yemaydi).
-- ═══════════════════════════════════════════════════════════════
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
     and status = 'paid';
  if v_mine > 0 then
    return 'already_used';
  end if;

  select count(distinct user_id) into v_used
    from public.orders
   where promo_code = p_promo_code
     and user_id <> p_user_id
     and (status = 'paid' or (status = 'pending' and created_at >= now() - interval '1 hour'));
  if v_used >= p_max_uses then
    return 'used_up';
  end if;

  insert into public.orders (id, user_id, plan, amount, currency, status, provider, promo_code, billing_period)
  values (p_order_id, p_user_id, p_plan, p_amount, p_currency, 'pending', p_provider, p_promo_code,
          coalesce(p_billing_period, 'month'));
  return 'ok';
end;
$$;

revoke all on function public.create_promo_order(text, uuid, text, text, text, text, text, text, integer) from public;
revoke execute on function public.create_promo_order(text, uuid, text, text, text, text, text, text, integer) from anon, authenticated;
grant execute on function public.create_promo_order(text, uuid, text, text, text, text, text, text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 6 (MED): connector_accounts.config.url (MCP server manzili) — SSRF manbai.
-- Foydalanuvchi REST orqali to'g'ridan-to'g'ri yozolmasin; faqat server action
-- (service role, URL tekshiruvidan keyin) o'rnatadi. Token/refresh yangilash
-- (Google) url'ga tegmaydi, shuning uchun ishlayveradi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.connector_accounts_protect_url()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.config ? 'url' then
        raise exception 'connector url can only be set by the server';
      end if;
    elsif (new.config -> 'url') is distinct from (old.config -> 'url') then
      raise exception 'connector url can only be set by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists connector_accounts_protect_url on public.connector_accounts;
create trigger connector_accounts_protect_url
  before insert or update on public.connector_accounts
  for each row execute procedure public.connector_accounts_protect_url();

-- ═══════════════════════════════════════════════════════════════
-- 11a (LOW): cli_approve — kutilayotgan (approved=false) kodning muddati
-- (expires_at, 10 daqiqa) o'tgan bo'lsa tasdiqlanmaydi. Egasi o'z tasdiqlangan
-- sessiyasini qayta tasdiqlashi (token rotatsiyasi) avvalgidek ishlaydi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         token = encode(gen_random_bytes(32), 'hex'),
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and (
       (approved = false and expires_at > now())
       or (approved = true and user_id = v_uid)
     );
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public;
grant execute on function public.cli_approve(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 11b (LOW): is_admin(uuid) — oddiy foydalanuvchi boshqalarni tekshira olmasin.
-- Faqat o'zini (auth.uid()) yoki service role istalgan id'ni.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin
       from public.profiles p
      where p.id = p_user_id
        and (p_user_id = auth.uid() or auth.role() = 'service_role')),
    false
  );
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- 11c (LOW): messages.input_tokens/output_tokens — foydalanuvchi UPDATE
-- orqali ham o'zgartira olmasin (INSERT trigger 0016 da bor).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.messages_protect_tokens_on_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.input_tokens := old.input_tokens;
    new.output_tokens := old.output_tokens;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect_tokens on public.messages;
create trigger messages_protect_tokens
  before update on public.messages
  for each row execute procedure public.messages_protect_tokens_on_update();
