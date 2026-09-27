-- SOVEREIGN AI — media (rasm / video / transkripsiya) kunlik kvotasi BAZADA (audit chat-ai-7).
-- Qayta ishga tushirish xavfsiz (idempotent). Ilova kodi bu migratsiyasiz ham ishlaydi:
-- src/lib/media/quota.ts consume_media topilmasa (PGRST202) avvalgidek faqat Redis limitiga tayanadi.
--
-- Muammo: kunlik limit faqat rate-limit.ts (Upstash) da edi. Upstash sozlanmagan bo'lsa har Vercel
-- instansiyasi o'z hisobini yuritadi, timeout'da esa @upstash/ratelimit success:true qaytarardi —
-- pullik video/Whisper kvotasi chetlab o'tilardi. Bu yerda — consume_message (0027) bilan bir xil,
-- qator qulfi ostida atomik hisob (parallel so'rovlar limitdan oshmaydi).
--
-- p_limit chaqiruvchidan keladi (marshrut tarif limitini beradi). Foydalanuvchi RPC'ni o'zi
-- chaqirsa faqat O'Z hisobini oshiradi (auth.uid()) — boshqaga ta'sir qila olmaydi.

create table if not exists public.media_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('image', 'video', 'transcribe')),
  count   integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.media_usage_daily enable row level security;
-- Siyosat yo'q: Data API orqali o'qib/yozib bo'lmaydi — faqat quyidagi SECURITY DEFINER funksiya.
revoke all on table public.media_usage_daily from anon, authenticated;

create or replace function public.consume_media(p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_uid is null or p_limit is null or p_limit <= 0
     or p_kind is null or p_kind not in ('image', 'video', 'transcribe') then
    return false;
  end if;
  insert into public.media_usage_daily as m (user_id, day, kind, count)
  values (v_uid, v_day, p_kind, 1)
  on conflict (user_id, day, kind) do update
     set count = m.count + 1
   where m.count < p_limit
  returning m.count into v_count;
  if not found then
    return false;
  end if;
  -- Eski kunlarni vaqti-vaqti bilan tozalash (jadval o'smasin).
  if random() < 0.001 then
    delete from public.media_usage_daily where day < v_day - 60;
  end if;
  return true;
end;
$$;
revoke all on function public.consume_media(text, integer) from public, anon;
grant execute on function public.consume_media(text, integer) to authenticated;
