-- SOVEREIGN AI — db/migrate.ts yaratadigan public._migrations jadvali RLS'siz edi:
-- anon kalit bilan qatorlarni o'chirib, keyingi `db:migrate` da eski migratsiyalarni
-- (masalan 0003 trigger'i) qayta ishga tushirish va is_admin'ni oshirish mumkin edi.
-- Jadval bo'lmasa ham xavfsiz (faqat mavjud bo'lsa qulflanadi).

do $$
begin
  if to_regclass('public._migrations') is not null then
    execute 'alter table public._migrations enable row level security';
    execute 'revoke all on table public._migrations from anon, authenticated';
  end if;
end
$$;
