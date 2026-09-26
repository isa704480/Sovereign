// SOVEREIGN CLI — slash buyruqlar, skillar va brauzer helperlari.

import { spawn } from "node:child_process";

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
  { cmd: "/undo",     desc: "Buyruq o'zgartirgan fayllarni qaytarish — /undo [n | list]" },
  { cmd: "/fork",     desc: "Joriy suhbatdan yangi shox ochish" },

  { cmd: "/vibe",     desc: "Vibe rejim — kodni faqat AI yozadi" },
  { cmd: "/auto",     desc: "FULL AUTO — hech narsa so'ralmaydi (yoz → testla → tuzat)" },
  { cmd: "/swarm",    desc: "Parallel ishchilar — /swarm 4 <vazifa>" },

  { cmd: "/model",    desc: "Modelni tanlash — strelka menyusi (yoki /model <id>, /model auto)" },
  { cmd: "/models",   desc: "Oilalar menyusi (yoki /models <so'z> qidiruv)" },

  { cmd: "/skills",   desc: "SOVEREIGN Skills ro'yxati" },
  { cmd: "/skill",    desc: "Skilni ON/OFF — /skill <id>" },
  { cmd: "/memory",   desc: "Individual xotira — eslab qolinganlar" },
  { cmd: "/remember", desc: "Eslab qolish — /remember <fakt>" },
  { cmd: "/project",  desc: "Loyiha xotirasi (SOVEREIGN.md) — /project init yaratadi" },
  { cmd: "/project-remember", desc: "Jamoa qoidasini SOVEREIGN.md ga yozish — /project-remember <fakt>" },
  { cmd: "/forget",   desc: "Xotirani o'chirish — /forget [n]" },

  { cmd: "/whoami",   desc: "Ulanish holati" },
  { cmd: "/login",    desc: "SOVEREIGN akkauntga kirish" },
  { cmd: "/logout",   desc: "Akkauntdan chiqish" },
  { cmd: "/register", desc: "Ro'yxatdan o'tish (brauzer ochiladi)" },
  { cmd: "/upgrade",  desc: "Tarifni oshirish (brauzer ochiladi)" },

  { cmd: "/cwd",      desc: "Ish papkasini o'zgartirish" },
  { cmd: "/doctor",   desc: "Diagnostika — Node, config, server, login" },
  { cmd: "/version",  desc: "CLI versiyasi" },
  { cmd: "/exit",     desc: "Chiqish (yoki Ctrl+C ikki marta)" },
];

export const SLASH_NAMES = SLASH_COMMANDS.map((s) => s.cmd);

/**
 * Brauzerni platformaga qarab ochish (zero-dep). Shell ISHLATILMAYDI —
 * argumentlar massiv sifatida uzatiladi, URL faqat http(s) bo'lishi shart.
 * Windows'da `cmd /c start` o'rniga rundll32 (cmd `&`, `^`, `%` ni talqin qiladi).
 * @returns {boolean} ochildi/ochilmadi
 */
export function openBrowser(url) {
  let href;
  try {
    const u = new URL(String(url));
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    href = u.href;
  } catch {
    return false;
  }
  const p = process.platform;
  const [cmd, args] =
    p === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", href]]
      : p === "darwin"
      ? ["open", [href]]
      : ["xdg-open", [href]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", shell: false, windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
