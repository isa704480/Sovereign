"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  canWriteFolder,
  ensureWritePermission,
  folderFromInput,
  folderOutline,
  pickFolder,
  readFileText,
  supportsFolderPicker,
  writeFileToFolder,
  WRITE_PROTOCOL,
  type CoworkFolder,
} from "@/lib/cowork/folder";
import { translate } from "@/lib/i18n";
import { useChat, useLang } from "@/store/chat";

/** Yangi papka yaratish natijasi (UI tarjima qilingan xabarni shu koddan tanlaydi). */
export type CreateFolderResult = "ok" | "cancelled" | "unsupported" | "invalid" | "exists" | "denied" | "error";

interface CoworkValue {
  /** Faol Cowork papkasi (Cowork rejimi o'chiq bo'lsa null). */
  folder: CoworkFolder | null;
  /** Cowork rejimi yoqilganmi (papka bilan yoki "papkasiz"). */
  active: boolean;
  /** Foydalanuvchi shu sessiyada "Papkasiz davom etish" ni tanlagan. */
  noFolder: boolean;
  /** Sessiyada oldin ulangan (hozir o'chirilgan rejimdagi) papka nomi — qayta ulash uchun. */
  rememberedName: string | null;
  /** Send the file list to the model so it knows what exists. */
  shareOutline: boolean;
  setShareOutline: (on: boolean) => void;
  supported: boolean;
  /** AI shu papkaga fayl yoza oladimi (Chromium handle mavjud). */
  canWrite: boolean;
  open: () => Promise<void>;
  openFromInput: (list: FileList) => void;
  /** Yangi papka yaratadi: ota papkani tanlatadi va ichida `name` papkasini ochadi. */
  createFolder: (name: string) => Promise<CreateFolderResult>;
  /**
   * Cowork rejimini yoqadi. Papka (yoki "papkasiz" tanlovi) sessiyada bor bo'lsa — qayta
   * so'ramasdan yoqadi va true qaytaradi; aks holda false (chaqiruvchi panelni ochadi).
   */
  activate: () => boolean;
  /** Chat rejimiga qaytish — papka / "papkasiz" tanlovi xotirada qoladi (keyingi safar qayta so'ralmaydi). */
  deactivate: () => void;
  /** "Papkasiz davom etish": Cowork yoqiladi, fayllar diskka yozilmaydi. */
  continueWithoutFolder: () => void;
  /** Papkani butunlay uzadi (qayta ulash uchun yana tanlash kerak). */
  clear: () => void;
  /** Faylning joriy mazmunini o'qiydi (diff uchun). */
  readText: (path: string) => Promise<string>;
  /** AI taklif qilgan faylni saqlaydi (kerak bo'lsa ruxsat so'raydi). */
  applyWrite: (path: string, content: string) => Promise<void>;
}

const CoworkContext = createContext<CoworkValue>({
  folder: null,
  active: false,
  noFolder: false,
  rememberedName: null,
  shareOutline: true,
  setShareOutline: () => {},
  supported: false,
  canWrite: false,
  open: async () => {},
  openFromInput: () => {},
  createFolder: async () => "unsupported",
  activate: () => false,
  deactivate: () => {},
  continueWithoutFolder: () => {},
  clear: () => {},
  readText: async () => "",
  applyWrite: async () => {},
});

/** Sessiya davomida (tab yopilguncha) "papkasiz" tanlovi eslab qolinadi. */
const MODE_KEY = "sov-cowork-mode";

function readMode(): "none" | null {
  try {
    return sessionStorage.getItem(MODE_KEY) === "none" ? "none" : null;
  } catch {
    return null;
  }
}

/** Xotiradagi nusxa — sessionStorage bloklangan bo'lsa ham tanlov shu sahifada ishlaydi. */
let memMode: "none" | null = null;
const modeListeners = new Set<() => void>();

function subscribeMode(cb: () => void) {
  modeListeners.add(cb);
  return () => {
    modeListeners.delete(cb);
  };
}

function writeMode(v: "none" | null) {
  memMode = v;
  try {
    if (v) sessionStorage.setItem(MODE_KEY, v);
    else sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* private rejim — faqat xotirada */
  }
  modeListeners.forEach((l) => l());
}

const getNoFolder = () => memMode === "none" || readMode() === "none";
const getServerNoFolder = () => false;

