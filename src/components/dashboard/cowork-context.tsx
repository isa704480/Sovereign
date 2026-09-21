"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
import { useChat } from "@/store/chat";

interface CoworkValue {
  folder: CoworkFolder | null;
  /** Send the file list to the model so it knows what exists. */
  shareOutline: boolean;
  setShareOutline: (on: boolean) => void;
  supported: boolean;
  /** AI shu papkaga fayl yoza oladimi (Chromium handle mavjud). */
  canWrite: boolean;
  open: () => Promise<void>;
  openFromInput: (list: FileList) => void;
  clear: () => void;
  /** Faylning joriy mazmunini o'qiydi (diff uchun). */
  readText: (path: string) => Promise<string>;
  /** AI taklif qilgan faylni saqlaydi (kerak bo'lsa ruxsat so'raydi). */
  applyWrite: (path: string, content: string) => Promise<void>;
}

const CoworkContext = createContext<CoworkValue>({
  folder: null,
  shareOutline: true,
  setShareOutline: () => {},
  supported: false,
  canWrite: false,
  open: async () => {},
  openFromInput: () => {},
  clear: () => {},
  readText: async () => "",
  applyWrite: async () => {},
});

export function CoworkProvider({ children }: { children: React.ReactNode }) {
  const [folder, setFolder] = useState<CoworkFolder | null>(null);
  const [shareOutline, setShareOutline] = useState(true);
  const setCoworkOutline = useChat((s) => s.setCoworkOutline);

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

  const open = useCallback(async () => {
    const picked = await pickFolder();
    if (picked) setFolder(picked);
  }, []);

  const openFromInput = useCallback((list: FileList) => {
    const picked = folderFromInput(list);
    if (picked) setFolder(picked);
  }, []);

  const readText = useCallback(async (path: string) => (folder ? readFileText(folder, path) : ""), [folder]);

  const applyWrite = useCallback(
    async (path: string, content: string) => {
      if (!folder) throw new Error("Papka ulanmagan.");
      const ok = await ensureWritePermission(folder);
      if (!ok) throw new Error("Yozish ruxsati berilmadi.");
      await writeFileToFolder(folder, path, content);
      // Yangi fayl bo'lsa ro'yxatga qo'shamiz (outline yangilansin).
      if (!folder.files.some((f) => f.path === path)) {
        setFolder({ ...folder, files: [...folder.files, { path, name: path.split("/").pop() ?? path, size: content.length, getFile: async () => new File([content], path) }].sort((a, b) => a.path.localeCompare(b.path)) });
      }
    },
    [folder],
  );

  const value = useMemo<CoworkValue>(
    () => ({
      folder,
      shareOutline,
      setShareOutline,
      supported: supportsFolderPicker(),
      canWrite,
      open,
      openFromInput,
      clear: () => setFolder(null),
      readText,
      applyWrite,
    }),
    [folder, shareOutline, canWrite, open, openFromInput, readText, applyWrite],
  );

  return <CoworkContext.Provider value={value}>{children}</CoworkContext.Provider>;
}

export function useCowork() {
  return useContext(CoworkContext);
}
