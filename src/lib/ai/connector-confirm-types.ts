/**
 * Connector yozish amallarini tasdiqlash — mijoz va server uchun UMUMIY (tarmoqsiz, sirsiz) qism.
 *
 * Tashqi hisobda ma'lumot yaratadigan/o'zgartiradigan/yuboradigan tool (Sheets create/append,
 * Slides create, read-only ekani isbotlanmagan MCP tool, kelajakdagi send/write) model tool
 * bosqichida AVTOMATIK bajarilmaydi: server uni "taklif" qiladi (`connector_confirm` SSE hodisasi),
 * foydalanuvchi kartada tasdiqlasagina bajariladi (src/app/actions/connector-confirm.ts).
 *
 * Bu faylda: read/write klassifikatori, SSE hodisasi turi, mijozdagi himoyaviy normalizatsiya va
 * havola tekshiruvi. Server qismi (saqlash, imzo, argument validatsiyasi) — connector-confirm.ts.
 */

export const MCP_TOOL_PREFIX = "mcp__";

/**
 * Faqat O'QIYDIGAN (tashqi dunyoda iz qoldirmaydigan) toollar — aniq ro'yxat (allow-list).
 * Ro'yxatda YO'Q har qanday tool (MCP, noma'lum, kelajakdagi yangi tool) — yozish amali deb
 * hisoblanadi va foydalanuvchi tasdig'ini talab qiladi (standart holat — rad).
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "figma_get_file",
  "github_get_repo",
  "github_read_file",
  "gsheets_read",
  "gmail_list",
  "gmail_top_senders",
  "gcalendar_list",
  "public_weather",
  "public_currency",
  "public_crypto",
  "public_time",
  "public_dictionary",
]);

/** Tasdiq orqali bajarilishi QO'LLAB-QUVVATLANADIGAN yozish toollari (MCP'dan tashqari). */
export const CONFIRMABLE_TOOLS: ReadonlySet<string> = new Set(["gsheets_create", "gsheets_append", "gslides_create"]);

export type ToolKind = "read" | "write";

/**
 * Tool turi. MCP toollari (tashqi server `readOnlyHint` bersa ham — bu isbot emas) va ro'yxatda
 * bo'lmagan har qanday nom — "write".
 */
export function classifyTool(name: string): ToolKind {
  if (typeof name !== "string" || !name || name.startsWith(MCP_TOOL_PREFIX)) return "write";
  return READ_ONLY_TOOLS.has(name) ? "read" : "write";
}

export const isWriteTool = (name: string): boolean => classifyTool(name) === "write";

/** Tool qaysi connectorga tegishli (tasdiqlash vaqtida shu connector yoqilganligi qayta tekshiriladi). */
export type ConfirmConnector = "gsheets" | "gslides" | "mcp";

export function connectorOf(tool: string): ConfirmConnector | null {
  if (tool.startsWith(MCP_TOOL_PREFIX)) return "mcp";
  if (tool === "gsheets_create" || tool === "gsheets_append") return "gsheets";
  if (tool === "gslides_create") return "gslides";
  return null;
}

/** Kutilayotgan amalning yashash muddati. */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;

/** Kartadagi oldindan ko'rish chegaralari. */
export const PREVIEW_LIMITS = { rows: 5, cols: 6, cell: 80, title: 200, argsPreview: 600, host: 253, tool: 80 } as const;

/**
 * Server QURGAN xulosa (model markdown/havolasi emas) — mijoz uni faqat oddiy matn sifatida,
 * o'z tilida chizadi.
 */
export type ConfirmSummary =
  | { kind: "sheets_create"; title: string; rows: number; cols: number; preview: string[][]; formulas: number }
  | { kind: "sheets_append"; spreadsheetId: string; rows: number; cols: number; preview: string[][]; formulas: number }
  | { kind: "slides_create"; title: string }
  | { kind: "mcp"; host: string; tool: string; argsPreview: string };

/** SSE hodisasi: server taklif qilgan (hali BAJARILMAGAN) amal. */
export interface ConnectorConfirmEvent {
  type: "connector_confirm";
  /** Server yaratgan tasodifiy id (karta kaliti). */
  id: string;
  /** Tasdiqlash/rad etish uchun serverga qaytariladigan shaffof havola (Redis id yoki imzolangan token). */
  ref: string;
  connector: ConfirmConnector;
  tool: string;
  summary: ConfirmSummary;
  /** ms (epoch) — shundan keyin server amalni qabul qilmaydi. */
  expiresAt: number;
}

/** Kartaning saqlanadigan holati ("running" — faqat komponent ichida, saqlanmaydi). */
export type ConfirmState = "pending" | "done" | "partial" | "rejected" | "expired" | "error";

