-- SOVEREIGN AI — media render ishlari (video, musiqa, taqdimot) — 0045
-- Shotstack Webhook orqali asinxron render natijasi saqlanadi.
-- Idempotent: qayta ishga tushirsa ham xato bermaydi.

-- ═══════════════════════════════════════════════════════
-- 1. media_jobs: har bir render topshirig'i
-- ═══════════════════════════════════════════════════════
create table if not exists public.media_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('video', 'music', 'presentation')),
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'done', 'failed')),
  prompt       text not null,
  render_id    text,                    -- Shotstack render ID
  result_url   text,                    -- Tayyor fayl URL
  error_msg    text,                    -- Xato matni (foydalanuvchiga ko'rsatilmaydi)
  plan         text,                    -- Ish yaratilgan paytdagi tarif
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indekslar
create index if not exists media_jobs_user_id   on public.media_jobs (user_id, created_at desc);
create index if not exists media_jobs_render_id  on public.media_jobs (render_id) where render_id is not null;
create index if not exists media_jobs_status     on public.media_jobs (status, created_at desc);

-- updated_at avtomatik yangilanadi
create or replace function public._media_jobs_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists media_jobs_updated on public.media_jobs;
create trigger media_jobs_updated
  before update on public.media_jobs
  for each row execute procedure public._media_jobs_updated();

-- ═══════════════════════════════════════════════════════
-- 2. RLS: foydalanuvchi faqat o'z ishlarini ko'radi
-- ═══════════════════════════════════════════════════════
alter table public.media_jobs enable row level security;

drop policy if exists "media_jobs: own select" on public.media_jobs;
create policy "media_jobs: own select"
  on public.media_jobs for select
  using (auth.uid() = user_id);

-- Insert/update faqat server (service_role) — mijoz to'g'ridan-to'g'ri yaza olmaydi
-- (RPC orqali)

-- ═══════════════════════════════════════════════════════
-- 3. RPC: ish yaratish (authed, service_role tekshiruvi yo'q)
-- ═══════════════════════════════════════════════════════
create or replace function public.create_media_job(
  p_kind   text,
  p_prompt text,
  p_plan   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_kind not in ('video', 'music', 'presentation') then
    raise exception 'invalid kind';
  end if;
  if length(trim(p_prompt)) < 2 or length(p_prompt) > 2000 then
    raise exception 'invalid prompt';
  end if;
  insert into public.media_jobs (user_id, kind, prompt, plan, status)
  values (v_uid, p_kind, left(trim(p_prompt), 2000), p_plan, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_media_job(text, text, text) from public, anon;
grant execute on function public.create_media_job(text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 4. media_usage_daily — 'music' turini qo'shish (0041 da yo'q edi)
-- ═══════════════════════════════════════════════════════
alter table public.media_usage_daily
  drop constraint if exists media_usage_daily_kind_check;
alter table public.media_usage_daily
  add constraint media_usage_daily_kind_check
  check (kind in ('image', 'video', 'transcribe', 'music', 'presentation'));

-- ═══════════════════════════════════════════════════════
-- 5. consume_media — 'music' va 'presentation' uchun ham ishlaydi
-- (0041 funksiya body'sini qayta yozamiz — check constraint yuqorida yangilandi)
-- ═══════════════════════════════════════════════════════
-- (funksiya o'zi 0041 da yozilgan, constraint yangilangani yetarli)

comment on table public.media_jobs is
  'Asinxron media render ishlari (Shotstack). Webhook /api/webhooks/shotstack orqali yangilanadi.';
