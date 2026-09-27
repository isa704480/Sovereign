import * as vscode from "vscode";
import { Auth } from "./auth";
import { makeT } from "./core/i18n";
import { readSettings } from "./settings";

/** Holat panelidagi element: joriy model va tarif; bosilganda menyu ochiladi. */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly auth: Auth) {
    this.item = vscode.window.createStatusBarItem("sovereign.status", vscode.StatusBarAlignment.Right, 90);
    this.item.name = "SOVEREIGN";
    this.item.command = "sovereign.statusMenu";
    this.item.show();
  }

  async refresh(): Promise<void> {
    const settings = readSettings();
    const t = makeT(settings.lang);
    const signedIn = await this.auth.signedIn();
    if (!signedIn) {
      this.item.text = `$(shield) SOVEREIGN · ${t("status.signedOut")}`;
      this.item.tooltip = t("status.tooltipSignedOut");
      this.item.backgroundColor = undefined;
      return;
    }
    const plan = this.auth.plan() || "free";
    const model = settings.model || "auto";
    this.item.text = `$(shield) ${shorten(model)} · ${plan}`;
    this.item.tooltip = t("status.tooltip", { model, plan });
    this.item.backgroundColor = undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}

function shorten(model: string): string {
  const tail = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return tail.length > 22 ? `${tail.slice(0, 21)}…` : tail;
}
