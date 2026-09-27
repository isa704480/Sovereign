/**
 * Connector yozish amallarini tasdiqlash — SERVER qismi (connector-confirm-types.ts — umumiy qism).
 *
 * 1) validateActionArgs — model bergan argumentlarni tekshiradi va normallashtiradi (taklif paytida
 *    ham, tasdiqlash paytida ham — bir xil funksiya).
 * 2) buildSummary — kartadagi xulosani SERVER quradi (model markdown/havolasi emas).
 * 3) PendingStore — kutilayotgan amal serverda saqlanadi; mijozga faqat shaffof `ref` beriladi,
 *    mijoz yuborgan argumentlarga HECH QACHON ishonilmaydi:
 *    - Upstash sozlangan bo'lsa — Redis (kalit `sov-cc:<userId>:<id>`, TTL 10 daq., GETDEL — bir martalik);
 *    - aks holda — AES-256-GCM bilan shifrlangan va autentifikatsiyalangan token (args + userId + muddat;
 *      AAD = userId, kalit HKDF orqali CONNECTOR_TOKEN_KEY'dan, bo'lmasa CRON_SECRET'dan). Bir martalik —
 *      instansiya xotirasidagi "ishlatilgan" ro'yxati (ko'p instansiyada Upstash tavsiya etiladi);
 *    - hech biri bo'lmasa (lokal dev) — instansiya xotirasi.
 *
 * Toza modul ("server-only" importi yo'q) — tsx testlarida ham ishlaydi; faqat server kodi import qiladi.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import {
  CONFIRM_TTL_MS,
  CONFIRMABLE_TOOLS,
  connectorOf,
  isWriteTool,
  MCP_TOOL_PREFIX,
  plainText,
  PREVIEW_LIMITS,
  type ConfirmConnector,
  type ConfirmSummary,
} from "./connector-confirm-types";
import { sheetIdOf } from "./connector-guard";

/* ------------------------------ Validatsiya ------------------------------ */

/** Jadval qatorlari chegaralari (tool modeli max_tokens=1024 — amalda ancha kichik bo'ladi). */
export const ROW_LIMITS = { rows: 500, cols: 50, cell: 5000 } as const;
/** Normallashtirilgan argumentlarning JSON hajmi chegarasi. */
export const ARGS_MAX_BYTES = 32_000;
const MCP_ARGS_MAX_BYTES = 16_000;

export type ValidArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

function rowsOf(v: unknown, required: boolean): string[][] | string | null {
  if (v === undefined || v === null) return required ? "rows yo'q" : null;
  if (!Array.isArray(v)) return "rows massiv emas";
  if (v.length > ROW_LIMITS.rows) return `qatorlar soni ${ROW_LIMITS.rows} dan ko'p`;
  const out: string[][] = [];
  for (const row of v) {
    if (!Array.isArray(row)) return "qator massiv emas";
    if (row.length > ROW_LIMITS.cols) return `ustunlar soni ${ROW_LIMITS.cols} dan ko'p`;
    const cells: string[] = [];
    for (const c of row) {
      if (c === null || c === undefined) cells.push("");
      else if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") {
        const s = String(c);
        if (s.length > ROW_LIMITS.cell) return "katak juda uzun";
        cells.push(s);
      } else return "katak qiymati matn emas";
    }
    out.push(cells);
  }
  if (required && !out.length) return "rows bo'sh";
  return out;
}

function titleOf(v: unknown): string {
  return plainText(v, PREVIEW_LIMITS.title);
}

function sizeOk(args: Record<string, unknown>, max: number): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(args), "utf8") <= max;
  } catch {
    return false;
  }
}

/**
 * Yozish toolining argumentlarini tekshiradi va normallashtiradi. Faqat ma'lum maydonlar qoladi
 * (ortiqcha maydonlar tashlanadi). Qo'llab-quvvatlanmaydigan tool — xato.
 */
