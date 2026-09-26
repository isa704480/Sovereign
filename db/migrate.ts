/**
 * Applies supabase/migrations/*.sql in order against DATABASE_URL.
 * Tracks applied files in public._migrations so re-runs are safe.
 *
 *   npm run db:migrate
 *
 * DATABASE_URL: Supabase → Project Settings → Database → Connection string (URI).
 * Use the "Session pooler" URI on networks without IPv6.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL topilmadi. .env.local ga qo'shing (docs/SETUP.md).");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    -- Faqat server (postgres) o'qib/yozadi: anon kalit bilan tarixni o'chirib eski
    -- migratsiyalarni qayta o'tkazib bo'lmasin (0032).
    alter table public._migrations enable row level security;
    revoke all on table public._migrations from anon, authenticated;
  `);
  const { rows } = await client.query<{ name: string }>("select name from public._migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) {
      console.log(`✓ ${file} (allaqachon)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("XATO");
      throw err;
    }
  }

  const tables = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' order by 1",
  );
  console.log("Jadvallar:", tables.rows.map((r) => r.table_name).join(", "));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
