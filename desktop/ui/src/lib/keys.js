// Klaviatura belgilarini platformaga moslash: macOS'da "Ctrl" o'rniga ⌘ (Command), "Shift" o'rniga ⇧.
// Tugmalar ishlovchisi (App.jsx) ctrlKey || metaKey ni qabul qiladi — belgilar ham shunga mos.

let mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");

/** main'dan kelgan process.platform ("darwin" | "win32" | "linux") — navigator'dan ishonchliroq. */
export function setPlatform(p) {
  if (typeof p === "string" && p) mac = p === "darwin";
}

export const isMac = () => mac;

/** "Ctrl K" / "Ctrl+K" → macOS'da "⌘K"; "Shift Enter" → "⇧Enter". Boshqa platformalarda — o'zgarishsiz. */
export function kbd(s) {
  if (!mac || s == null) return s;
  return String(s).replace(/\bCtrl(?:\+| )/g, "⌘").replace(/\bShift(?:\+| )/g, "⇧");
}
