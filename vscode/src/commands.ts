/**
 * Buyruqlar: buyruqlar paneli (Ctrl+Shift+P), muharrir kontekst menyusi va tugmalar
 * birikmasi. Har biri CHEGARALANGAN kontekst yuboradi — butun ish papkasi emas.
 */
import * as vscode from "vscode";
import { Auth, describe } from "./auth";
import { ApiError, fetchFeaturedModels, fetchModels, type CatalogModel } from "./core/api";
import { makeT } from "./core/i18n";
import { activeEditor, diagnosticAt } from "./editor";
import { SovereignPanel } from "./panel";
import { readSettings, saveModel } from "./settings";
import { StatusBar } from "./status";

export function registerCommands(ctx: vscode.ExtensionContext, panel: SovereignPanel, auth: Auth, status: StatusBar): void {
  const add = (id: string, fn: (...args: unknown[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  add("sovereign.openChat", async () => {
    await panel.reveal();
  });

  add("sovereign.explainSelection", async () => {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const editor = activeEditor();
    if (!editor) return void vscode.window.showWarningMessage(t("err.noEditor"));
    await panel.ask({ instruction: t("prompt.explain"), withContext: true, echo: t("prompt.explain") });
  });

  add("sovereign.fixError", async () => {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const editor = activeEditor();
    if (!editor) return void vscode.window.showWarningMessage(t("err.noEditor"));
    if (!diagnosticAt(editor)) return void vscode.window.showInformationMessage(t("err.noDiagnostic"));
    await panel.ask({ instruction: t("prompt.fix"), withContext: true, withDiagnostic: true, echo: t("prompt.fix") });
  });

  add("sovereign.writeTest", async () => {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const editor = activeEditor();
    if (!editor) return void vscode.window.showWarningMessage(t("err.noEditor"));
    if (editor.selection.isEmpty && editor.document.lineCount > settings.maxContextLines) {
      vscode.window.showInformationMessage(t("err.noSelection"));
    }
    await panel.ask({ instruction: t("prompt.test"), withContext: true, echo: t("prompt.test") });
  });

  add("sovereign.askAboutFile", async () => {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const editor = activeEditor();
    if (!editor) return void vscode.window.showWarningMessage(t("err.noEditor"));
    const question = await vscode.window.showInputBox({
      title: t("prompt.file"),
      prompt: t("panel.placeholder"),
      ignoreFocusOut: true,
    });
    if (question === undefined) return;
    const text = question.trim() || t("prompt.file");
    await panel.ask({ instruction: text, withContext: true, echo: text });
  });

  add("sovereign.login", async () => {
    await auth.signIn();
    await status.refresh();
  });

  add("sovereign.useCliLogin", async () => {
    await auth.importFromCli();
    await status.refresh();
  });

  add("sovereign.logout", async () => {
    await auth.signOut();
    await status.refresh();
  });

  add("sovereign.openSettings", async () => {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:sovereign.sovereign");
  });

  add("sovereign.pickModel", async () => {
    await pickModel(auth, status);
  });

  add("sovereign.statusMenu", async () => {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const signedIn = await auth.signedIn();
    type Item = vscode.QuickPickItem & { run: () => Thenable<unknown> | Promise<unknown> };
    const items: Item[] = [
      { label: `$(comment-discussion) ${t("menu.openChat")}`, run: () => vscode.commands.executeCommand("sovereign.openChat") },
      { label: `$(server-process) ${t("menu.pickModel")}`, description: settings.model, run: () => vscode.commands.executeCommand("sovereign.pickModel") },
      { label: `$(gear) ${t("menu.settings")}`, run: () => vscode.commands.executeCommand("sovereign.openSettings") },
      signedIn
        ? { label: `$(sign-out) ${t("menu.signOut")}`, description: (await auth.email()) ?? "", run: () => vscode.commands.executeCommand("sovereign.logout") }
        : { label: `$(sign-in) ${t("menu.signIn")}`, run: () => vscode.commands.executeCommand("sovereign.login") },
    ];
    const picked = await vscode.window.showQuickPick(items, { title: t("status.menuTitle"), matchOnDescription: true });
    if (picked) await picked.run();
  });
}

const MODEL_ID = /^[\w./:@-]{1,120}$/;

async function pickModel(auth: Auth, status: StatusBar): Promise<void> {
  const settings = readSettings();
  const t = makeT(settings.lang);

  type Item = vscode.QuickPickItem & { id?: string; manual?: boolean };
  const pick = vscode.window.createQuickPick<Item>();
  pick.title = t("model.pickTitle");
  pick.placeholder = t("model.loading");
  pick.busy = true;
  pick.matchOnDescription = true;
  pick.ignoreFocusOut = true;

  const base: Item[] = [
    { label: "auto", description: t("model.auto"), id: "auto", picked: settings.model === "auto" },
    { label: t("model.manual"), manual: true },
  ];
  pick.items = base;
  pick.show();

  const controller = new AbortController();
  pick.onDidHide(() => controller.abort());

  const toItems = (models: CatalogModel[]): Item[] =>
    models.map((m) => ({ label: m.label, description: m.id, detail: m.note, id: m.id }));

  const load = async (query: string) => {
    pick.busy = true;
    try {
      const models = query.trim()
        ? await fetchModels(settings.baseUrl, query, settings.lang, controller.signal)
        : await fetchFeaturedModels(settings.baseUrl, settings.lang, controller.signal);
      pick.items = [...base, ...toItems(models)];
      pick.placeholder = t("model.pickTitle");
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError || e instanceof Error) pick.placeholder = t("model.failed", { reason: describe(e, settings.lang) });
    } finally {
      pick.busy = false;
    }
  };

  let timer: NodeJS.Timeout | undefined;
  pick.onDidChangeValue((value) => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(value), 250);
  });

  void load("");

  const chosen = await new Promise<Item | null>((resolve) => {
    pick.onDidAccept(() => resolve(pick.selectedItems[0] ?? null));
    pick.onDidHide(() => resolve(null));
  });
  clearTimeout(timer);
  pick.dispose();
  if (!chosen) return;

  let id = chosen.id ?? "";
  if (chosen.manual) {
    const typed = await vscode.window.showInputBox({
      title: t("model.pickTitle"),
      prompt: t("model.manualPrompt"),
      value: settings.model,
      validateInput: (v) => (MODEL_ID.test(v.trim()) ? null : t("model.manualPrompt")),
    });
    if (!typed) return;
    id = typed.trim();
  }
  if (!MODEL_ID.test(id)) return;

  await saveModel(id);
  await status.refresh();
  void auth;
  vscode.window.showInformationMessage(t("model.saved", { model: id }));
}
