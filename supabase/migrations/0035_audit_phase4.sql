-- SOVEREIGN AI — 4-bosqich audit tuzatishlari (backend).
-- Qayta ishga tushirish xavfsiz (idempotent). ESLATMA: avval kod deploy qilinsin —
-- /api/cli/start va /api/cli/poll endi service client bilan chaqiradi (2-bo'lim),
-- share yozuvi server orqali (1-bo'lim), CLI token hisobi record_token_usage_for (5-bo'lim).

-- ═══════════════════════════════════════════════════════════════
-- 1 (MEDIUM): shared_conversations — to'g'ridan-to'g'ri REST INSERT yopiladi.
-- Ilgari anon kalit + o'z JWT bilan ixtiyoriy id ("SovereignSupport") va ixtiyoriy
-- jsonb yozib, rasmiy domenda soxta "AI javobi" sahifasini ochish mumkin edi.
-- Endi faqat server action (service role) yozadi, id'ni server yaratadi.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "shared: owner insert" on public.shared_conversations;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shared_conversations_id_format') then
    alter table public.shared_conversations
      add constraint shared_conversations_id_format check (id ~ '^[A-Za-z0-9]{16}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shared_conversations_messages_array') then
    alter table public.shared_conversations
      add constraint shared_conversations_messages_array check (jsonb_typeof(messages) = 'array') not valid;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 2 (MEDIUM): cli_start / cli_poll anon'ga ochiq edi — /api/cli/start dagi IP
-- limitini Supabase RPC'ni to'g'ridan-to'g'ri chaqirib chetlab, cli_sessions'ni
-- to'ldirish mumkin edi. Endi faqat service_role (API route'lar orqali).
-- ═══════════════════════════════════════════════════════════════
revoke all on function public.cli_start(text) from public, anon, authenticated;
grant execute on function public.cli_start(text) to service_role;
revoke all on function public.cli_poll(text) from public, anon, authenticated;
grant execute on function public.cli_poll(text) to service_role;

-- cli_start har chaqiruvda eskirganlarni o'chiradi — indekssiz to'liq skan edi.
create index if not exists cli_sessions_expires_at on public.cli_sessions (expires_at);

-- ═══════════════════════════════════════════════════════════════
-- 3 (LOW): cli_approve — egasi allaqachon tasdiqlangan kodni qayta tasdiqlasa token
-- rotatsiya qilinardi, lekin delivered_at tiklanmasdi: ishlayotgan CLI jimgina
-- chiqib ketardi, yangi tokenni esa hech kim ololmasdi. Endi qayta tasdiqlash no-op.
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
  -- Egasining o'z tasdiqlangan sessiyasi — o'zgarishsiz muvaffaqiyat.
  if exists (
    select 1 from public.cli_sessions
     where code = p_code and approved = true and user_id = v_uid and revoked_at is null
  ) then
    return true;
  end if;
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         token = encode(gen_random_bytes(32), 'hex'),
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and approved = false
     and expires_at > now();
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public, anon;
grant execute on function public.cli_approve(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4 (LOW): kb_search hujjat egasini tekshirardi, chunk egasini emas — begona
-- chunk (qurbon hujjatining document_id si bilan) qurbonning RAG natijasiga tushardi.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.kb_search(
  p_query extensions.vector(1536),
  p_limit int default 6
)
returns table (
  document_id uuid,
  document_name text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.document_id,
    d.name as document_name,
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> p_query))::float as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where d.user_id = auth.uid()
    and c.user_id = auth.uid()
  order by c.embedding <=> p_query
  limit p_limit;
$$;
revoke all on function public.kb_search(extensions.vector, int) from public, anon;
grant execute on function public.kb_search(extensions.vector, int) to authenticated;

-- Chunk faqat o'z hujjatiga yoziladi.
drop policy if exists "kb_chunks: own rows" on public.kb_chunks;
create policy "kb_chunks: own rows" on public.kb_chunks
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.kb_documents d where d.id = document_id and d.user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════
-- 5 (MEDIUM/LOW): token sarfi kunlik jadvalda. messages.input/output_tokens
-- hech qachon to'ldirilmaydi (0016 trigger), shuning uchun admin token
-- statistikasi doim 0 edi. CLI ham endi oylik hisobga yoziladi (service_role).
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.token_usage_daily (
  day           date   not null default (now() at time zone 'utc')::date,
  user_id       uuid   not null references auth.users (id) on delete cascade,
  model         text   not null default '',
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  calls         integer not null default 0,
  primary key (day, user_id, model)
);
alter table public.token_usage_daily enable row level security;
-- (siyosat yo'q — faqat security definer funksiyalar yozadi/o'qiydi)
create index if not exists token_usage_daily_model on public.token_usage_daily (model, day);

