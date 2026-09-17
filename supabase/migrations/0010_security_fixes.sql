-- SOVEREIGN AI — Xavfsizlik tuzatishlari (audit: 0010)
-- Ushbu migration to'g'ridan-to'g'ri anon-callable bo'lgan xavfli funksiyalarni
-- yopadi, RLS-yashirin ta'sirdagi IDOR yo'llarini bekor qiladi, va answer_cache
-- ni per-user qiladi.

-- ═══════════════════════════════════════════════════════════════
-- FIX 1+2: Payment RPClari faqat service-role uchun
-- ═══════════════════════════════════════════════════════════════
revoke execute on function public.apply_order_payment(text) from anon, authenticated, public;
revoke execute on function public.expire_order(text) from anon, authenticated, public;
grant execute on function public.apply_order_payment(text) to service_role;
grant execute on function public.expire_order(text) to service_role;

-- FIX 18: plan_expires_at renewal — mavjud muddat ustiga qo'shadi
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
        plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days'
    where id = o.user_id;
  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FIX 4: IDOR yo'llarini yopish — auth.uid() ga o'tish
-- ═══════════════════════════════════════════════════════════════

-- messages_today: p_user_id argumentini olib, auth.uid() ishlatamiz
drop function if exists public.messages_today(uuid);
drop function if exists public.messages_today();
create or replace function public.messages_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.messages m
   where m.user_id = auth.uid()
     and m.role = 'user'
     and m.created_at >= date_trunc('day', now());
$$;

revoke all on function public.messages_today() from public;
grant execute on function public.messages_today() to authenticated;

-- Eski `messages_today(uuid)` chaqiruvchilari uchun compat wrapper —
-- p_user_id qabul qiladi, lekin auth.uid() ga majburlaydi.
create or replace function public.messages_today(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> uid then
    return 0;
  end if;
  return public.messages_today();
end;
$$;
revoke all on function public.messages_today(uuid) from public;
grant execute on function public.messages_today(uuid) to authenticated;

-- kb_search: p_user_id ni olib tashlab auth.uid() ga o'tkazamiz
drop function if exists public.kb_search(uuid, extensions.vector, int);
drop function if exists public.kb_search(extensions.vector, int);
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
  order by c.embedding <=> p_query
  limit p_limit;
$$;

revoke all on function public.kb_search(extensions.vector, int) from public;
grant execute on function public.kb_search(extensions.vector, int) to authenticated;

-- Eski 3-argumentli chaqiruvchi bo'lsa unga ham compat wrapper
create or replace function public.kb_search(
  p_user_id uuid,
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
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return;
  end if;
  return query select * from public.kb_search(p_query, p_limit);
end;
$$;
revoke all on function public.kb_search(uuid, extensions.vector, int) from public;
grant execute on function public.kb_search(uuid, extensions.vector, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FIX 3: answer_cache ni per-user qilish + anon-write bekor
-- ═══════════════════════════════════════════════════════════════
alter table public.answer_cache
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists answer_cache_user_idx on public.answer_cache (user_id, created_at desc);

-- Eski (user_id NULL) yozuvlarni tozalaymiz — global kesh xavfli edi
delete from public.answer_cache where user_id is null;

-- Search: faqat o'z user'ining kesh yozuvlaridan qidiradi
create or replace function public.answer_cache_search(
  p_embedding extensions.vector(1536),
  p_max_age_hours integer default 24,
  p_min_similarity real default 0.92
)
returns table (
  id uuid,
  query text,
  answer text,
  model text,
  similarity real,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    ac.id,
    ac.query,
    ac.answer,
    ac.model,
    (1 - (ac.embedding <=> p_embedding))::real as similarity,
    ac.created_at
  from public.answer_cache ac
  where ac.user_id = auth.uid()
    and ac.created_at > now() - (p_max_age_hours || ' hours')::interval
    and (1 - (ac.embedding <=> p_embedding)) >= p_min_similarity
  order by ac.embedding <=> p_embedding
  limit 1
$$;

revoke all on function public.answer_cache_search(extensions.vector, integer, real) from public, anon;
grant execute on function public.answer_cache_search(extensions.vector, integer, real) to authenticated;

-- Write: user_id ni auth.uid() dan oladi
create or replace function public.answer_cache_write(
  p_query_hash text,
  p_query text,
  p_answer text,
  p_model text,
  p_embedding extensions.vector(1536)
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.answer_cache (user_id, query_hash, query, answer, model, embedding)
  values (auth.uid(), p_query_hash, p_query, p_answer, p_model, p_embedding)
  on conflict do nothing;
end
$$;

revoke all on function public.answer_cache_write(text, text, text, text, extensions.vector) from public, anon;
grant execute on function public.answer_cache_write(text, text, text, text, extensions.vector) to authenticated;

-- Touch: user o'z hitini registratsiya qiladi
create or replace function public.answer_cache_touch(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.answer_cache
     set hits = hits + 1, last_used_at = now()
   where id = p_id and user_id = auth.uid()
$$;

revoke all on function public.answer_cache_touch(uuid) from public, anon;
grant execute on function public.answer_cache_touch(uuid) to authenticated;
