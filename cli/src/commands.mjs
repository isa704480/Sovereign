// SOVEREIGN CLI — slash buyruqlar, skillar va brauzer helperlari.

import { exec } from "node:child_process";

/** Web'dagi 6 ta skil bilan bir xil. */
export const SKILLS = [
  { id: "ui-ux-pro-max", name: "UI/UX Pro Max", glyph: "✦", desc: "Premium interfeys dizayni" },
  { id: "apple-design", name: "Apple Design", glyph: "", desc: "Apple HIG uslubi, liquid glass" },
  { id: "clean-code", name: "Clean Code", glyph: "◆", desc: "Toza, xavfsiz kod" },
  { id: "cybersecurity", name: "Cybersecurity Pro", glyph: "🛡", desc: "26-domenli xavfsizlik audit" },
  { id: "pro-writing", name: "Pro Writing", glyph: "✎", desc: "Aniq, ishonarli matn" },
  { id: "data-viz", name: "Data Viz", glyph: "▦", desc: "Grafik va jadval tamoyillari" },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);

/** Slash-buyruqlar to'liq ro'yxati (menu + tab autocomplete uchun). */
export const SLASH_COMMANDS = [
  { cmd: "/help",     glyph: "❔", desc: "Yordam va buyruqlar ro'yxati", color: "indigo" },
  { cmd: "/skills",   glyph: "✦",  desc: "SOVEREIGN skillari ro'yxati", color: "violet" },
  { cmd: "/skill",    glyph: "◈",  desc: "Skilni yoqish/o'chirish: /skill <id>", color: "violet" },
  { cmd: "/models",   glyph: "⬡",  desc: "Mavjud modellar ro'yxati", color: "teal" },
  { cmd: "/model",    glyph: "◉",  desc: "Modelni almashtirish: /model <id>", color: "teal" },
  { cmd: "/attach",   glyph: "📎", desc: "Fayl biriktirish: /attach <yo'l>", color: "amber" },
  { cmd: "/detach",   glyph: "✕",  desc: "Biriktirilgan fayllarni tozalash", color: "gray" },
  { cmd: "/cwd",      glyph: "📁", desc: "Ish papkasini o'zgartirish: /cwd <yo'l>", color: "teal" },
  { cmd: "/clear",    glyph: "🗑", desc: "Suhbatni tozalash", color: "gray" },
  { cmd: "/login",    glyph: "🔑", desc: "SOVEREIGN akkauntga kirish", color: "emerald" },
  { cmd: "/logout",   glyph: "🚪", desc: "Akkauntdan chiqish", color: "amber" },
  { cmd: "/register", glyph: "✎",  desc: "Saytda ro'yxatdan o'tish (brauzer ochiladi)", color: "emerald" },
  { cmd: "/upgrade",  glyph: "💎", desc: "Tarifni oshirish (brauzer ochiladi)", color: "pink" },
  { cmd: "/whoami",   glyph: "👤", desc: "Kim sifatida ulanganingiz", color: "gray" },
  { cmd: "/exit",     glyph: "⎋",  desc: "Chiqish", color: "red" },
];

export const SLASH_NAMES = SLASH_COMMANDS.map((s) => s.cmd);

/** Brauzerni platformaga qarab ochish (zero-dep). */
export function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(command, () => {});
}
