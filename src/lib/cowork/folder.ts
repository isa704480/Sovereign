"use client";

/**
 * Cowork — the user grants a local folder and SOVEREIGN reads files from it
 * directly, so a screenshot or a source file never has to be uploaded by hand.
 *
 * Everything here runs in the browser. The folder is never uploaded: only the
 * files the user (or the model, on request) actually opens are sent, and the
 * browser itself enforces the permission the user granted.
 */

export interface CoworkFile {
  /** Path relative to the chosen folder, e.g. "src/app/page.tsx". */
  path: string;
  name: string;
  size: number;
  /** Reads the file lazily — nothing is held in memory until it is opened. */
  getFile: () => Promise<File>;
}

export interface CoworkFolder {
  name: string;
  files: CoworkFile[];
  /** True when the browser could only give us a one-time snapshot (no live re-read). */
  snapshot: boolean;
  /** Directory handle — kept so AI can WRITE files (Chromium only). Null for input fallback. */
  handle: DirHandle | null;
  /** Whether readwrite permission has been granted (AI can save files). */
  canWrite: boolean;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo", ".cache",
  "venv", ".venv", "__pycache__", ".idea", ".vscode", "coverage", "vendor",
]);

const MAX_FILES = 4000;
const MAX_DEPTH = 8;

/** The directory picker exists in Chromium browsers only. */
export function supportsFolderPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface DirHandle {
  name: string;
  kind: "directory";
  values: () => AsyncIterableIterator<DirHandle | FileHandle>;
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileHandle>;
  queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}
interface FileHandle {
  name: string;
  kind: "file";
  getFile: () => Promise<File>;
  createWritable?: (opts?: { keepExistingData?: boolean }) => Promise<WritableStream & { write: (data: string | BufferSource | Blob) => Promise<void>; close: () => Promise<void> }>;
}

async function walk(dir: DirHandle, prefix: string, out: CoworkFile[], depth: number): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(entry as DirHandle, path, out, depth + 1);
    } else {
      const handle = entry as FileHandle;
      // Size is read lazily too; a stat here would open every file in the tree.
      out.push({ path, name: handle.name, size: 0, getFile: () => handle.getFile() });
    }
  }
}

/** Opens the browser folder picker and indexes the tree. */
export async function pickFolder(): Promise<CoworkFolder | null> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirHandle> }).showDirectoryPicker;
  if (!picker) return null;
  let dir: DirHandle;
  try {
    dir = await picker();
  } catch {
    return null; // user cancelled
  }
  const files: CoworkFile[] = [];
  await walk(dir, "", files, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name: dir.name, files, snapshot: false, handle: dir, canWrite: false };
}

/** Fallback for browsers without the picker: <input type="file" webkitdirectory>. */
export function folderFromInput(list: FileList): CoworkFolder | null {
  const all = Array.from(list);
  if (!all.length) return null;
  const rootName = (all[0].webkitRelativePath || all[0].name).split("/")[0] || "papka";
  const files: CoworkFile[] = [];
  for (const file of all) {
    const rel = (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
    if (rel.split("/").some((part) => SKIP_DIRS.has(part) || part.startsWith("."))) continue;
    files.push({ path: rel, name: file.name, size: file.size, getFile: async () => file });
    if (files.length >= MAX_FILES) break;
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name: rootName, files, snapshot: true, handle: null, canWrite: false };
}

/* ------------------------------------------------------------------ */
/* Yozish — AI Cowork rejimida faylni saqlaydi (Chromium, readwrite).   */
/* ------------------------------------------------------------------ */

/** Yozish qo'llab-quvvatlanadimi — handle bor va createWritable mavjud. */
export function canWriteFolder(folder: CoworkFolder | null): boolean {
  return !!folder?.handle && typeof folder.handle.requestPermission === "function";
}

/** readwrite ruxsatini so'raydi (foydalanuvchi brauzerda tasdiqlaydi). */
export async function ensureWritePermission(folder: CoworkFolder): Promise<boolean> {
  const dir = folder.handle;
  if (!dir?.requestPermission || !dir.queryPermission) return false;
  const opts = { mode: "readwrite" as const };
  if ((await dir.queryPermission(opts)) === "granted") return true;
  return (await dir.requestPermission(opts)) === "granted";
}

/** Yo'l bo'yicha ichma-ich papkalarni ochib (yoki yaratib) fayl handle'sini oladi. */
async function fileHandleAt(dir: DirHandle, path: string, create: boolean): Promise<FileHandle | null> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  let cur = dir;
  for (const part of parts) {
    if (!cur.getDirectoryHandle) return null;
    cur = await cur.getDirectoryHandle(part, { create });
  }
  if (!cur.getFileHandle) return null;
  return cur.getFileHandle(fileName, { create });
}