export function validateActionArgs(tool: string, raw: unknown): ValidArgs {
  if (!isWriteTool(tool)) return { ok: false, error: "tool yozish amali emas" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "argumentlar obyekt emas" };
  const a = raw as Record<string, unknown>;

  if (tool.startsWith(MCP_TOOL_PREFIX)) {
    if (!/^mcp__[A-Za-z0-9_.-]{1,64}$/.test(tool)) return { ok: false, error: "MCP tool nomi yaroqsiz" };
    let copy: Record<string, unknown>;
    try {
      copy = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "MCP argumentlari JSON emas" };
    }
    if (!sizeOk(copy, MCP_ARGS_MAX_BYTES)) return { ok: false, error: "MCP argumentlari juda katta" };
    return { ok: true, args: copy };
  }

  if (!CONFIRMABLE_TOOLS.has(tool)) return { ok: false, error: "bu amal tasdiqlash orqali qo'llab-quvvatlanmaydi" };

  if (tool === "gsheets_create") {
    const title = titleOf(a.title);
    if (!title) return { ok: false, error: "jadval nomi yo'q" };
    const rows = rowsOf(a.rows, false);
    if (typeof rows === "string") return { ok: false, error: rows };
    const args: Record<string, unknown> = rows?.length ? { title, rows } : { title };
    return sizeOk(args, ARGS_MAX_BYTES) ? { ok: true, args } : { ok: false, error: "ma'lumot juda katta" };
  }
  if (tool === "gsheets_append") {
    const id = sheetIdOf(a.spreadsheet_id);
    if (!id) return { ok: false, error: "jadval ID si yaroqsiz" };
    const rows = rowsOf(a.rows, true);
    if (typeof rows === "string" || !rows) return { ok: false, error: typeof rows === "string" ? rows : "rows yo'q" };
    const args = { spreadsheet_id: id, rows };
    return sizeOk(args, ARGS_MAX_BYTES) ? { ok: true, args } : { ok: false, error: "ma'lumot juda katta" };
  }
  // gslides_create
  const title = titleOf(a.title);
  if (!title) return { ok: false, error: "taqdimot nomi yo'q" };
  return { ok: true, args: { title } };
}

/* -------------------------------- Xulosa --------------------------------- */

/** Formula bilan boshlanadigan kataklar soni (USER_ENTERED — formula sifatida bajariladi). */
function formulaCount(rows: string[][]): number {
  let n = 0;
  for (const r of rows) for (const c of r) if (/^\s*[=+@]/.test(c) || /^\s*-\s*[A-Za-z(]/.test(c)) n++;
  return n;
}

function preview(rows: string[][]): string[][] {
  return rows.slice(0, PREVIEW_LIMITS.rows).map((r) => r.slice(0, PREVIEW_LIMITS.cols).map((c) => plainText(c, PREVIEW_LIMITS.cell)));
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.slice(0, PREVIEW_LIMITS.host);
  } catch {
    return "";
  }
}

/** Kartadagi xulosa — FAQAT validateActionArgs natijasidan quriladi. */
export function buildSummary(tool: string, args: Record<string, unknown>, mcpUrl?: string): ConfirmSummary {
  if (tool === "gsheets_create" || tool === "gsheets_append") {
    const rows = (Array.isArray(args.rows) ? args.rows : []) as string[][];
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const common = { rows: rows.length, cols, preview: preview(rows), formulas: formulaCount(rows) };
    return tool === "gsheets_create"
      ? { kind: "sheets_create", title: titleOf(args.title), ...common }
      : { kind: "sheets_append", spreadsheetId: String(args.spreadsheet_id), ...common };
  }
  if (tool === "gslides_create") return { kind: "slides_create", title: titleOf(args.title) };
  let json = "";
  try {
    json = JSON.stringify(args, null, 2);
  } catch {
    json = "";
  }
  const cut = json.length > PREVIEW_LIMITS.argsPreview ? `${json.slice(0, PREVIEW_LIMITS.argsPreview - 1)}…` : json;
  return {
    kind: "mcp",
    host: hostOf(mcpUrl),
    tool: plainText(tool.slice(MCP_TOOL_PREFIX.length), PREVIEW_LIMITS.tool),
    argsPreview: cut.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ""),
  };
}

/* ------------------------------ Saqlash (store) ----------------------------- */

export interface PendingInput {
  uid: string;
  connector: ConfirmConnector;
  tool: string;
  args: Record<string, unknown>;
  /** MCP: taklif paytidagi server manzili (tasdiqda foydalanuvchi ro'yxatida borligi qayta tekshiriladi). */
  mcpUrl?: string;
}

