"use client";

import { createContext, useContext } from "react";

export interface ArtifactPayload {
  code: string;
  lang: string;
  title?: string;
}

interface ArtifactCtx {
  open: (a: ArtifactPayload) => void;
}

const Ctx = createContext<ArtifactCtx>({ open: () => {} });

export const ArtifactProvider = Ctx.Provider;
export const useArtifact = () => useContext(Ctx);

/** Languages that get a live "Ochish" (open in side panel) preview. */
export const RENDERABLE = new Set(["html", "svg", "markdown", "md", "xml"]);

export function isRenderable(lang: string): boolean {
  return RENDERABLE.has(lang.toLowerCase());
}
