import * as vscode from "vscode";
import { clampContextLines, DEFAULT_CONTEXT_LINES } from "./core/context";
import { resolveLang, type Lang } from "./core/i18n";
import { DEFAULT_BASE_URL, isAcceptableBaseUrl, sanitizeBaseUrl } from "./core/url";

export const SECTION = "sovereign";

export interface Settings {
  baseUrl: string;
  baseUrlOk: boolean;
  model: string;
  maxContextLines: number;
  lang: Lang;
  telemetry: boolean;
}

export function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const rawBase = cfg.get<string>("baseUrl", DEFAULT_BASE_URL);
  const rawModel = cfg.get<string>("model", "auto").trim();
  return {
    baseUrl: sanitizeBaseUrl(rawBase, DEFAULT_BASE_URL),
    baseUrlOk: isAcceptableBaseUrl(rawBase),
    model: /^[\w./:@-]{1,120}$/.test(rawModel) ? rawModel : "auto",
    maxContextLines: clampContextLines(cfg.get<number>("maxContextLines", DEFAULT_CONTEXT_LINES)),
    lang: resolveLang(cfg.get<string>("language", "auto"), vscode.env.language),
    telemetry: cfg.get<boolean>("telemetry", false) === true,
  };
}

export async function saveModel(model: string): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update("model", model, vscode.ConfigurationTarget.Global);
}