export interface PendingAction extends PendingInput {
  v: 1;
  id: string;
  exp: number;
}

export type TakeResult = { ok: true; action: PendingAction } | { ok: false; reason: "invalid" | "expired" | "used" };

export interface PendingStore {
  readonly mode: "redis" | "token" | "memory";
  put(input: PendingInput, now?: number): Promise<{ id: string; ref: string; exp: number }>;
  /** Bir martalik: muvaffaqiyatli `take` dan keyin shu ref boshqa ishlamaydi. */
  take(ref: string, uid: string, now?: number): Promise<TakeResult>;
}

const newId = () => randomBytes(16).toString("base64url");
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Saqlangan/ochilgan yozuvni qayta tekshiradi (buzilgan yoki eski format — rad). */
function asAction(v: unknown): PendingAction | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (a.v !== 1 || typeof a.id !== "string" || typeof a.uid !== "string" || typeof a.tool !== "string") return null;
  if (typeof a.exp !== "number" || !a.args || typeof a.args !== "object" || Array.isArray(a.args)) return null;
  const connector = connectorOf(a.tool);
  if (!connector || a.connector !== connector) return null;
  if (a.mcpUrl !== undefined && typeof a.mcpUrl !== "string") return null;
  return a as unknown as PendingAction;
}

/** Minimal KV (Upstash yoki xotira): TTL bilan yozish va atomik "o'qib o'chirish". */
export interface ConfirmKV {
  set(key: string, value: string, ttlMs: number): Promise<void>;
  getdel(key: string): Promise<unknown>;
}

const kvKey = (uid: string, id: string) => `sov-cc:${uid}:${id}`;

export function kvPendingStore(kv: ConfirmKV, mode: "redis" | "memory"): PendingStore {
  return {
    mode,
    async put(input, now = Date.now()) {
      const id = newId();
      const exp = now + CONFIRM_TTL_MS;
      const action: PendingAction = { v: 1, id, exp, ...input };
      await kv.set(kvKey(input.uid, id), JSON.stringify(action), CONFIRM_TTL_MS);
      return { id, ref: `r1.${id}`, exp };
    },
    async take(ref, uid, now = Date.now()) {
      const m = /^r1\.([A-Za-z0-9_-]{16,64})$/.exec(typeof ref === "string" ? ref : "");
      if (!m || !uid) return { ok: false, reason: "invalid" };
      // Kalitda userId bor — boshqa foydalanuvchi ref'i bilan hech narsa topilmaydi (va o'chirilmaydi).
      const raw = await kv.getdel(kvKey(uid, m[1]));
      if (raw === null || raw === undefined) return { ok: false, reason: "expired" };
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { ok: false, reason: "invalid" };
        }
      }
      const action = asAction(parsed);
      if (!action || action.uid !== uid || action.id !== m[1]) return { ok: false, reason: "invalid" };
      if (action.exp <= now) return { ok: false, reason: "expired" };
      return { ok: true, action };
    },
  };
}

/** Instansiya xotirasidagi KV (lokal dev / Upstash yo'q va sir yo'q). */
export function memoryKV(): ConfirmKV {
  const map = new Map<string, { v: string; exp: number }>();
  return {
    async set(key, value, ttlMs) {
      const now = Date.now();
      for (const [k, e] of map) if (e.exp <= now) map.delete(k);
      map.set(key, { v: value, exp: now + ttlMs });
    },
    async getdel(key) {
      const e = map.get(key);
      map.delete(key);
      return e && e.exp > Date.now() ? e.v : null;
    },
  };
}

/* ------------------------------ Token rejimi ------------------------------ */

const TOKEN_PREFIX = "t1";
const aad = (uid: string) => Buffer.from(`sov-cc:v1:${uid}`, "utf8");

interface TokenKey {
  kid: string;
  key: Buffer;
}

/** Sirdan maqsadga ajratilgan kalit (HKDF) — boshqa maqsaddagi imzolar bilan aralashmaydi. */
export function deriveConfirmKey(secret: string): TokenKey {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), "sov-connector-confirm", "v1", 32));
  const kid = createHash("sha256").update("sov-cc-kid:").update(key).digest("base64url").slice(0, 8);
  return { kid, key };
}