/** Faylning joriy matnini o'qiydi (diff ko'rsatish uchun). Yo'q bo'lsa "". */
export async function readFileText(folder: CoworkFolder, path: string): Promise<string> {
  if (!folder.handle) {
    const existing = folder.files.find((f) => f.path === path);
    if (!existing) return "";
    try {
      return await (await existing.getFile()).text();
    } catch {
      return "";
    }
  }
  try {
    const fh = await fileHandleAt(folder.handle, path, false);
    if (!fh) return "";
    return await (await fh.getFile()).text();
  } catch {
    return ""; // fayl hali yo'q
  }
}

/** Faylga yozadi (kerak bo'lsa papkalarni yaratadi). Ruxsat oldindan olingan bo'lishi kerak. */
export async function writeFileToFolder(folder: CoworkFolder, path: string, content: string): Promise<void> {
  if (!folder.handle) throw new Error("Bu papkaga yozib bo'lmaydi (faqat o'qish rejimi).");
  const fh = await fileHandleAt(folder.handle, path, true);
  if (!fh?.createWritable) throw new Error("Brauzer fayl yozishni qo'llamaydi.");
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

/**
 * Yozish protokoli — Cowork papkasi yozish rejimida modelga qo'shiladigan yo'riqnoma.
 * Model faylni shu blok bilan beradi; klient uni diff + "Qo'llash" bilan ko'rsatadi.
 */
export const WRITE_PROTOCOL = [
  "",
  "COWORK YOZISH REJIMI: foydalanuvchi fayl yaratish/o'zgartirishni so'rasa, faylni AYNAN shu formatda ber",
  "(oddiy ```kod``` emas — shunda foydalanuvchi bir tugma bilan saqlaydi):",
  "```sovereign-write",
  "path=src/app/example.tsx",
  "<faylning to'liq yangi mazmuni>",
  "```",
  "Qoidalar: har fayl uchun ALOHIDA blok; birinchi qator doim `path=<papkaga nisbatan yo'l>`;",
  "faylning TO'LIQ mazmunini ber (qisman emas); yo'l papka ichida bo'lsin. Qisqa izohni blokdan tashqarida yoz.",
].join("\n");

/** `sovereign-write` blok mazmunini {path, content} ga ajratadi. */
export function parseWriteBlock(raw: string): { path: string; content: string } | null {
  const nl = raw.indexOf("\n");
  const first = (nl === -1 ? raw : raw.slice(0, nl)).trim();
  const m = /^path\s*=\s*(.+)$/.exec(first);
  if (!m) return null;
  const path = m[1].trim().replace(/^["']|["']$/g, "").replace(/^\.?\//, "");
  if (!path || path.includes("..")) return null;
  const content = nl === -1 ? "" : raw.slice(nl + 1);
  return { path, content };
}

/** Simple subsequence match so "apg" finds "app/page.tsx". */
export function matchFiles(files: CoworkFile[], query: string, limit = 8): CoworkFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return files.slice(0, limit);
  const direct = files.filter((f) => f.path.toLowerCase().includes(q));
  if (direct.length >= limit) return direct.slice(0, limit);

  const fuzzy = files.filter((f) => {
    if (direct.includes(f)) return false;
    const p = f.path.toLowerCase();
    let i = 0;
    for (const ch of q) {
      i = p.indexOf(ch, i);
      if (i === -1) return false;
      i++;
    }
    return true;
  });
  return [...direct, ...fuzzy].slice(0, limit);
}

/** Compact tree the model gets so it knows what it may ask for. */
export function folderOutline(folder: CoworkFolder, maxChars = 4000): string {
  const lines = folder.files.map((f) => f.path);
  let text = lines.join("\n");
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars).replace(/\n[^\n]*$/, "")}\n… (${lines.length} ta fayl, ro'yxat qisqartirildi)`;
  }
  return `COWORK PAPKASI "${folder.name}" (foydalanuvchi kompyuteridagi fayllar):\n${text}\n\nKerakli faylni so'rasang, foydalanuvchi uni @ bilan biriktiradi.`;
}