create or replace function public._record_token_usage(
  p_user uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text
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
  v_total := least(v_in + v_out, 100000); -- bir chaqiruvda maksimum 100k (0016 bilan bir xil)
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
  insert into public.token_usage_daily as t (day, user_id, model, input_tokens, output_tokens, calls)
  values ((now() at time zone 'utc')::date, p_user, left(coalesce(p_model, ''), 120), v_in, v_out, 1)
  on conflict (day, user_id, model) do update
     set input_tokens  = t.input_tokens + excluded.input_tokens,
         output_tokens = t.output_tokens + excluded.output_tokens,
         calls         = t.calls + 1;
end;
$$;
revoke all on function public._record_token_usage(uuid, integer, integer, text) from public, anon, authenticated;

-- Veb chat (foydalanuvchi JWT) — imzo o'zgarmaydi.
create or replace function public.record_token_usage(
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text,
  p_provider text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._record_token_usage(auth.uid(), p_input_tokens, p_output_tokens, p_model);
end;
$$;
revoke all on function public.record_token_usage(integer, integer, text, text) from public, anon;
grant execute on function public.record_token_usage(integer, integer, text, text) to authenticated;

-- CLI (/api/cli/chat, service role) — foydalanuvchi id token orqali aniqlangan.
create or replace function public.record_token_usage_for(
  p_user uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._record_token_usage(p_user, p_input_tokens, p_output_tokens, p_model);
end;
$$;
revoke all on function public.record_token_usage_for(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.record_token_usage_for(uuid, integer, integer, text) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 6 (MEDIUM): admin_daily_stats RUB va USD summalarini qo'shib "revenue_usd" derdi.
-- Endi revenue_usd — faqat USD buyurtmalar, revenue_rub — alohida. tokens_used —
-- token_usage_daily'dan. Qaytish turi o'zgargani uchun drop + create.
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.admin_daily_stats(integer);
create function public.admin_daily_stats(p_days integer default 30)
returns table (
  day date,
  new_users bigint,
  active_users bigint,
  messages_count bigint,
  tokens_used bigint,
  revenue_usd numeric,
  revenue_rub numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with clamped as (select least(greatest(coalesce(p_days, 30), 1), 365) as d),
  days as (
    select generate_series(
      (now() - (c.d || ' days')::interval)::date,
      now()::date,
      interval '1 day'
    )::date as day
    from clamped c
  )
  select
    d.day,
    (select count(*) from public.profiles pr where pr.created_at::date = d.day) as new_users,
    (select count(distinct user_id) from public.messages m
       where m.created_at::date = d.day) as active_users,
    (select count(*) from public.messages m
       where m.created_at::date = d.day and m.role = 'user') as messages_count,
    (select coalesce(sum(u.input_tokens + u.output_tokens), 0)::bigint
       from public.token_usage_daily u
      where u.day = d.day) as tokens_used,
    (select coalesce(sum(o.amount::numeric), 0)
       from public.orders o
      where o.paid_at::date = d.day and o.status = 'paid'
        and upper(coalesce(o.currency, 'USD')) = 'USD') as revenue_usd,
    (select coalesce(sum(o.amount::numeric), 0)
       from public.orders o
      where o.paid_at::date = d.day and o.status = 'paid'
        and upper(o.currency) = 'RUB') as revenue_rub
  from days d
  where exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  order by d.day desc;
$$;
revoke all on function public.admin_daily_stats(integer) from public, anon;
grant execute on function public.admin_daily_stats(integer) to authenticated;

-- Model statistikasi: xabarlar soni messages'dan, tokenlar token_usage_daily'dan.
create or replace function public.admin_model_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with guard as (
    select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true
  ),
  rows as (
    select
      coalesce(nullif(m.model_id, ''), nullif(c.model_id, ''), 'auto') as model_id,
      m.user_id,
      m.created_at
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.role = 'assistant'
      and exists (select 1 from guard)
  ),
  msgs as (
    select model_id, count(*)::int as messages, count(distinct user_id)::int as users, max(created_at) as last_used
    from rows
    group by model_id
  ),
  tok as (
    select nullif(u.model, '') as model_id,
           sum(u.input_tokens)::bigint as in_tokens,
           sum(u.output_tokens)::bigint as out_tokens,
           sum(u.calls)::bigint as calls
    from public.token_usage_daily u
    where exists (select 1 from guard)
    group by nullif(u.model, '')
  ),
  agg as (
    select
      coalesce(m.model_id, t.model_id, 'auto')            as model_id,
      coalesce(m.messages, 0)                             as messages,
      coalesce(m.users, 0)                                as users,
      coalesce(t.in_tokens, 0)                            as in_tokens,
      coalesce(t.out_tokens, 0)                           as out_tokens,
      (coalesce(t.in_tokens, 0) + coalesce(t.out_tokens, 0))::bigint as total_tokens,
      case when coalesce(t.calls, 0) > 0 then round(t.out_tokens::numeric / t.calls)::int end as avg_out,
      m.last_used
    from msgs m
    full join tok t on t.model_id = m.model_id
  )
  select json_build_object(
    'total_messages', coalesce((select sum(messages) from agg), 0),
    'total_tokens',   coalesce((select sum(total_tokens) from agg), 0),
    'active_models',  coalesce((select count(*) from agg), 0),
    'by_model',       coalesce((select json_agg(t) from (
                        select model_id, messages, users, in_tokens, out_tokens,
                               total_tokens, coalesce(avg_out, 0) as avg_out, last_used
                        from agg
                        order by messages desc, total_tokens desc
                      ) t), '[]'::json)
  );
$$;
revoke all on function public.admin_model_stats() from public, anon;
grant execute on function public.admin_model_stats() to authenticated;
