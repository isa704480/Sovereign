-- SOVEREIGN AI — Knowledge Base (RAG). Uses pgvector for semantic search.
create extension if not exists vector with schema extensions;

create table if not exists public.kb_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  mime        text,
  size        int not null default 0,
  status      text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  created_at  timestamptz not null default now()
);

create table if not exists public.kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   extensions.vector(1536),
  created_at  timestamptz not null default now()
);

create index if not exists kb_documents_user on public.kb_documents (user_id, created_at desc);
create index if not exists kb_chunks_doc on public.kb_chunks (document_id, chunk_index);
create index if not exists kb_chunks_embedding on public.kb_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

drop policy if exists "kb_documents: own rows" on public.kb_documents;
create policy "kb_documents: own rows" on public.kb_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_chunks: own rows" on public.kb_chunks;
create policy "kb_chunks: own rows" on public.kb_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Semantic search RPC: returns the top-k chunks most similar to the query.
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
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.document_id,
    d.name,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where c.user_id = p_user_id and c.embedding is not null
  order by c.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

revoke all on function public.kb_search(uuid, extensions.vector, int) from public;
grant execute on function public.kb_search(uuid, extensions.vector, int) to authenticated;
