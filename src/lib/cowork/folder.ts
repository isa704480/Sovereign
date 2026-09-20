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
}
interface FileHandle {
  name: string;
  kind: "file";
  getFile: () => Promise<File>;
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
  return { name: dir.name, files, snapshot: false };
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
  return { name: rootName, files, snapshot: true };
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
