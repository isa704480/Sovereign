-- Semantic answer cache: bir xil/juda o'xshash savol takror kelsa,
-- modelga bormasdan keshdan qaytariladi. 24 soatlik TTL.
create table if not exists public.answer_cache (
  id uuid primary key default gen_random_uuid(),
  query_hash text not null,
  query text not null,
  answer text not null,
  model text not null,
  embedding extensions.vector(1536) not null,
  hits integer not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists answer_cache_hash_idx on public.answer_cache (query_hash);
create index if not exists answer_cache_created_idx on public.answer_cache (created_at desc);
create index if not exists answer_cache_embedding_idx
  on public.answer_cache using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

alter table public.answer_cache enable row level security;

-- Semantik qidiruv: eng o'xshash yozuvni topib similarity bilan qaytaradi.
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
  where ac.created_at > now() - (p_max_age_hours || ' hours')::interval
    and (1 - (ac.embedding <=> p_embedding)) >= p_min_similarity
  order by ac.embedding <=> p_embedding
  limit 1
$$;

revoke all on function public.answer_cache_search(extensions.vector, integer, real) from public;
grant execute on function public.answer_cache_search(extensions.vector, integer, real) to anon, authenticated;

-- Kesh yozish: query, javob, model va embedding bilan.
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
  insert into public.answer_cache (query_hash, query, answer, model, embedding)
  values (p_query_hash, p_query, p_answer, p_model, p_embedding)
  on conflict do nothing;
end
$$;

revoke all on function public.answer_cache_write(text, text, text, text, extensions.vector) from public;
grant execute on function public.answer_cache_write(text, text, text, text, extensions.vector) to anon, authenticated;

-- Kesh hit registrasi (analytics uchun).
create or replace function public.answer_cache_touch(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.answer_cache
     set hits = hits + 1, last_used_at = now()
   where id = p_id
$$;

grant execute on function public.answer_cache_touch(uuid) to anon, authenticated;