/**
 * Shifrlangan token rejimi. `secrets[0]` — shifrlash kaliti, qolganlari — faqat ochish (rotatsiya).
 * `used` — bir martalik nazorat (id → muddat); ko'p instansiyada umumiy emas.
 */
export function tokenPendingStore(secrets: readonly string[], used: Map<string, number> = new Map()): PendingStore {
  const keys = secrets.filter((s) => s && s.length >= 16).map(deriveConfirmKey);
  if (!keys.length) throw new Error("connector-confirm: no usable secret");
  return {
    mode: "token",
    async put(input, now = Date.now()) {
      const id = newId();
      const exp = now + CONFIRM_TTL_MS;
      const action: PendingAction = { v: 1, id, exp, ...input };
      const k = keys[0];
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", k.key, iv);
      c.setAAD(aad(input.uid));
      const ct = Buffer.concat([c.update(JSON.stringify(action), "utf8"), c.final()]);
      const ref = [TOKEN_PREFIX, k.kid, iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
      return { id, ref, exp };
    },
    async take(ref, uid, now = Date.now()) {
      if (typeof ref !== "string" || ref.length > 65_536 || !uid) return { ok: false, reason: "invalid" };
      const parts = ref.split(".");
      if (parts.length !== 5 || parts[0] !== TOKEN_PREFIX) return { ok: false, reason: "invalid" };
      const [, kid, ivS, ctS, tagS] = parts;
      const k = keys.find((x) => x.kid === kid);
      if (!k) return { ok: false, reason: "invalid" };
      let action: PendingAction | null = null;
      try {
        const iv = Buffer.from(ivS, "base64url");
        const tag = Buffer.from(tagS, "base64url");
        if (iv.length !== 12 || tag.length !== 16) return { ok: false, reason: "invalid" };
        const d = createDecipheriv("aes-256-gcm", k.key, iv);
        // AAD = userId: boshqa foydalanuvchi tokeni (yoki o'zgartirilgan token) ochilmaydi.
        d.setAAD(aad(uid));
        d.setAuthTag(tag);
        const plain = Buffer.concat([d.update(Buffer.from(ctS, "base64url")), d.final()]).toString("utf8");
        action = asAction(JSON.parse(plain));
      } catch {
        return { ok: false, reason: "invalid" };
      }
      if (!action || action.uid !== uid || !ID_RE.test(action.id)) return { ok: false, reason: "invalid" };
      if (action.exp <= now) return { ok: false, reason: "expired" };
      for (const [id, exp] of used) if (exp <= now) used.delete(id);
      if (used.has(action.id)) return { ok: false, reason: "used" };
      used.set(action.id, action.exp);
      return { ok: true, action };
    },
  };
}

/* ------------------------------ Standart store ------------------------------ */

/** Token rejimi sirlari: CONNECTOR_TOKEN_KEY (bo'lmasa CRON_SECRET) + CONNECTOR_TOKEN_KEY_PREV (rotatsiya). */
export function confirmSecrets(env: Record<string, string | undefined> = process.env): string[] {
  const primary = env.CONNECTOR_TOKEN_KEY?.trim() || env.CRON_SECRET?.trim() || "";
  const prev = env.CONNECTOR_TOKEN_KEY_PREV?.trim() || "";
  return [primary, prev].filter((s, i, a) => s.length >= 16 && a.indexOf(s) === i);
}

let cached: PendingStore | null = null;

/** Upstash → shifrlangan token → xotira. */
export async function getPendingStore(): Promise<PendingStore> {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });
    cached = kvPendingStore(
      {
        async set(key, value, ttlMs) {
          await redis.set(key, value, { px: Math.max(1, Math.round(ttlMs)) });
        },
        getdel: (key) => redis.getdel(key),
      },
      "redis",
    );
    return cached;
  }
  const secrets = confirmSecrets();
  if (secrets.length) {
    cached = tokenPendingStore(secrets);
    return cached;
  }
  if (process.env.VERCEL_ENV === "production") {
    console.error("[connector-confirm] no Upstash and no CONNECTOR_TOKEN_KEY/CRON_SECRET — pending actions live in instance memory");
  }
  cached = kvPendingStore(memoryKV(), "memory");
  return cached;
}