/** Windows/macOS/Linux'da ruxsat etilmagan papka nomlari. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function isValidFolderName(raw: string): boolean {
  const name = raw.trim();
  if (!name || name.length > 100) return false;
  if (name === "." || name === "..") return false;
  // Boshqaruv belgilari (U+0000–U+001F) ham taqiqlanadi.
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  return !RESERVED.test(name);
}

type RawDirHandle = {
  name: string;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<RawDirHandle>;
  queryPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
};

export function CoworkProvider({ children }: { children: React.ReactNode }) {
  // Tanlangan papka sessiya davomida xotirada qoladi — yangi suhbatda qayta so'ralmaydi.
  const [saved, setSaved] = useState<CoworkFolder | null>(null);
  // "Papkasiz" tanlovi — sessionStorage'da (sahifa yangilansa ham shu tab sessiyasida saqlanadi).
  const noFolder = useSyncExternalStore(subscribeMode, getNoFolder, getServerNoFolder);
  // null — foydalanuvchi hali almashtirmagan: "papkasiz" tanlangan bo'lsa Cowork yoqiq boshlanadi.
  const [activeChoice, setActive] = useState<boolean | null>(null);
  const active = activeChoice ?? noFolder;
  const [shareOutline, setShareOutline] = useState(true);
  const setCoworkOutline = useChat((s) => s.setCoworkOutline);
  const lang = useLang();

  const folder = active ? saved : null;
  const canWrite = canWriteFolder(folder);

  // The outline travels with each chat request, so the model knows what exists.
  // Yozish mumkin bo'lsa — yozish protokolini ham qo'shamiz (AI fayl yozib bersin).
  useEffect(() => {
    if (!folder || !shareOutline) {
      setCoworkOutline(null);
      return;
    }
    setCoworkOutline(folderOutline(folder) + (canWrite ? "\n" + WRITE_PROTOCOL : ""));
  }, [folder, shareOutline, canWrite, setCoworkOutline]);

  const attachFolder = useCallback((picked: CoworkFolder) => {
    setSaved(picked);
    setActive(true);
    writeMode(null);
  }, []);

  const open = useCallback(async () => {
    const picked = await pickFolder();
    if (picked) attachFolder(picked);
  }, [attachFolder]);

  const openFromInput = useCallback(
    (list: FileList) => {
      const picked = folderFromInput(list);
      if (picked) attachFolder(picked);
    },
    [attachFolder],
  );

  const createFolder = useCallback(
    async (rawName: string): Promise<CreateFolderResult> => {
      const name = rawName.trim();
      if (!isValidFolderName(name)) return "invalid";
      const picker = (window as unknown as { showDirectoryPicker?: (o?: { mode?: "readwrite" }) => Promise<RawDirHandle> })
        .showDirectoryPicker;
      if (!picker) return "unsupported";
      let parent: RawDirHandle;
      try {
        parent = await picker({ mode: "readwrite" });
      } catch (err) {
        return err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "denied";
      }
      try {
        if (parent.queryPermission && (await parent.queryPermission({ mode: "readwrite" })) !== "granted") {
          const r = await parent.requestPermission?.({ mode: "readwrite" });
          if (r !== "granted") return "denied";
        }
        // Mavjud papkani "yangi" deb ochib yubormaymiz — uni "Papka tanlash" bilan ochish kerak.
        const exists = await parent.getDirectoryHandle(name).then(
          () => true,
          () => false,
        );
        if (exists) return "exists";
        const dir = await parent.getDirectoryHandle(name, { create: true });
        attachFolder({
          name: dir.name,
          files: [],
          snapshot: false,
          handle: dir as unknown as NonNullable<CoworkFolder["handle"]>,
          canWrite: true,
        });
        return "ok";
      } catch (err) {
        if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) return "denied";
        return "error";
      }
    },
    [attachFolder],
  );

  const activate = useCallback(() => {
    if (saved || noFolder) {
      setActive(true);
      return true;
    }
    return false;
  }, [saved, noFolder]);

  // Tanlov (papka yoki "papkasiz") eslab qolinadi — Cowork'ga qaytganda qayta so'ralmaydi.
  const deactivate = useCallback(() => setActive(false), []);

  const continueWithoutFolder = useCallback(() => {
    setActive(true);
    writeMode("none");
  }, []);

  const clear = useCallback(() => {
    setSaved(null);
    setActive(false);
    writeMode(null);
  }, []);

  const readText = useCallback(async (path: string) => (folder ? readFileText(folder, path) : ""), [folder]);

  const applyWrite = useCallback(
    async (path: string, content: string) => {
      if (!folder) throw new Error(translate(lang, "pnCwNoFolder"));
      const ok = await ensureWritePermission(folder).catch(() => false);
      if (!ok) throw new Error(translate(lang, "pnCwNoWritePerm"));
      try {
        await writeFileToFolder(folder, path, content);
      } catch (err) {
        // Brauzerning xom DOMException matni (inglizcha / brauzer tilida) o'rniga tarjima.
        if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
          throw new Error(translate(lang, "pnCwNoWritePerm"));
        }
        throw new Error(translate(lang, "p8bCwWriteFailed").replace("{path}", path));
      }
      // Yangi fayl bo'lsa ro'yxatga qo'shamiz (outline yangilansin).
      if (!folder.files.some((f) => f.path === path)) {
        setSaved({ ...folder, files: [...folder.files, { path, name: path.split("/").pop() ?? path, size: content.length, getFile: async () => new File([content], path) }].sort((a, b) => a.path.localeCompare(b.path)) });
      }
    },
    [folder, lang],
  );

  const value = useMemo<CoworkValue>(
    () => ({
      folder,
      active,
      noFolder,
      rememberedName: !active && saved ? saved.name : null,
      shareOutline,
      setShareOutline,
      supported: supportsFolderPicker(),
      canWrite,
      open,
      openFromInput,
      createFolder,
      activate,
      deactivate,
      continueWithoutFolder,
      clear,
      readText,
      applyWrite,
    }),
    [folder, active, noFolder, saved, shareOutline, canWrite, open, openFromInput, createFolder, activate, deactivate, continueWithoutFolder, clear, readText, applyWrite],
  );

  return <CoworkContext.Provider value={value}>{children}</CoworkContext.Provider>;
}

export function useCowork() {
  return useContext(CoworkContext);
}
