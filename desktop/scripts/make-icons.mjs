// SOVEREIGN logotipidan (public/logo.svg geometriyasi) ilova ikonlarini yaratadi:
//   desktop/build/icon.png (1024), icon.ico (16–256), installer uchun ham shu .ico.
// Ishlatish: npm run icons   (sharp repo ildizidagi node_modules'dan olinadi — faqat dev vositasi)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "build");
const require = createRequire(join(here, "..", "..", "package.json"));
const sharp = require("sharp");

/** Ikonka SVG: to'q ko'k plitka + logotip. Kichik o'lchamlarda chiziqlar qalinroq. */
function iconSvg(size) {
  const small = size <= 32;
  const stroke = small ? 2.6 : size <= 64 ? 2.2 : 1.9;
  const pad = small ? 0 : size * 0.06; // katta ikonkada soya uchun joy
  const r = small ? size * 0.2 : size * 0.22;
  const inner = size - pad * 2;
  const k = (inner * (small ? 0.84 : 0.66)) / 32; // logotip masshtabi (viewBox 32)
  const off = pad + (inner - 32 * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141840"/><stop offset="1" stop-color="#060812"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#5B50F0" stop-opacity="0.45"/><stop offset="1" stop-color="#5B50F0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shell" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A79CFF"/><stop offset="1" stop-color="#6A5FF5"/>
    </linearGradient>
    <linearGradient id="core" x1="10" y1="9" x2="22" y2="23" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7B6FF2"/><stop offset="1" stop-color="#4A40C8"/>
    </linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="url(#bg)"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="url(#glow)"/>
  ${small ? "" : `<rect x="${pad + 0.5}" y="${pad + 0.5}" width="${inner - 1}" height="${inner - 1}" rx="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="${Math.max(1, size / 256)}"/>`}
  <g transform="translate(${off} ${off}) scale(${k})">
    <path d="M16 2.5 L27.6 9.25 L27.6 22.75 L16 29.5 L4.4 22.75 L4.4 9.25 Z" fill="none" stroke="url(#shell)" stroke-width="${stroke}" stroke-linejoin="round"/>
    <path d="M16 9 L21.9 12.5 L21.9 19.5 L16 23 L10.1 19.5 L10.1 12.5 Z" fill="url(#core)"/>
    <circle cx="16" cy="16" r="${small ? 2 : 1.6}" fill="#F5F3FF"/>
  </g>
</svg>`;
}

const png = (size) => sharp(Buffer.from(iconSvg(size))).png().toBuffer();
const raw = (size) => sharp(Buffer.from(iconSvg(size))).ensureAlpha().raw().toBuffer();

/** 32-bit BMP (DIB) ICO yozuvi — NSIS/rcedit PNG-siqilgan kichik ikonkalarni har doim ham qabul qilmaydi. */
function dib(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = ((size - 1 - y) * size + x) * 4; // pastdan yuqoriga
      const d = (y * size + x) * 4;
      pixels[d] = rgba[s + 2];
      pixels[d + 1] = rgba[s + 1];
      pixels[d + 2] = rgba[s];
      pixels[d + 3] = rgba[s + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size); // alfa kanal ishlatiladi — AND niqob bo'sh
  return Buffer.concat([header, pixels, mask]);
}

async function ico(sizes) {
  const images = [];
  for (const s of sizes) images.push(s >= 256 ? await png(s) : dib(await raw(s), s));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o);
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(images[i].length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, dir, ...images]);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon.png"), await png(1024));
writeFileSync(join(out, "icon-256.png"), await png(256));
writeFileSync(join(out, "icon.ico"), await ico([16, 20, 24, 32, 40, 48, 64, 128, 256]));
console.log("ikonlar yaratildi:", out);
