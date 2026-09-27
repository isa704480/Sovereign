/**
 * Faoliyat panelidagi (activity bar) suhbat — WebviewView.
 *
 * Xavfsizlik:
 *  - `enableScripts: true`, lekin `localResourceRoots` faqat `media/` papkasi;
 *  - qat'iy CSP: `default-src 'none'`, skript faqat nonce bilan, `eval` yo'q,
 *    `unsafe-inline` yo'q, tashqi manba yo'q;
 *  - webview'dan kelgan har bir xabar `core/protocol.ts` da tekshiriladi;
 *  - model javobi `core/markdown.ts` orqali ekranlanadi (xom HTML, `javascript:`,
 *    `data:` havolalar chiqmaydi); havola faqat https va `openExternal` bilan ochiladi;
 *  - fayl indamay tahrirlanmaydi: "Apply" oddiy muharrir tahririni qiladi (Ctrl+Z).
 */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { ApiError, chat, type ChatMessage } from "./core/api";
import { contextLabel, type BuiltContext, type DiagnosticContext } from "./core/context";
import { bundleFor, makeT, type Lang } from "./core/i18n";
import { renderMarkdown } from "./core/markdown";
import { buildMessages, buildTurn, MAX_HISTORY_MESSAGES } from "./core/prompt";
import { parseInbound, type OutboundMessage } from "./core/protocol";
import { Auth, describe } from "./auth";
import { activeEditor, applyToEditor, collectContext, diagnosticAt } from "./editor";
import { readSettings } from "./settings";

export interface AskOptions {
  instruction: string;
  /** Foydalanuvchi yozgan matn (buyruqlarda bo'lmasligi mumkin). */
  userText?: string;
  withContext?: boolean;
  withDiagnostic?: boolean;
  /** Suhbat oynasida foydalanuvchi xabari sifatida ko'rsatiladigan matn. */
  echo?: string;
}

export class SovereignPanel implements vscode.WebviewViewProvider {
  static readonly viewType = "sovereign.chatView";

