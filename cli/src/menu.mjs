// SOVEREIGN CLI — strelka bilan tanlanadigan menyu (zero-dep).
// ↑/↓ yurish · PgUp/PgDn sahifa · Enter tanlash · Esc orqaga · harf yozish = filtrlash.

import readline from "node:readline";
import { c } from "./ui.mjs";

/**
 * Ro'yxatdan bitta elementni tanlatadi. Tanlangan element obyektini, bekor
 * qilinsa null qaytaradi.
 *
 * Asosiy REPL readline'i ham stdin'dagi `keypress`ni tinglaydi — menyu ochiq
 * paytda uning tinglovchilarini vaqtincha olib qo'yamiz, aks holda Enter
 * REPL'ga bo'sh qator yuborib, strelkalar tarixni varaqlaydi.
 *
 * @param {{ title: string, items: {label: string, hint?: string, search?: string}[], initial?: number }} opts
 */
export function selectMenu({ title, items, initial = 0 }) {
  return new Promise((resolve) => {
    const input = process.stdin;
    const out = process.stdout;
    if (!input.isTTY || !items.length) return resolve(null);

    const saved = input.listeners("keypress");
    input.removeAllListeners("keypress");
    readline.emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();

    const page = Math.max(5, Math.min(14, (out.rows || 24) - 8));
    let query = "";
    let idx = Math.min(Math.max(0, initial), items.length - 1);
    let top = 0;
    let drawn = 0;

    const visible = () => {
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter((it) => `${it.label} ${it.search ?? ""}`.toLowerCase().includes(q));
    };

    const draw = () => {
      const list = visible();
      if (idx >= list.length) idx = Math.max(0, list.length - 1);
      if (idx < top) top = idx;
      if (idx >= top + page) top = idx - page + 1;

      const lines = [
        "",
        `  ${c.bold(c.white(title))}  ${c.dim(`${list.length} ta`)}${query ? "   " + c.accent("⌕ " + query) : ""}`,
        `  ${c.dim("↑↓ tanlash · Enter tasdiqlash · Esc orqaga · harf yozing — qidiradi")}`,
        "",
      ];
      for (let i = top; i < Math.min(list.length, top + page); i++) {
        const it = list[i];
        const on = i === idx;
        const hint = it.hint ? "  " + c.dim(it.hint) : "";
        lines.push(`  ${on ? c.accent("❯") : " "} ${on ? c.bold(c.white(it.label)) : c.gray(it.label)}${hint}`);
      }
      if (!list.length) lines.push("    " + c.dim("Hech narsa topilmadi — Backspace bilan qidiruvni qisqartiring"));
      if (list.length > page) lines.push(`  ${c.dim(`  ${top + 1}–${Math.min(list.length, top + page)} / ${list.length}`)}`);

      if (drawn) out.write(`\x1b[${drawn}A\x1b[0J`);
      out.write(lines.join("\n") + "\n");
      drawn = lines.length;
    };

    const finish = (value) => {
      input.off("keypress", onKey);
      input.setRawMode(wasRaw);
      for (const l of saved) input.on("keypress", l);
      if (drawn) out.write(`\x1b[${drawn}A\x1b[0J`);
      out.write("\x1b[?25h");
      resolve(value);
    };

    function onKey(str, key = {}) {
      const list = visible();
      if (key.ctrl && key.name === "c") return finish(null);
      switch (key.name) {
        case "up":
          idx = idx > 0 ? idx - 1 : list.length - 1;
          break;
        case "down":
          idx = idx < list.length - 1 ? idx + 1 : 0;
          break;
        case "pageup":
          idx = Math.max(0, idx - page);
          break;
        case "pagedown":
          idx = Math.min(list.length - 1, idx + page);
          break;
        case "home":
          idx = 0;
          break;
        case "end":
          idx = list.length - 1;
          break;
        case "return":
        case "enter":
          return finish(list[idx] ?? null);
        case "escape":
          return finish(null);
        case "backspace":
          query = query.slice(0, -1);
          idx = 0;
          top = 0;
          break;
        default:
          if (str && str.length === 1 && str >= " " && !key.ctrl && !key.meta) {
            query += str;
            idx = 0;
            top = 0;
          } else {
            return;
          }
      }
      draw();
    }

    out.write("\x1b[?25l");
    input.on("keypress", onKey);
    draw();
  });
}
