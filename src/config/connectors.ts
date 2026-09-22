/**
 * Ulanishlar (Connectors) registri — foydalanuvchi ulashi mumkin bo'lgan tashqi
 * servislar. Har biri yoqib/o'chiriladi va (kerak bo'lsa) token yoki OAuth bilan
 * ulanadi. Haqiqiy chaqiruv chatdagi tool-calling (keyingi bosqich) orqali bo'ladi.
 */

export type ConnectorAuth = "token" | "oauth-google" | "mcp" | "builtin";
export type ConnectorCategory = "google" | "design" | "dev" | "builtin";

export interface ConnectorSpec {
  id: string;
  name: string;
  category: ConnectorCategory;
  /** Emoji/glyph — panelda belgi sifatida. */
  glyph: string;
  auth: ConnectorAuth;
  description: string;
  /** token turi uchun — kiritish maydonchasi yorlig'i. */
  tokenLabel?: string;
  /** Qanday token olish haqida havola. */
  docsUrl?: string;
  /** Google "sensitive scope" — tekshiruv talab qiladi. */
  sensitive?: boolean;
  /** oauth-google uchun so'raladigan scope'lar. */
  scopes?: string[];
}

export const CONNECTOR_CATEGORIES: { id: ConnectorCategory; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "design", label: "Dizayn" },
  { id: "dev", label: "Dasturlash" },
  { id: "builtin", label: "Ichki" },
];

const G = "https://www.googleapis.com/auth/";

export const CONNECTORS: ConnectorSpec[] = [
  // ---- Google (OAuth, ba'zilari sensitive) ----
  {
    id: "gmail",
    name: "Gmail",
    category: "google",
    glyph: "✉️",
    auth: "oauth-google",
    description: "Xatlarni o'qish va yuborish.",
    sensitive: true,
    scopes: [G + "gmail.readonly", G + "gmail.send"],
  },
  {
    id: "gdrive",
    name: "Google Disk",
    category: "google",
    glyph: "📁",
    auth: "oauth-google",
    description: "Fayllarni ko'rish va yuklash.",
    sensitive: true,
    scopes: [G + "drive.readonly"],
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    category: "google",
    glyph: "📊",
    auth: "oauth-google",
    description: "Jadvallarni o'qish va tahrirlash.",
    scopes: [G + "spreadsheets"],
  },
  {
    id: "gslides",
    name: "Google Slides",
    category: "google",
    glyph: "📽️",
    auth: "oauth-google",
    description: "Taqdimotlarni o'qish va yaratish.",
    scopes: [G + "presentations"],
  },
  {
    id: "gdocs",
    name: "Google Docs",
    category: "google",
    glyph: "📄",
    auth: "oauth-google",
    description: "Hujjatlarni o'qish va yozish.",
    scopes: [G + "documents"],
  },
  {
    id: "gcalendar",
    name: "Google Kalendar",
    category: "google",
    glyph: "📅",
    auth: "oauth-google",
    description: "Voqealarni ko'rish va qo'shish.",
    scopes: [G + "calendar.events"],
  },
  // ---- Dizayn (token) ----
  {
    id: "figma",
    name: "Figma",
    category: "design",
    glyph: "🎨",
    auth: "token",
    description: "Fayl va freymlarni o'qish (dizayndan kod).",
    tokenLabel: "Figma Personal Access Token",
    docsUrl: "https://www.figma.com/developers/api#access-tokens",
  },
  // ---- Dasturlash ----
  {
    id: "github",
    name: "GitHub",
    category: "dev",
    glyph: "🐙",
    auth: "token",
    description: "Repozitoriy, issue va PR'lar bilan ishlash.",
    tokenLabel: "GitHub Personal Access Token",
    docsUrl: "https://github.com/settings/tokens",
  },
  {
    id: "mcp",
    name: "MCP server",
    category: "dev",
    glyph: "🔌",
    auth: "mcp",
    description: "Ixtiyoriy MCP serverni ulash (URL + ixtiyoriy token).",
    tokenLabel: "MCP server URL",
  },
  // ---- Ichki (kalitsiz) ----
  {
    id: "cli-terminal",
    name: "CLI terminal",
    category: "builtin",
    glyph: "⌨️",
    auth: "builtin",
    description: "`sov` CLI kompyuterda buyruq ishga tushiradi (xavf tekshiruvi bilan).",
  },
  {
    id: "browser",
    name: "Brauzer",
    category: "builtin",
    glyph: "🌐",
    auth: "builtin",
    description: "Loyihani brauzerda ochib test qilish (preview).",
  },
  {
    id: "public-apis",
    name: "Ommaviy API'lar",
    category: "builtin",
    glyph: "🧩",
    auth: "builtin",
    description: "Kalitsiz (loginsiz) API'lar: ob-havo, valyuta, davlat, kripto, vaqt, lug'at — AI real ma'lumot oladi.",
  },
];

export const CONNECTOR_BY_ID: Record<string, ConnectorSpec> = Object.fromEntries(
  CONNECTORS.map((c) => [c.id, c]),
);
