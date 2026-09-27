-- ═══════════════════════════════════════════════════════════════
-- 0040: Connector tokenlarini shifrlash (ilova darajasida, AES-256-GCM) +
-- bilim bazasi / xotira jadvallari uchun hajm cheklovlari.
--
-- MUHIM — ishga tushirish tartibi:
--   1) Kod deploy qilingan bo'lsin: src/lib/connectors/secret.ts ishlatiladi
--      (auth/callback, actions/connectors.ts, lib/ai/connector-tools.ts).
--   2) Vercel'da CONNECTOR_TOKEN_KEY (32 bayt, base64 yoki hex) o'rnatilgan bo'lsin.
--   3) Shundan keyingina bu migratsiya ishga tushiriladi. Aks holda Google ulash
--      (callback foydalanuvchi mijozi bilan ochiq token yozadi) rad etiladi.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1) connector_accounts.config.token / .refresh — foydalanuvchi (authenticated/
-- anon) REST orqali faqat 'enc:v1:' bilan boshlanadigan (server shifrlagan)
-- qiymat yoza oladi. UPDATE'da o'zgarmagan eski (ochiq) qiymat o'tkaziladi —
-- mavjud qatorlar keyingi server yozuvida lazy shifrlanadi.
-- service_role (server) cheklanmaydi.
-- ───────────────────────────────────────────────────────────────
create or replace function public.connector_accounts_require_sealed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f text;
  v jsonb;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    foreach f in array array['token', 'refresh'] loop
      v := new.config -> f;
      if v is null or jsonb_typeof(v) = 'null' then
        continue;
      end if;
      if tg_op = 'UPDATE' and v is not distinct from (old.config -> f) then
        continue;
      end if;
      if jsonb_typeof(v) <> 'string' or left(new.config ->> f, 7) <> 'enc:v1:' then
        raise exception 'connector secrets must be sealed by the server';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists connector_accounts_require_sealed on public.connector_accounts;
create trigger connector_accounts_require_sealed
  before insert or update on public.connector_accounts
  for each row execute procedure public.connector_accounts_require_sealed();

-- ───────────────────────────────────────────────────────────────
-- 2) Hajm cheklovlari (REST orqali cheksiz yozishga qarshi).
-- NOT VALID — mavjud qatorlar tekshirilmaydi, faqat yangi yozuvlar.
-- kb_chunks: chunkText ≈3200 belgi; memory_nodes: ilova ≤300, CLI ≤500.
-- ───────────────────────────────────────────────────────────────
alter table public.kb_chunks drop constraint if exists kb_chunks_content_len;
alter table public.kb_chunks
  add constraint kb_chunks_content_len check (char_length(content) <= 8000) not valid;

alter table public.memory_nodes drop constraint if exists memory_nodes_content_len;
alter table public.memory_nodes
  add constraint memory_nodes_content_len check (char_length(content) <= 2000) not valid;

alter table public.kb_documents drop constraint if exists kb_documents_name_len;
alter table public.kb_documents
  add constraint kb_documents_name_len check (char_length(name) <= 300) not valid;

-- 3) Qator soni chegaralari (service_role cheklanmaydi). Mavjud indekslar
-- (kb_documents_user, kb_chunks_doc, memory_user_created) bilan arzon sanaladi.
create or replace function public.kb_documents_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and (select count(*) from public.kb_documents d where d.user_id = new.user_id) >= 1000 then
    raise exception 'knowledge base document limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists kb_documents_row_cap on public.kb_documents;
create trigger kb_documents_row_cap
  before insert on public.kb_documents
  for each row execute procedure public.kb_documents_row_cap();

-- Bitta hujjat: 500 000 belgi / ~3000 ≈ 170 bo'lak — 400 yetarli zaxira.
create or replace function public.kb_chunks_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and (select count(*) from public.kb_chunks c where c.document_id = new.document_id) >= 400 then
    raise exception 'knowledge base chunk limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists kb_chunks_row_cap on public.kb_chunks;
create trigger kb_chunks_row_cap
  before insert on public.kb_chunks
  for each row execute procedure public.kb_chunks_row_cap();

create or replace function public.memory_nodes_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and (select count(*) from public.memory_nodes m where m.user_id = new.user_id) >= 5000 then
    raise exception 'memory limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists memory_nodes_row_cap on public.memory_nodes;
create trigger memory_nodes_row_cap
  before insert on public.memory_nodes
  for each row execute procedure public.memory_nodes_row_cap();
