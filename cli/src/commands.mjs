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

/**
 * Slash-buyruqlar — Apple-style restraint: hech qanday emoji, faqat matn.
 * Menyu Apple settings-list ko'rinishida guruhlanadi (ui.mjs slashMenu).
 */
export const SLASH_COMMANDS = [
  { cmd: "/help",     desc: "Buyruqlar menyusi" },
  { cmd: "/clear",    desc: "Suhbat tarixini tozalash" },
  { cmd: "/attach",   desc: "Fayl biriktirish — /attach <yo'l> yoki @yo'l" },
  { cmd: "/detach",   desc: "Barcha biriktirilganlarni bekor qilish" },

  { cmd: "/sessions", desc: "Saqlangan suhbatlar ro'yxati" },
  { cmd: "/resume",   desc: "Suhbatni davom ettirish — /resume <id>" },
  { cmd: "/rewind",   desc: "Oxirgi savolni qaytarish — /rewind [n]" },
  { cmd: "/fork",     desc: "Joriy suhbatdan yangi shox ochish" },

  { cmd: "/vibe",     desc: "Vibe rejim — kodni faqat AI yozadi" },
  { cmd: "/swarm",    desc: "Parallel ishchilar — /swarm 4 <vazifa>" },

  { cmd: "/model",    desc: "Modelni tanlash — /model <id>" },
  { cmd: "/models",   desc: "Barcha modellar ro'yxati" },

  { cmd: "/skills",   desc: "SOVEREIGN Skills ro'yxati" },
  { cmd: "/skill",    desc: "Skilni ON/OFF — /skill <id>" },

  { cmd: "/whoami",   desc: "Ulanish holati" },
  { cmd: "/login",    desc: "SOVEREIGN akkauntga kirish" },
  { cmd: "/logout",   desc: "Akkauntdan chiqish" },
  { cmd: "/register", desc: "Ro'yxatdan o'tish (brauzer ochiladi)" },
  { cmd: "/upgrade",  desc: "Tarifni oshirish (brauzer ochiladi)" },

  { cmd: "/cwd",      desc: "Ish papkasini o'zgartirish" },
  { cmd: "/exit",     desc: "Chiqish" },
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
