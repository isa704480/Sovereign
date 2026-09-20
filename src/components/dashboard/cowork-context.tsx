"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  folderFromInput,
  folderOutline,
  pickFolder,
  supportsFolderPicker,
  type CoworkFolder,
} from "@/lib/cowork/folder";
import { useChat } from "@/store/chat";

interface CoworkValue {
  folder: CoworkFolder | null;
  /** Send the file list to the model so it knows what exists. */
  shareOutline: boolean;
  setShareOutline: (on: boolean) => void;
  supported: boolean;
  open: () => Promise<void>;
  openFromInput: (list: FileList) => void;
  clear: () => void;
}

const CoworkContext = createContext<CoworkValue>({
  folder: null,
  shareOutline: true,
  setShareOutline: () => {},
  supported: false,
  open: async () => {},
  openFromInput: () => {},
  clear: () => {},
});

export function CoworkProvider({ children }: { children: React.ReactNode }) {
  const [folder, setFolder] = useState<CoworkFolder | null>(null);
  const [shareOutline, setShareOutline] = useState(true);
  const setCoworkOutline = useChat((s) => s.setCoworkOutline);

  // The outline travels with each chat request, so the model knows what exists.
  useEffect(() => {
    setCoworkOutline(folder && shareOutline ? folderOutline(folder) : null);
  }, [folder, shareOutline, setCoworkOutline]);

  const open = useCallback(async () => {
    const picked = await pickFolder();
    if (picked) setFolder(picked);
  }, []);

  const openFromInput = useCallback((list: FileList) => {
    const picked = folderFromInput(list);
    if (picked) setFolder(picked);
  }, []);

  const value = useMemo<CoworkValue>(
    () => ({
      folder,
      shareOutline,
      setShareOutline,
      supported: supportsFolderPicker(),
      open,
      openFromInput,
      clear: () => setFolder(null),
    }),
    [folder, shareOutline, open, openFromInput],
  );

  return <CoworkContext.Provider value={value}>{children}</CoworkContext.Provider>;
}

export function useCowork() {
  return useContext(CoworkContext);
}