  private view: vscode.WebviewView | null = null;
  private history: ChatMessage[] = [];
  private readonly codeBlocks = new Map<number, string>();
  private nextBlockIndex = 0;
  private nextMessageId = 1;
  private abort: AbortController | null = null;
  private lastCode: { code: string; url: string } | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly auth: Auth,
  ) {
    this.auth.onCode((code, url) => {
      this.lastCode = code ? { code, url } : null;
      this.send(code ? { type: "authCode", code, url } : { type: "authEnd" });
    });
    this.disposables.push(
      this.auth.onDidChange(() => void this.pushStatus()),
      vscode.window.onDidChangeTextEditorSelection(() => this.pushContext()),
      vscode.window.onDidChangeActiveTextEditor(() => this.pushContext()),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      // Faqat shu papkadagi fayllar yuklanadi — ish papkasidagi hech narsa emas.
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };
    const settings = readSettings();
    view.webview.html = this.html(view.webview, settings.lang);

    view.webview.onDidReceiveMessage((raw) => void this.onMessage(raw), undefined, this.disposables);
    view.onDidDispose(() => {
      this.view = null;
    });
  }

  dispose(): void {
    this.abort?.abort();
    for (const d of this.disposables) d.dispose();
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand("sovereign.chatView.focus");
  }

  /* ───────────────────────── Webview bilan aloqa ───────────────────────── */

  private send(msg: OutboundMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private async onMessage(raw: unknown): Promise<void> {
    const msg = parseInbound(raw);
    if (!msg) return; // noma'lum yoki noto'g'ri xabar — indamay tashlanadi
    const settings = readSettings();
    const t = makeT(settings.lang);

    switch (msg.type) {
      case "ready": {
        this.send({ type: "init", strings: bundleFor(settings.lang), lang: settings.lang, signedIn: await this.auth.signedIn(), model: settings.model });
        this.pushContext();
        if (this.lastCode) this.send({ type: "authCode", ...this.lastCode });
        break;
      }
      case "ask":
        await this.ask({ instruction: msg.text, withContext: msg.useContext, echo: msg.text });
        break;
      case "stop":
        this.abort?.abort();
        this.abort = null;
        this.send({ type: "busy", value: false });
        this.send({ type: "notice", text: t("panel.stopped") });
        break;
      case "newChat":
        this.history = [];
        this.codeBlocks.clear();
        this.nextBlockIndex = 0;
        this.send({ type: "reset" });
        this.pushContext();
        break;
      case "copy": {
        const code = this.codeBlocks.get(msg.index);
        if (code !== undefined) await vscode.env.clipboard.writeText(code);
        break;
      }
      case "apply": {
        const code = this.codeBlocks.get(msg.index);
        if (code === undefined) break;
        const ok = await applyToEditor(code);
        if (!ok) vscode.window.showWarningMessage(t("err.noEditor"));
        else vscode.window.setStatusBarMessage(t("panel.applied"), 4_000);
        break;
      }
      case "signIn":
        await this.auth.signIn();
        break;
      case "useCliLogin":
        await this.auth.importFromCli();
        break;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:sovereign.sovereign");
        break;
      case "openLink": {
        // Uchinchi tekshiruv (markdown → protocol → shu yer): faqat https.
        if (!/^https:\/\//i.test(msg.url)) {
          vscode.window.showWarningMessage(t("err.linkBlocked"));
          break;
        }
        await vscode.env.openExternal(vscode.Uri.parse(msg.url, true));
        break;
      }
    }
  }

  async pushStatus(): Promise<void> {
    const settings = readSettings();
    this.send({ type: "status", signedIn: await this.auth.signedIn(), model: settings.model });
  }

  pushContext(): void {
    if (!this.view) return;
    const editor = activeEditor();
    if (!editor) {
      this.send({ type: "context", label: null });
      return;
    }
    const settings = readSettings();
    this.send({ type: "context", label: contextLabel(collectContext(editor, settings.maxContextLines)) });
  }

  /* ───────────────────────── So'rov ───────────────────────── */

  async ask(options: AskOptions): Promise<void> {
    const settings = readSettings();
    const t = makeT(settings.lang);

    await this.reveal();

    if (!settings.baseUrlOk) vscode.window.showWarningMessage(t("err.badBaseUrl"));

    const token = await this.auth.token();
    if (!token) {
      this.send({ type: "status", signedIn: false, model: settings.model });
      vscode.window.showWarningMessage(t("auth.needSignIn"));
      return;
    }

    let ctxBlock: BuiltContext | null = null;
    let diagnostic: DiagnosticContext | null = null;
    const editor = activeEditor();
    if (options.withContext !== false && editor) {
      ctxBlock = collectContext(editor, settings.maxContextLines);
      if (options.withDiagnostic) diagnostic = diagnosticAt(editor);
    }

    const turn = buildTurn({
      instruction: options.instruction,
      userText: options.userText,
      context: ctxBlock,
      diagnostic,
    });

    const echo = options.echo ?? options.instruction;
    this.send({ type: "user", text: ctxBlock ? `${echo}\n\n— ${contextLabel(ctxBlock)}` : echo });

    const id = this.nextMessageId++;
    this.send({ type: "start", id });

    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;

    let answer = "";
    try {
      const result = await chat(
        settings.baseUrl,
        token,
        buildMessages(settings.lang, this.history, turn),
        settings.model,
        settings.lang,
        (chunk) => {
          answer += chunk;
          this.send({ type: "delta", id, text: chunk });
        },
        controller.signal,
      );
      answer = result.text || answer;
    } catch (e) {
      if (controller.signal.aborted) {
        this.finish(id, answer, settings.lang);
        return;
      }
      this.send({ type: "end", id, html: "", blocks: 0 });
      this.send({ type: "error", text: this.errorText(e, settings.lang) });
      if (e instanceof ApiError && e.kind === "unauthorized") await this.pushStatus();
      return;
    } finally {
      if (this.abort === controller) this.abort = null;
    }

    this.history.push({ role: "user", content: turn }, { role: "assistant", content: answer });
    if (this.history.length > MAX_HISTORY_MESSAGES) this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
    this.finish(id, answer, settings.lang);
  }

  private finish(id: number, answer: string, lang: Lang): void {
    const t = makeT(lang);
    if (!answer.trim()) {
      this.send({ type: "end", id, html: "", blocks: 0 });
      this.send({ type: "error", text: t("err.empty") });
      return;
    }
    const rendered = renderMarkdown(
      answer,
      { copy: t("panel.copy"), apply: t("panel.apply"), applyHint: t("panel.applyHint") },
      this.nextBlockIndex,
    );
    for (const block of rendered.codeBlocks) this.codeBlocks.set(this.nextBlockIndex++, block.code);
    this.send({ type: "end", id, html: rendered.html, blocks: rendered.codeBlocks.length });
  }

  private errorText(e: unknown, lang: Lang): string {
    const t = makeT(lang);
    if (e instanceof ApiError) {
      switch (e.kind) {
        case "network":
          return t("err.network");
        case "unauthorized":
          return t("err.unauthorized");
        case "rate":
          return t("err.rateLimited");
        default:
          return e.message || t("err.server", { status: e.status });
      }
    }
    return describe(e, lang);
  }

  /* ───────────────────────── HTML ───────────────────────── */

  private html(webview: vscode.Webview, lang: Lang): string {
    const nonce = makeNonce();
    const t = makeT(lang);
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "media", name));
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      "form-action 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "connect-src 'none'",
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="${esc(lang === "uz-cyrl" ? "uz-Cyrl" : lang)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset("panel.css")}">
<title>SOVEREIGN</title>
</head>
<body>
  <div id="gate" class="gate">
    <h2 data-t="panel.signInTitle">${esc(t("panel.signInTitle"))}</h2>
    <p data-t="panel.signInHint">${esc(t("panel.signInHint"))}</p>
    <button type="button" id="signIn" class="primary" data-t="panel.signIn">${esc(t("panel.signIn"))}</button>
    <button type="button" id="useCli" class="secondary" data-t="panel.useCli">${esc(t("panel.useCli"))}</button>
    <div id="codeBox" class="hidden">
      <div class="authcode" id="codeVal"></div>
      <p id="codeHint" class="dots">${esc(t("auth.waiting"))}</p>
    </div>
  </div>

  <div id="main" class="hidden" style="display:contents">
    <div class="topbar">
      <div id="ctx" class="ctx"></div>
      <button type="button" id="fresh" class="secondary" data-t="panel.newChat">${esc(t("panel.newChat"))}</button>
    </div>

    <div id="log" class="log" role="log" aria-live="polite">
      <div id="empty" class="empty">
        <h2 data-t="panel.emptyTitle">${esc(t("panel.emptyTitle"))}</h2>
        <p data-t="panel.emptyHint">${esc(t("panel.emptyHint"))}</p>
      </div>
    </div>

    <div class="composer">
      <textarea id="input" rows="3" placeholder="${esc(t("panel.placeholder"))}" aria-label="${esc(t("panel.placeholder"))}"></textarea>
      <div class="row">
        <label class="ctx-toggle"><input type="checkbox" id="useCtx" checked><span data-t="panel.useContext">${esc(t("panel.useContext"))}</span></label>
        <span class="spacer"></span>
        <button type="button" id="stop" class="secondary hidden" data-t="panel.stop">${esc(t("panel.stop"))}</button>
        <button type="button" id="send" class="primary" data-t="panel.send">${esc(t("panel.send"))}</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${asset("panel.js")}"></script>
</body>
</html>`;
  }
}

/** CSP nonce — har bir HTML uchun kriptografik tasodifiy qiymat. */
function makeNonce(): string {
  return randomBytes(24).toString("base64url");
}
