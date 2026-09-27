#!/usr/bin/env node
/**
 * media/icon.png (128×128) — Marketplace ikonkasi.
 *
 * Brend belgisi (src/components/brand/Logo.tsx, public/logo.svg) asosida: qorong'i
 * fon #060812 ustida indigo #5B50F0 olti burchak. Tashqi paket ishlatmaymiz —
 * oddiy rasterizator + `node:zlib` bilan PNG yoziladi (bog'liqliksiz, takrorlanadigan).
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 128;
const SS = 4; // supersampling — chetlari silliq bo'lishi uchun

const BG = [0x06, 0x08, 0x12];
const SHELL_TOP = [0x8b, 0x7d, 0xff];
const SHELL_BOTTOM = [0x5b, 0x50, 0xf0];
const CORE_TOP = [0x65, 0x58, 0xe8];
const CORE_BOTTOM = [0x42, 0x38, 0xb8];
const DOT = [0xf5, 0xf3, 0xff];

/** logo.svg dagi 32×32 koordinatalar → 128 px. */
const K = SIZE / 32;
const outer = [
  [16, 2.5],
  [27.6, 9.25],
  [27.6, 22.75],
  [16, 29.5],
  [4.4, 22.75],
  [4.4, 9.25],
].map(([x, y]) => [x * K, y * K]);
const inner = [
  [16, 9],
  [21.9, 12.5],
  [21.9, 19.5],
  [16, 23],
  [10.1, 19.5],
  [10.1, 12.5],
].map(([x, y]) => [x * K, y * K]);

const STROKE = 1.75 * K;

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const tRaw = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  const t = Math.max(0, Math.min(1, tRaw));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function distToPolygon(px, py, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return best;
}

/** Yuqoridan pastga chiziqli gradient. */
function gradient(top, bottom, y) {
  const k = Math.max(0, Math.min(1, y / SIZE));
  return [
    Math.round(top[0] + (bottom[0] - top[0]) * k),
    Math.round(top[1] + (bottom[1] - top[1]) * k),
    Math.round(top[2] + (bottom[2] - top[2]) * k),
  ];
}

function sample(px, py) {
  // Markaziy nuqta
  if (Math.hypot(px - SIZE / 2, py - SIZE / 2) <= 1.6 * K) return DOT;
  // Ichki olti burchak
  if (inPolygon(px, py, inner)) return gradient(CORE_TOP, CORE_BOTTOM, py);
  // Tashqi chiziq
  if (distToPolygon(px, py, outer) <= STROKE / 2) return gradient(SHELL_TOP, SHELL_BOTTOM, py);
  return BG;
}

const pixels = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 3;
    pixels[i] = Math.round(r / n);
    pixels[i + 1] = Math.round(g / n);
    pixels[i + 2] = Math.round(b / n);
  }
}

/* ── PNG (RGB, 8 bit, filtersiz) ── */
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0; // filter: None
  pixels.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(join(ROOT, "media"), { recursive: true });
writeFileSync(join(ROOT, "media", "icon.png"), png);
console.log(`media/icon.png — ${SIZE}×${SIZE}, ${png.length} bayt`);
