// Mahalliy (Ollama) rejim holati — renderer uchun yagona manba (badge, ModelPicker, Sozlamalar).
// Main sessiya bo'yicha saqlaydi (yangi vazifada ham); reducer'dagi `agent.local` esa vazifa bilan
// tozalanadi. Shu sabab: boshlang'ich qiymat — `app:state().local`, yangilanish — "local" hodisasi
// va local:use / app:set-model javoblari. Barcha qiymatlar qayta tozalanadi (main'ga ham ishonmaymiz).
import { useEffect, useState } from "react";
import { plainText } from "./agent.js";

const S = () => (typeof window !== "undefined" ? window.sovereign : null);

let current = null;
let loaded = false;
let started = false;
const subs = new Set();

/** Main'dan kelgan mahalliy holat → xavfsiz obyekt yoki null. */
export function normalizeLocal(x) {
  if (!x || typeof x !== "object" || x.active === false) return null;
  const model = plainText(x.model, 120);
  if (!model) return null;
  const ctx = Number(x.contextLength);
  return {
    model,
    tools: x.tools === true,
    vision: x.vision === true,
    contextLength: Number.isFinite(ctx) && ctx > 0 ? Math.floor(ctx) : 0,
    reason: x.reason === "fallback" ? "fallback" : "manual",
    fullAutoPaused: x.fullAutoPaused === true,
  };
}

function set(v) {
  loaded = true;
  const next = normalizeLocal(v);
  // "local" hodisasida kontekst uzunligi yo'q — o'sha model uchun avvalgisi saqlanadi.
  if (next && current && next.model === current.model && !next.contextLength) next.contextLength = current.contextLength;
  const same = next === current || (next && current && JSON.stringify(next) === JSON.stringify(current));
  current = next;
  if (!same) subs.forEach((f) => f(current));
}

/** Holatni main'dan qayta o'qish (app:state). */
export function refreshLocal() {
  const s = S();
  if (!s?.state) return Promise.resolve(current);
  return s.state().then((st) => { set(st?.local ?? null); return current; }).catch(() => current);
}

/** local:use / app:set-model javobidan darhol yangilash. */
export function setLocalMode(v) {
  set(v);
}

function start() {
  if (started) return;
  const s = S();
  if (!s) return;
  started = true;
  s.onEvent?.((ev) => {
    if (ev?.type === "local") set(ev);
  });
  refreshLocal();
}

/** Joriy mahalliy rejim: null | {model, tools, vision, contextLength, reason, fullAutoPaused}. */
export function useLocalMode() {
  const [v, setV] = useState(current);
  useEffect(() => {
    subs.add(setV);
    start();
    if (loaded) setV(current);
    return () => { subs.delete(setV); };
  }, []);
  return v;
}

/** Bayt → GB matni ("4.7" / "12"). */
export const gbText = (bytes) => {
  const n = Number(bytes);
  return n > 0 ? (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1) : "";
};
