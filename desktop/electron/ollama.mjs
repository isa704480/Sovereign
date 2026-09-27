// Mahalliy model (Ollama) — Cowork main jarayoni uchun (docs/INQUIRY.md §B.1).
//
// Asosiy API (detect / capabilities / chat / recommend / classifyServerError) CLI bilan
// BIR XIL — aynan `cli/src/ollama.mjs` qayta eksport qilinadi (dev'da ../../cli/src,
// o'rnatilgan ilovada resources/cli/src — main.mjs'dagi "../cli/src" bilan bir joy).
// Shu sababli xavfsizlik qoidalari bitta faylda:
//  - faqat http://127.0.0.1:11434 (sozlanmaydi), `redirect: "error"`, Authorization yo'q;
//  - faqat /api/version, /api/tags, /api/show, /v1/chat/completions — pull/delete/create/push HECH QACHON;
//  - model nomi MODEL_NAME_RE + ".." yo'q; javob hajmi cheklangan.
// Chaqiruvlar faqat main jarayondan (Node fetch) — renderer CSP o'zgarmaydi, OLLAMA_ORIGINS kerak emas.
//
// Bu yerda faqat desktop'ga xos yordamchilar: RAM, tavsiya (tilsiz — matnni renderer tarjima qiladi),
// model spetsifikatsiyasi (imkoniyatlar bilan) va standart model tanlovi.

import { totalmem } from "node:os";
import { detect, capabilities, recommend, isValidModelName } from "../../cli/src/ollama.mjs";

export {
  OLLAMA_BASE,
  MODEL_NAME_RE,
  isValidModelName,
  RECOMMEND_TIERS,
  fitToContext,
  detect,
  capabilities,
  chat,
  recommend,
  classifyServerError,
} from "../../cli/src/ollama.mjs";

/** Kompyuterning umumiy RAM hajmi (GB, 1 kasr). */
export function ramGb() {
  const b = Number(totalmem());
  return Number.isFinite(b) && b > 0 ? Math.round((b / 1024 ** 3) * 10) / 10 : 0;
}

/**
 * RAM bo'yicha tavsiya — matnsiz (CLI'dagi o'zbekcha `why/quality` renderer'ga yuborilmaydi;
 * UI `tier` bo'yicha 4 tilda izoh ko'rsatadi). VRAM Electron'dan ishonchli olinmaydi → 0.
 * @returns {{name: string, tier: number, sizeGb: string}[]}
 */
export function recommendations(ram = ramGb()) {
  return recommend(ram, 0).map(({ name, tier, sizeGb }) => ({ name, tier, sizeGb }));
}

/** OLLAMA_CONTEXT_LENGTH (Cowork muhitida berilgan bo'lsa) — tarixni shu oynaga sig'dirish uchun. */
export function envContextLength() {
  const n = Number(process.env.OLLAMA_CONTEXT_LENGTH);
  return Number.isFinite(n) && n >= 1024 ? Math.floor(n) : 0;
}

/** Renderer'ga yuboriladigan model yozuvi (faqat tekshirilgan maydonlar). */
function publicModel(m, caps) {
  const out = { name: m.name, size: m.size, paramSize: m.paramSize, quant: m.quant, family: m.family };
  if (caps) Object.assign(out, { tools: caps.known ? caps.tools : false, vision: caps.known ? caps.vision : false, contextLength: caps.contextLength, known: caps.known });
  return out;
}

/**
 * O'rnatilgan modellar. withCaps — har biri uchun `/api/show` (tools/vision/kontekst).
 * @returns {Promise<{available: boolean, version: string|null, models: object[]}>}
 */
export async function listModels({ withCaps = false, timeoutMs = 800, max = 40 } = {}) {
  const st = await detect(timeoutMs);
  const models = st.models.slice(0, max);
  if (!withCaps) return { available: st.available, version: st.version, models: models.map((m) => publicModel(m)) };
  const caps = await Promise.all(models.map((m) => capabilities(m.name, 2500)));
  return { available: st.available, version: st.version, models: models.map((m, i) => publicModel(m, caps[i])) };
}

/**
 * Tanlangan model uchun ish vaqti spetsifikatsiyasi.
 * Kod rejimi (vositalar) FAQAT `/api/show` tools === true bo'lsa — ma'lumot olinmasa ham vositasiz (§B.1).
 * @returns {Promise<{model: string, tools: boolean, vision: boolean, contextLength: number, maxContext: number, known: boolean} | null>}
 */
export async function modelSpec(model) {
  if (!isValidModelName(model)) return null;
  const caps = await capabilities(model, 2500);
  return {
    model,
    tools: caps.known ? caps.tools : false,
    vision: caps.known ? caps.vision : false,
    // Ollama oshiqcha kontekstni jim kesadi: Modelfile num_ctx → OLLAMA_CONTEXT_LENGTH → kesilmaydi.
    contextLength: caps.numCtx || envContextLength(),
    maxContext: caps.contextLength,
    known: caps.known,
  };
}

/**
 * Standart mahalliy model: sozlamadagi (o'rnatilgan bo'lsa) → tavsiya etilganlardan o'rnatilgani →
 * vositalarni qo'llaydigan birinchisi → birinchi o'rnatilgan. Hech biri yo'q — "".
 * @param {{name: string, tools?: boolean}[]} models
 */
export function pickDefault(models, preferred = "", rec = recommendations()) {
  const names = new Set(models.map((m) => m.name));
  if (preferred && names.has(preferred)) return preferred;
  for (const r of rec) if (names.has(r.name)) return r.name;
  const withTools = models.find((m) => m.tools === true);
  if (withTools) return withTools.name;
  return models[0]?.name ?? "";
}
