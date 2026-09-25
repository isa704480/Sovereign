-- SOVEREIGN AI — vektor qidiruvi uchun HNSW indekslari (ivfflat o'rniga).
-- ivfflat bo'sh jadvalda qurilgan (lists=100) — ma'lumot ko'paygach aniqlik va
-- tezlik pasayadi, qayta qurishni talab qiladi. HNSW qayta qurishsiz o'sadi va
-- 100k+ foydalanuvchida ham millisekundlarda qidiradi. Idempotent.

drop index if exists public.kb_chunks_embedding;
create index if not exists kb_chunks_embedding_hnsw
  on public.kb_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

drop index if exists public.answer_cache_embedding_idx;
create index if not exists answer_cache_embedding_hnsw
  on public.answer_cache using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
