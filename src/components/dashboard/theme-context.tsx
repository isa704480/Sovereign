"use client";

import { createContext, useContext } from "react";
import type { SovereignModel } from "@/config/models";
import { MODEL_THEMES, type ModelThemeSpec } from "@/config/model-themes";
import { DEFAULT_MODEL_ID, resolveModel } from "@/config/models";

export interface DashboardTheme {
  theme: ModelThemeSpec;
  model: SovereignModel;
}

// DEFAULT_MODEL_ID is "auto" (not a real model), so resolve it rather than index MODEL_BY_ID.
const ThemeContext = createContext<DashboardTheme>({
  theme: MODEL_THEMES.sovereign,
  model: resolveModel(DEFAULT_MODEL_ID),
});

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): DashboardTheme {
  return useContext(ThemeContext);
}
