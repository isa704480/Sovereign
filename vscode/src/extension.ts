/**
 * SOVEREIGN — VS Code kengaytmasi (Cursor, Windsurf, VSCodium va Antigravity'da ham ishlaydi).
 *
 * Kengaytma ATAYLAB cheklangan: fayllarni o'zi tahrirlamaydi, terminal buyruqlarini
 * bajarmaydi, "To'liq avto" rejimi yo'q. Bularni SOVEREIGN CLI (`sov`) va Cowork qiladi.
 * Shu tanlov xavfsizlik yuzasini kichik saqlaydi — README'da ham shunday yozilgan.
 */
import * as vscode from "vscode";
import { Auth } from "./auth";
import { registerCommands } from "./commands";
import { makeT } from "./core/i18n";
import { SovereignPanel } from "./panel";
import { readSettings, SECTION } from "./settings";
import { StatusBar } from "./status";

export function activate(context: vscode.ExtensionContext): void {
  const auth = new Auth(context.secrets);
  const panel = new SovereignPanel(context, auth);
  const status = new StatusBar(auth);

  context.subscriptions.push(
    auth,
    panel,
    status,
    vscode.window.registerWebviewViewProvider(SovereignPanel.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  registerCommands(context, panel, auth, status);

  context.subscriptions.push(
    auth.onDidChange(() => void status.refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION)) return;
      void status.refresh();
      void panel.pushStatus();
      panel.pushContext();
    }),
  );

  void status.refresh();
  // Token bo'lsa — tarifni fon rejimida yangilaymiz (holat paneli uchun).
  void auth.refresh();

  const settings = readSettings();
  if (!settings.baseUrlOk) {
    void vscode.window.showWarningMessage(makeT(settings.lang)("err.badBaseUrl"));
  }
}

export function deactivate(): void {
  /* Barcha resurslar `context.subscriptions` orqali tozalanadi. */
}
