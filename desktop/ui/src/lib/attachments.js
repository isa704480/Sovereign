// Chat biriktirmalari — renderer tomoni: chegaralar, rasmni kichraytirish (canvas), yuborish yuki.
// Diskdan o'qish va yakuniy tekshiruv — main jarayonda (electron/attachments.mjs).

/**
 * electron/attachments.mjs LIMITS nusxasi (renderer Node modullarini import qila olmaydi).
 * scripts/test-attachments.mjs ikkalasi bir xilligini tekshiradi.
 */
export const ATTACH_LIMITS = Object.freeze({
  maxAttachments: 10,
  imageDataUrlChars: 800_000,
  thumbChars: 48_000,
  totalChars: 1_000_000,
});

/** Kichraytirish sozlamalari: uzun tomon ≤ 2000 px, bitta rasm ~280k belgi (≈ 200 KB) atrofida. */
export const IMAGE_MAX_DIM = 2000;
export const IMAGE_TARGET_CHARS = 280_000;
export const THUMB_DIM = 160;

const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

/** Rasm MIME'i (clipboard/drop qilingan File.type) qo'llab-quvvatlanadimi. */
export const isImageMime = (t) => IMAGE_MIME_RE.test(String(t ?? ""));

/** Biriktirmaning serverga ketadigan hajmi (belgi): rasm — data URL, fayl — ajratilgan matn. */
export function attachmentChars(a) {
  if (a?.kind === "image") return typeof a.dataUrl === "string" ? a.dataUrl.length : 0;
  return Number(a?.chars) || 0;
}

export const totalChars = (list) => (list ?? []).reduce((s, a) => s + attachmentChars(a), 0);

/** Yana `adding` ta qo'shish mumkinmi: null yoki xato kodi ("too-many"). */
export function checkAdd(list, adding) {
  return (list?.length ?? 0) + adding > ATTACH_LIMITS.maxAttachments ? "too-many" : null;
}

/** Yuborishdan oldin: null yoki xato kodi ("too-many" | "too-large-total" | "processing"). */
export function checkSend(list) {
  const l = list ?? [];
  if (l.some((a) => a.status === "processing")) return "processing";
  if (l.length > ATTACH_LIMITS.maxAttachments) return "too-many";
  if (totalChars(l) > ATTACH_LIMITS.totalChars) return "too-large-total";
  return null;
}

/** Main'ga ketadigan yuk: fayl — faqat id (tarkibi main'da), rasm — kichraytirilgan data URL. */
export function toSendPayload(list) {
  return (list ?? [])
    .filter((a) => a.status !== "processing" && a.status !== "error")
    .map((a) => (a.kind === "image" ? { kind: "image", name: a.name, dataUrl: a.dataUrl, ...(a.thumb ? { thumb: a.thumb } : {}) } : { kind: "file", id: a.id }));
}

/** Xato kodi (main yoki renderer) → i18n kaliti. */
export function attachErrKey(code) {
  const known = ["unsupported", "too-large", "protected", "not-found", "not-file", "binary", "bad-image", "bad-pdf", "pdf-unavailable", "pdf-empty", "empty", "unc", "too-many", "too-large-total", "expired", "processing"];
  return `attach.err.${known.includes(code) ? code : "io"}`;
}

/** Bayt → {key, n} (i18n: attach.bytes / attach.kb / attach.mb). */
export function sizeParts(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024) return { key: "attach.bytes", n: String(Math.round(b)) };
  if (b < 1024 * 1024) return { key: "attach.kb", n: String(Math.round(b / 1024)) };
  return { key: "attach.mb", n: (b / 1024 / 1024).toFixed(1) };
}

export const formatSize = (bytes, t) => {
  const p = sizeParts(bytes);
  return t(p.key, { n: p.n });
};

// ---- Rasmni kichraytirish (faqat brauzer/renderer) ---------------------------------

/** data URL → Blob (fetch("data:...") CSP connect-src'da taqiqlangan). */
export function dataUrlToBlob(url) {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m) throw new Error("bad data url");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function draw(bmp, w, h, opaque) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (opaque) {
    // JPEG shaffoflikni qo'llamaydi — shaffof joylar qora bo'lib qolmasin.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  return c;
}

/**
 * Rasmni yuborishga tayyorlaydi: uzun tomon ≤ IMAGE_MAX_DIM, data URL ≈ IMAGE_TARGET_CHARS gacha
 * (avval sifat, keyin o'lcham kamaytiriladi). Kichik PNG/JPEG (skrinshot) — o'zgarishsiz qoladi.
 * GIF/WEBP/BMP — har doim PNG/JPEG'ga (barcha provayderlar va mahalliy modellar uchun mos).
 * @param {Blob} blob
 * @returns {Promise<{dataUrl: string, thumb: string, width: number, height: number}>}
 */
export async function prepareImage(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    const w0 = bmp.width;
    const h0 = bmp.height;
    if (!w0 || !h0) throw new Error("empty image");
    const tScale = Math.min(1, THUMB_DIM / Math.max(w0, h0));
    const thumb = draw(bmp, Math.max(1, Math.round(w0 * tScale)), Math.max(1, Math.round(h0 * tScale)), true).toDataURL("image/jpeg", 0.72);
    let scale = Math.min(1, IMAGE_MAX_DIM / Math.max(w0, h0));
    const type = String(blob.type).toLowerCase();
    if (scale === 1 && (type === "image/png" || type === "image/jpeg") && blob.size * 1.34 + 32 <= IMAGE_TARGET_CHARS) {
      const orig = await blobToDataUrl(blob);
      if (orig.length <= IMAGE_TARGET_CHARS && orig.startsWith(`data:${type};base64,`)) return { dataUrl: orig, thumb, width: w0, height: h0 };
    }
    let best = "";
    for (let round = 0; round < 8; round++) {
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      // Skrinshotlar (PNG) — avval PNG (matn aniq qoladi), sig'masa JPEG.
      if (type === "image/png" && round === 0) {
        const png = draw(bmp, w, h, false).toDataURL("image/png");
        if (png.length <= IMAGE_TARGET_CHARS) return { dataUrl: png, thumb, width: w, height: h };
      }
      const canvas = draw(bmp, w, h, true);
      for (const q of [0.86, 0.76, 0.66]) {
        best = canvas.toDataURL("image/jpeg", q);
        if (best.length <= IMAGE_TARGET_CHARS) return { dataUrl: best, thumb, width: w, height: h };
      }
      scale *= 0.78;
    }
    return { dataUrl: best, thumb, width: Math.round(w0 * scale), height: Math.round(h0 * scale) };
  } finally {
    bmp.close?.();
  }
}
