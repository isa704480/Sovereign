-- 0036: token_usage_daily'ga javobni HAQIQATDA bergan provayder va upstream model.
--
-- Nega: unit economics (admin "Unit economics" kartasi) har javob xarajatini javob bergan
-- modelning ro'yxat narxida hisoblaydi. 0035 da faqat marshrut/katalog model id'si
-- saqlanardi — zaxiraga o'tilganda (masalan Groq'dagi o'rinbosar) haqiqiy model va
-- tekin tarif (Groq free, Cloudflare neuron) ulushi noma'lum edi.
--
-- Kod bu migratsiyasiz ham ishlaydi: web chat avval yangi imzoni chaqiradi, funksiya
-- topilmasa eski 4 argumentli chaqiruvga qaytadi; admin hisobi ustunlar yo'q bo'lsa
-- faqat "model" ustuni bilan hisoblaydi va buni kartada aytadi.

alter table public.token_usage_daily
  add column if not exists provider       text not null default '',
  add column if not exists upstream_model text not null default '';

-- Bir kunda bir foydalanuvchi bir model id'si bilan turli provayderlardan javob olishi
-- mumkin — kalitga ikkala ustun ham kiradi (eski qatorlarda ikkalasi '').
alter table public.token_usage_daily drop constraint if exists token_usage_daily_pkey;
alter table public.token_usage_daily
  add constraint token_usage_daily_pkey primary key (day, user_id, model, provider, upstream_model);

create index if not exists token_usage_daily_day on public.token_usage_daily (day);

-- Ichki yozuvchi: eski 4 argumentli versiya o'rniga 6 argumentli.
drop function if exists public._record_token_usage(uuid, integer, integer, text);
create or replace function public._record_token_usage(
  p_user uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null,
  p_upstream_model text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in integer := least(greatest(0, coalesce(p_input_tokens, 0)), 100000);
  v_out integer := least(greatest(0, coalesce(p_output_tokens, 0)), 100000);
  v_total integer;
begin
  if p_user is null then return; end if;
  v_total := least(v_in + v_out, 100000);
  if v_total = 0 then return; end if;
  update public.profiles
     set tokens_used_month = case
           when tokens_month_start < date_trunc('month', now())
             then v_total
           else greatest(0, tokens_used_month) + v_total
         end,
         tokens_month_start = case
           when tokens_month_start < date_trunc('month', now())
             then date_trunc('month', now())
           else tokens_month_start
         end
   where id = p_user;
  insert into public.token_usage_daily as t
    (day, user_id, model, provider, upstream_model, input_tokens, output_tokens, calls)
  values (
    (now() at time zone 'utc')::date,
    p_user,
    left(coalesce(p_model, ''), 120),
    left(lower(coalesce(p_provider, '')), 40),
    left(coalesce(p_upstream_model, ''), 160),
    v_in, v_out, 1
  )
  on conflict (day, user_id, model, provider, upstream_model) do update
     set input_tokens  = t.input_tokens + excluded.input_tokens,
         output_tokens = t.output_tokens + excluded.output_tokens,
         calls         = t.calls + 1;
end;
$$;
revoke all on function public._record_token_usage(uuid, integer, integer, text, text, text) from public, anon, authenticated;

-- Veb chat (foydalanuvchi JWT): p_provider endi saqlanadi, p_upstream_model qo'shildi.
-- Eski 4 argumentli imzo olib tashlanadi — aks holda nomli argumentlar bilan chaqiruv
-- ikki overload orasida noaniq bo'lardi. 4 ta nomli argument bilan chaqiruv yangi
-- funksiyaga tushadi (p_upstream_model default null).
drop function if exists public.record_token_usage(integer, integer, text, text);
create or replace function public.record_token_usage(
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null,
  p_upstream_model text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._record_token_usage(auth.uid(), p_input_tokens, p_output_tokens, p_model, p_provider, p_upstream_model);
end;
$$;
revoke all on function public.record_token_usage(integer, integer, text, text, text) from public, anon;
grant execute on function public.record_token_usage(integer, integer, text, text, text) to authenticated;

-- CLI (service role): 4 argumentli chaqiruv o'zgarishsiz ishlaydi, provayder ixtiyoriy.
drop function if exists public.record_token_usage_for(uuid, integer, integer, text);
create or replace function public.record_token_usage_for(
  p_user uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null,
  p_upstream_model text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._record_token_usage(p_user, p_input_tokens, p_output_tokens, p_model, p_provider, p_upstream_model);
end;
$$;
revoke all on function public.record_token_usage_for(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_token_usage_for(uuid, integer, integer, text, text, text) to service_role;

-- admin_model_stats (0035) token_usage_daily'ni model bo'yicha guruhlaydi — yangi
-- ustunlar unga ta'sir qilmaydi (sum model bo'yicha).
