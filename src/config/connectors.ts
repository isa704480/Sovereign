/**
 * Ulanishlar (Connectors) registri — foydalanuvchi ulashi mumkin bo'lgan tashqi
 * servislar. Har biri yoqib/o'chiriladi va (kerak bo'lsa) token yoki OAuth bilan
 * ulanadi. Haqiqiy chaqiruv chatdagi tool-calling (keyingi bosqich) orqali bo'ladi.
 */

export type ConnectorAuth = "token" | "oauth-google" | "mcp" | "builtin";
export type ConnectorCategory = "google" | "design" | "dev" | "builtin";
export type ConnectorIconName =
  | "gmail"
  | "googledrive"
  | "googlesheets"
  | "googleslides"
  | "googledocs"
  | "googlecalendar"
  | "figma"
  | "github"
  | "mcp"
  | "terminal"
  | "globe"
  | "puzzle";

export interface ConnectorSpec {
  id: string;
  name: string;
  category: ConnectorCategory;
  /** Belgi nomi — panelda bir rangli ikon (simple-icons yoki lucide), emoji emas. */
  icon: ConnectorIconName;
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
  /**
   * Hali vositasi (tool) yo'q — panelda "Tez orada" deb ko'rsatiladi, ulab bo'lmaydi va
   * hech qanday scope so'ralmaydi. Avval ulanganlar uzilishi mumkin.
   */
  comingSoon?: boolean;
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
    icon: "gmail",
    auth: "oauth-google",
    description: "Xatlarni o'qish.",
    sensitive: true,
    // Faqat o'qish (least privilege, connectors-6): yuborish tooli yo'q — gmail.send so'ralmaydi.
    scopes: [G + "gmail.readonly"],
  },
  {
    id: "gdrive",
    name: "Google Disk",
    category: "google",
    icon: "googledrive",
    auth: "oauth-google",
    description: "Fayllarni ko'rish.",
    // Chatda Drive vositasi hali yo'q — scope so'ralmaydi (tez orada).
    comingSoon: true,
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    category: "google",
    icon: "googlesheets",
    auth: "oauth-google",
    description: "Jadvallarni o'qish va tahrirlash.",
    scopes: [G + "spreadsheets"],
  },
  {
    id: "gslides",
    name: "Google Slides",
    category: "google",
    icon: "googleslides",
    auth: "oauth-google",
    description: "Taqdimot yaratish.",
    scopes: [G + "presentations"],
  },
  {
    id: "gdocs",
    name: "Google Docs",
    category: "google",
    icon: "googledocs",
    auth: "oauth-google",
    description: "Hujjatlarni o'qish.",
    // Chatda Docs vositasi hali yo'q — scope so'ralmaydi (tez orada).
    comingSoon: true,
  },
  {
    id: "gcalendar",
    name: "Google Kalendar",
    category: "google",
    icon: "googlecalendar",
    auth: "oauth-google",
    description: "Voqealarni ko'rish.",
    // Faqat o'qish: gcalendar_list tooli voqea qo'shmaydi.
    scopes: [G + "calendar.events.readonly"],
  },
  // ---- Dizayn (token) ----
  {
    id: "figma",
    name: "Figma",
    category: "design",
    icon: "figma",
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
    icon: "github",
    auth: "token",
    description: "Repozitoriy va fayllarni o'qish.",
    tokenLabel: "GitHub Personal Access Token",
    docsUrl: "https://github.com/settings/tokens",
  },
  {
    id: "mcp",
    name: "MCP server",
    category: "dev",
    icon: "mcp",
    auth: "mcp",
    description: "Istalgan MCP serverni URL orqali ulash.",
    tokenLabel: "MCP server URL",
  },
  // ---- Ichki (kalitsiz) ----
  {
    id: "cli-terminal",
    name: "CLI terminal",
    category: "builtin",
    icon: "terminal",
    auth: "builtin",
    description: "`sov` CLI kompyuterda buyruq ishga tushiradi (xavf tekshiruvi bilan).",
  },
  {
    id: "browser",
    name: "Brauzer",
    category: "builtin",
    icon: "globe",
    auth: "builtin",
    description: "Loyihani brauzerda ochib test qilish (preview).",
  },
  {
    id: "public-apis",
    name: "Ommaviy API'lar",
    category: "builtin",
    icon: "puzzle",
    auth: "builtin",
    description: "Kalitsiz (loginsiz) API'lar: ob-havo, valyuta, davlat, kripto, vaqt, lug'at — AI real ma'lumot oladi.",
  },
];

export const CONNECTOR_BY_ID: Record<string, ConnectorSpec> = Object.fromEntries(
  CONNECTORS.map((c) => [c.id, c]),
);
