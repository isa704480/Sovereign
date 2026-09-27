/**
 * Kirish (device login) — CLI bilan BIR XIL oqim:
 *   POST /api/cli/start → kod + /cli/connect sahifasi → brauzerda tasdiqlash →
 *   GET /api/cli/poll → token → `context.secrets` (VS Code SecretStorage).
 *
 * Token settings.json ga, workspace fayliga yoki jurnalga HECH QACHON yozilmaydi.
 */
import { hostname } from "node:os";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { ApiError, fetchMe, pollDeviceLogin, startDeviceLogin, type Me } from "./core/api";
import { cliConfigPath, parseCliConfig } from "./core/cli-config";
import { makeT, type Lang } from "./core/i18n";
import { TokenStore } from "./core/secrets";
import { readSettings } from "./settings";

const POLL_INTERVAL_MS = 2_000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface Session {
  token: string;
  email: string;
  plan: string;
}

export class Auth {
  private readonly store: TokenStore;
  private cachedPlan = "";
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  /** Panel kirish kodini ko'rsatishi uchun. */
  private codeSink: ((code: string, url: string) => void) | null = null;
  private busy = false;

  constructor(secrets: vscode.SecretStorage) {
    this.store = new TokenStore(secrets);
  }

  onCode(sink: ((code: string, url: string) => void) | null): void {
    this.codeSink = sink;
  }

  async token(): Promise<string | null> {
    return this.store.get();
  }

  async signedIn(): Promise<boolean> {
    return this.store.has();
  }

  async email(): Promise<string | null> {
    return this.store.email();
  }

  plan(): string {
    return this.cachedPlan;
  }

  private notify(): void {
    this.changed.fire();
  }

  /** Brauzer orqali kirish. `true` — token saqlandi. */
  async signIn(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const settings = readSettings();
    const t = makeT(settings.lang);
    try {
      const device = `${hostname()} (${vscode.env.appName})`.slice(0, 80);
      const start = await startDeviceLogin(settings.baseUrl, device, settings.lang);
      this.codeSink?.(start.code, start.url);

      await vscode.env.openExternal(vscode.Uri.parse(start.url, true));

      const token = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${t("auth.codeTitle")}: ${start.code.slice(0, 8).toUpperCase()}`,
          cancellable: true,
        },
        async (progress, cancellation) => {
          progress.report({ message: t("auth.waiting") });
          const until = Date.now() + LOGIN_TIMEOUT_MS;
          while (Date.now() < until) {
            if (cancellation.isCancellationRequested) return null;
            await delay(POLL_INTERVAL_MS, cancellation);
            if (cancellation.isCancellationRequested) return null;
            try {
              const res = await pollDeviceLogin(settings.baseUrl, start.code);
              if (res.status === "approved") return res.token;
              if (res.status === "expired") return "expired";
            } catch (e) {
              if (e instanceof ApiError && e.kind === "rate") continue;
              if (e instanceof ApiError && e.kind === "network") continue;
              throw e;
            }
          }
          return "expired";
        },
      );

      if (token === null) {
        vscode.window.showInformationMessage(t("auth.cancelled"));
        return false;
      }
      if (token === "expired") {
        vscode.window.showWarningMessage(t("auth.expired"));
        return false;
      }
      return await this.adopt(settings.baseUrl, token, settings.lang);
    } catch (e) {
      vscode.window.showErrorMessage(t("auth.failed", { reason: describe(e, settings.lang) }));
      return false;
    } finally {
      this.busy = false;
      this.codeSink?.("", "");
    }
  }

  /** Mavjud CLI kirishini (`~/.sovereign/config.json`) ko'chirish. */
  async importFromCli(): Promise<boolean> {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const path = cliConfigPath(homedir());
    let raw: string | null = null;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      raw = null;
    }
    const parsed = parseCliConfig(raw);
    if (!parsed) {
      vscode.window.showWarningMessage(t("auth.cliNotFound"));
      return false;
    }
    const ok = await this.adopt(parsed.baseUrl, parsed.token, settings.lang, parsed.email);
    if (ok) vscode.window.showInformationMessage(t("auth.cliFound", { path }));
    return ok;
  }

  /** Tokenni tekshirib saqlaydi (serverdan hisob ma'lumotini oladi). */
  private async adopt(baseUrl: string, token: string, lang: Lang, fallbackEmail = ""): Promise<boolean> {
    const t = makeT(lang);
    let me: Me | null = null;
    try {
      me = await fetchMe(baseUrl, token, lang);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "unauthorized") {
        vscode.window.showErrorMessage(t("err.unauthorized"));
        return false;
      }
      // Tarmoq yiqilgan bo'lsa ham tokenni saqlaymiz — keyingi so'rov tekshiradi.
    }
    const saved = await this.store.set(token, me?.email || fallbackEmail);
    if (!saved) {
      vscode.window.showErrorMessage(t("auth.failed", { reason: "token" }));
      return false;
    }
    this.cachedPlan = me?.plan ?? "";
    this.notify();
    const email = me?.email || fallbackEmail;
    vscode.window.showInformationMessage(email ? t("auth.success", { email }) : t("auth.successNoEmail"));
    return true;
  }

  async signOut(): Promise<void> {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const token = await this.store.get();
    if (token) {
      // Serverda ham bekor qilamiz (best-effort) — sizib chiqqan token 90 kun yashamasin.
      try {
        await fetch(`${settings.baseUrl}/api/cli/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        /* tarmoq xatosi — mahalliy o'chirish baribir bajariladi */
      }
    }
    await this.store.clear();
    this.cachedPlan = "";
    this.notify();
    vscode.window.showInformationMessage(t("auth.loggedOut"));
  }

  /** Fon rejimida hisob ma'lumotini yangilaydi (holat paneli uchun). */
  async refresh(): Promise<void> {
    const settings = readSettings();
    const token = await this.store.get();
    if (!token) {
      this.cachedPlan = "";
      this.notify();
      return;
    }
    try {
      const me = await fetchMe(settings.baseUrl, token, settings.lang);
      this.cachedPlan = me.plan;
      await this.store.set(token, me.email);
    } catch {
      /* jim: holat paneli oxirgi ma'lum qiymatda qoladi */
    }
    this.notify();
  }

  dispose(): void {
    this.changed.dispose();
  }
}

function delay(ms: number, token: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    token.onCancellationRequested(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function describe(e: unknown, lang: Lang): string {
  const t = makeT(lang);
  if (e instanceof ApiError) {
    if (e.kind === "network") return t("err.network");
    if (e.kind === "unauthorized") return t("err.unauthorized");
    if (e.kind === "rate") return t("err.rateLimited");
    return e.message || t("err.server", { status: e.status });
  }
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}
