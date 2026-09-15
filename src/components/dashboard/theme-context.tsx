"use client";

import { createContext, useContext } from "react";
import type { SovereignModel } from "@/config/models";
import { MODEL_THEMES, type ModelThemeSpec } from "@/config/model-themes";
import { MODEL_BY_ID, DEFAULT_MODEL_ID } from "@/config/models";

export interface DashboardTheme {
  theme: ModelThemeSpec;
  model: SovereignModel;
}

const ThemeContext = createContext<DashboardTheme>({
  theme: MODEL_THEMES.sovereign,
  model: MODEL_BY_ID[DEFAULT_MODEL_ID],
});

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): DashboardTheme {
  return useContext(ThemeContext);
}