export interface ConnectorConfirmCard extends Omit<ConnectorConfirmEvent, "type"> {
  state: ConfirmState;
  /** Faqat connectorning o'z https domeni (docs.google.com) — safeConnectorLink tekshirgan. */
  link?: string;
  /** Xato kodi (UI tarjima qiladi). */
  code?: ConfirmErrorCode;
  /** MCP natijasi — tashqi, ishonchsiz: faqat oddiy matn sifatida ko'rsatiladi. */
  output?: string;
}

export type ConfirmErrorCode = "auth" | "invalid" | "rate_limited" | "not_connected" | "failed";

/** Server action javobi. */
export interface ConfirmResult {
  status: Exclude<ConfirmState, "pending">;
  link?: string;
  code?: ConfirmErrorCode;
  output?: string;
}

/** Ko'rinmas/boshqaruv/bidi belgilarni olib tashlaydi, bo'shliqlarni siqadi va kesadi. */
export function plainText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  return s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/[\t\n\r]+/g, " ")
    .trim()
    .slice(0, max);
}

/** Ko'p qatorli matn (MCP argumentlari JSON ko'rinishi) — yangi qatorlar saqlanadi. */
export function plainBlock(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : "";
  return s.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, "").slice(0, max);
}

/** Connectorning o'z domenidagi https havola — aks holda null (model/tashqi havola ko'rsatilmaydi). */
export const LINK_HOSTS: ReadonlySet<string> = new Set(["docs.google.com"]);

export function safeConnectorLink(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !LINK_HOSTS.has(u.hostname)) return null;
  return u.href;
}

const CONNECTORS: readonly ConfirmConnector[] = ["gsheets", "gslides", "mcp"];
const SHEET_ID_RE = /^[A-Za-z0-9_-]{20,100}$/;
const REF_RE = /^[A-Za-z0-9._-]{8,65536}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function count(v: unknown, max: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

function previewOf(v: unknown): string[][] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, PREVIEW_LIMITS.rows)
    .map((row) => (Array.isArray(row) ? row.slice(0, PREVIEW_LIMITS.cols).map((c) => plainText(c, PREVIEW_LIMITS.cell)) : []));
}

function summaryOf(raw: unknown, connector: ConfirmConnector, tool: string): ConfirmSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.kind === "sheets_create" && tool === "gsheets_create" && connector === "gsheets") {
    return {
      kind: "sheets_create",
      title: plainText(s.title, PREVIEW_LIMITS.title),
      rows: count(s.rows, 100_000),
      cols: count(s.cols, 1000),
      preview: previewOf(s.preview),
      formulas: count(s.formulas, 100_000),
    };
  }
  if (s.kind === "sheets_append" && tool === "gsheets_append" && connector === "gsheets") {
    const spreadsheetId = typeof s.spreadsheetId === "string" && SHEET_ID_RE.test(s.spreadsheetId) ? s.spreadsheetId : "";
    if (!spreadsheetId) return null;
    return {
      kind: "sheets_append",
      spreadsheetId,
      rows: count(s.rows, 100_000),
      cols: count(s.cols, 1000),
      preview: previewOf(s.preview),
      formulas: count(s.formulas, 100_000),
    };
  }
  if (s.kind === "slides_create" && tool === "gslides_create" && connector === "gslides") {
    return { kind: "slides_create", title: plainText(s.title, PREVIEW_LIMITS.title) };
  }
  if (s.kind === "mcp" && connector === "mcp" && tool.startsWith(MCP_TOOL_PREFIX)) {
    return {
      kind: "mcp",
      host: plainText(s.host, PREVIEW_LIMITS.host),
      tool: plainText(s.tool, PREVIEW_LIMITS.tool),
      argsPreview: plainBlock(s.argsPreview, PREVIEW_LIMITS.argsPreview),
    };
  }
  return null;
}

/**
 * Mijozdagi himoyaviy tekshiruv (server allaqachon tozalagan — ikkinchi qatlam): noto'g'ri shakl →
 * null (karta chiqmaydi). Hamma matn oddiy matnga aylantiriladi va kesiladi.
 */
export function normalizeConfirmEvent(raw: unknown): ConnectorConfirmEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "connector_confirm") return null;
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
  if (typeof r.ref !== "string" || !REF_RE.test(r.ref)) return null;
  const connector = CONNECTORS.find((c) => c === r.connector);
  if (!connector) return null;
  const tool = typeof r.tool === "string" ? r.tool.slice(0, 120) : "";
  if (!tool || !isWriteTool(tool) || connectorOf(tool) !== connector) return null;
  const summary = summaryOf(r.summary, connector, tool);
  if (!summary) return null;
  const expiresAt = Number(r.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return { type: "connector_confirm", id: r.id, ref: r.ref, connector, tool, summary, expiresAt };
}
