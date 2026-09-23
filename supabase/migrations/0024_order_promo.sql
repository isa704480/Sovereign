-- SOVEREIGN AI — sayt promokodlari (kripto checkout). Kodlarning o'zi Vercel env
-- PROMO_CODES da; bu ustun faqat ishlatilish sonini sanash uchun.
alter table public.orders add column if not exists promo_code text;
create index if not exists orders_promo on public.orders (promo_code, status) where promo_code is not null;
