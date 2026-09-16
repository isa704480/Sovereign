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
export const RENDERABLE = new Set([
  "html",
  "svg",
  "markdown",
  "md",
  "xml",
  "jsx",
  "tsx",
  "react",
]);

export function isRenderable(lang: string): boolean {
  return RENDERABLE.has(lang.toLowerCase());
}

export function isReact(lang: string): boolean {
  const l = lang.toLowerCase();
  return l === "jsx" || l === "tsx" || l === "react";
}
