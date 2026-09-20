-- Tella 2 uchun trening ma'lumotlari: boshqa modellarning javoblari saqlanadi,
-- keyin ular QLoRA fine-tune uchun JSONL sifatida eksport qilinadi (distillation).
--
-- Maxfiylik qoidalari (kod tomonida ham ta'minlangan):
--   • Foydalanuvchi sozlamalardan o'chirib qo'ysa — yozilmaydi.
--   • Biriktirilgan fayl, bilim bazasi, Cowork papkasi yoki Maxfiy rejim
--     ishlatilgan suhbat umuman yozilmaydi.
--   • user_id saqlanmaydi — kim yozgani bog'lanmaydi.

create table if not exists public.training_samples (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  -- Javobni bergan model (masalan "claude-sonnet-4-5") — sifat tahlili uchun.
  model text not null,
  question text not null,
  answer text not null,
  -- Foydalanuvchi bahosi: 1 = foydali, -1 = foydasiz, null = baholanmagan.
  rating smallint,
  -- Fine-tune paytida takroriy savollarni tashlash uchun.
  question_hash text not null,
  used_at timestamptz
);

create index if not exists training_samples_created on public.training_samples (created_at desc);
create unique index if not exists training_samples_hash on public.training_samples (question_hash);

-- Faqat service_role yozadi va o'qiydi. Hech bir foydalanuvchi ko'ra olmaydi.
alter table public.training_samples enable row level security;

-- Foydalanuvchi ixtiyori: javoblarim Tella'ni o'rgatishda ishlatilsinmi.
alter table public.profiles
  add column if not exists training_opt_in boolean not null default true;
