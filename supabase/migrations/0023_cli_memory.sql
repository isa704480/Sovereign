-- SOVEREIGN — CLI ↔ Web umumiy xotira (Bosqich 4 ko'prigi).
-- CLI'dagi /remember /forget endi web bilan BIR XIL memory_nodes jadvaliga
-- yozadi/o'qiydi. Token → user_id (cli_sessions) orqali, RLS'ni SECURITY DEFINER
-- bilan xavfsiz aylanib o'tadi (cli_whoami naqshi).

-- Token'dan foydalanuvchini oladi (yaroqli, tasdiqlangan, muddati o'tmagan).
create or replace function public.cli_uid(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id
    from public.cli_sessions
   where token = p_token
     and approved = true
     and revoked_at is null
     and expires_at > now()
   limit 1;
$$;
revoke all on function public.cli_uid(text) from public;
grant execute on function public.cli_uid(text) to anon, authenticated;

-- Xotira ro'yxati (eng yangi oxirida — CLI shu tartibda ko'rsatadi).
create or replace function public.cli_memory_list(p_token text)
returns table (id uuid, content text, kind text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  v_uid := public.cli_uid(p_token);
  if v_uid is null then return; end if;
  return query
    select m.id, m.content, m.kind, m.created_at
      from public.memory_nodes m
     where m.user_id = v_uid
     order by m.created_at asc
     limit 200;
end;
$$;
revoke all on function public.cli_memory_list(text) from public;
grant execute on function public.cli_memory_list(text) to anon, authenticated;

-- Xotira qo'shish (takror bo'lsa mavjud id'ni qaytaradi).
create or replace function public.cli_memory_add(p_token text, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_text text := left(btrim(coalesce(p_content, '')), 500);
  v_id uuid;
begin
  v_uid := public.cli_uid(p_token);
  if v_uid is null or v_text = '' then return null; end if;

  select id into v_id
    from public.memory_nodes
   where user_id = v_uid and lower(content) = lower(v_text)
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.memory_nodes (user_id, content, kind, source)
  values (v_uid, v_text, 'fact', 'cli')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.cli_memory_add(text, text) from public;
grant execute on function public.cli_memory_add(text, text) to anon, authenticated;

-- Bitta xotirani o'chirish (faqat egasiniki).
create or replace function public.cli_memory_delete(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  v_uid := public.cli_uid(p_token);
  if v_uid is null then return false; end if;
  delete from public.memory_nodes where id = p_id and user_id = v_uid;
  return found;
end;
$$;
revoke all on function public.cli_memory_delete(text, uuid) from public;
grant execute on function public.cli_memory_delete(text, uuid) to anon, authenticated;

-- Barcha xotirani tozalash (akkaunt bo'yicha — umumiy).
create or replace function public.cli_memory_clear(p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  v_uid := public.cli_uid(p_token);
  if v_uid is null then return 0; end if;
  delete from public.memory_nodes where user_id = v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.cli_memory_clear(text) from public;
grant execute on function public.cli_memory_clear(text) to anon, authenticated;
