/**
 * Token hisobini bazaga yozish bo'laklari. `record_token_usage` (0036 `_record_token_usage`) bitta
 * chaqiruvda ko'pi bilan 100 000 tokenni yozadi (kirish+chiqish) — kattaroq so'rov (uzun tarix,
 * rasmlar, bir necha zaxira chaqiruvi) oldin 100k deb hisoblanib, oylik limit va byudjet himoyasi
 * haqiqiy sarfni ko'rmasdi. Endi sarf ≤100k bo'laklarga bo'linib, har biri alohida yoziladi.
 */
export const USAGE_RECORD_MAX = 100_000;
/** Bitta so'rov uchun bo'laklar chegarasi (bazani spam qilmaslik uchun; 40 × 100k = 4M token). */
export const USAGE_MAX_CHUNKS = 40;

export interface UsageChunk {
  input: number;
  output: number;
}

/** Sarfni har biri `max` dan oshmaydigan bo'laklarga bo'ladi (avval kirish, keyin chiqish). */
export function splitUsage(
  u: UsageChunk,
  max: number = USAGE_RECORD_MAX,
  maxChunks: number = USAGE_MAX_CHUNKS,
): UsageChunk[] {
  let inRem = Math.max(0, Math.round(u.input) || 0);
  let outRem = Math.max(0, Math.round(u.output) || 0);
  const out: UsageChunk[] = [];
  while (inRem + outRem > 0 && out.length < maxChunks) {
    const input = Math.min(inRem, max);
    const output = Math.min(outRem, max - input);
    out.push({ input, output });
    inRem -= input;
    outRem -= output;
  }
  return out;
}

/** Bo'laklarga sig'adigan umumiy sarf (javob belgisidagi "hisobga yozilgan token" uchun). */
export function billableTotal(u: UsageChunk, max: number = USAGE_RECORD_MAX, maxChunks: number = USAGE_MAX_CHUNKS): number {
  return splitUsage(u, max, maxChunks).reduce((n, c) => n + c.input + c.output, 0);
}
