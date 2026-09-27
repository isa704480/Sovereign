// WAI-ARIA tablist klaviaturasi (roving tabindex): faqat tanlangan tab Tab bilan fokuslanadi,
// ←/→ (vertikal ro'yxatda ↑/↓), Home/End — tabni tanlaydi va fokusni unga o'tkazadi.

/**
 * @param {KeyboardEvent} e
 * @param {string[]} keys      tablar kalitlari (ekrandagi tartibda)
 * @param {string} current     tanlangan kalit
 * @param {(k: string) => void} select
 * @param {{ vertical?: boolean, idOf: (k: string) => string }} opts  idOf — tab tugmasining DOM id'si
 */
export function tabKeyDown(e, keys, current, select, { vertical = false, idOf }) {
  const prev = vertical ? "ArrowUp" : "ArrowLeft";
  const next = vertical ? "ArrowDown" : "ArrowRight";
  const i = Math.max(0, keys.indexOf(current));
  let j = null;
  if (e.key === next) j = (i + 1) % keys.length;
  else if (e.key === prev) j = (i - 1 + keys.length) % keys.length;
  else if (e.key === "Home") j = 0;
  else if (e.key === "End") j = keys.length - 1;
  if (j == null) return;
  e.preventDefault();
  select(keys[j]);
  document.getElementById(idOf(keys[j]))?.focus();
}
