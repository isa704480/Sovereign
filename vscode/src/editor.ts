/**
 * Muharrirdan CHEGARALANGAN kontekst olish va model kodini muharrirga qo'yish.
 *
 * Yuboriladigan narsa faqat: fayl yo'li (ish papkasiga nisbatan), til identifikatori,
 * belgilangan joy atrofidagi `sovereign.maxContextLines` qator va (kerak bo'lsa)
 * kursor ostidagi diagnostika matni. Butun ish papkasi hech qachon yuborilmaydi.
 */
import * as vscode from "vscode";
import { buildContext, relativeFilePath, type BuiltContext, type DiagnosticContext } from "./core/context";

export function activeEditor(): vscode.TextEditor | null {
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.document.uri.scheme === "output") return null;
  return ed;
}

export function collectContext(editor: vscode.TextEditor, maxLines: number): BuiltContext {
  const doc = editor.document;
  const root = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
  const sel = editor.selection;
  const lines: string[] = [];
  for (let i = 0; i < doc.lineCount; i++) lines.push(doc.lineAt(i).text);

  return buildContext(
    {
      filePath: doc.uri.scheme === "file" ? relativeFilePath(doc.uri.fsPath, root) : doc.uri.path.split("/").pop() || "untitled",
      languageId: doc.languageId,
      lines,
      selectionStartLine: sel.start.line,
      selectionEndLine: sel.end.line,
      hasSelection: !sel.isEmpty,
    },
    maxLines,
  );
}

const SEVERITY: Record<number, string> = {
  [vscode.DiagnosticSeverity.Error]: "error",
  [vscode.DiagnosticSeverity.Warning]: "warning",
  [vscode.DiagnosticSeverity.Information]: "info",
  [vscode.DiagnosticSeverity.Hint]: "hint",
};

/** Kursor / belgilangan joy bilan kesishadigan eng jiddiy diagnostika. */
export function diagnosticAt(editor: vscode.TextEditor): DiagnosticContext | null {
  const all = vscode.languages.getDiagnostics(editor.document.uri);
  const sel = editor.selection;
  const line = sel.active.line;
  const hits = all.filter((d) => d.range.intersection(sel) !== undefined || (d.range.start.line <= line && d.range.end.line >= line));
  if (!hits.length) return null;
  hits.sort((a, b) => a.severity - b.severity);
  const d = hits[0];
  const code = typeof d.code === "object" && d.code !== null ? String((d.code as { value?: unknown }).value ?? "") : d.code !== undefined ? String(d.code) : "";
  return {
    message: d.message.slice(0, 1_000),
    severity: SEVERITY[d.severity] ?? "problem",
    source: d.source ? d.source.slice(0, 40) : undefined,
    code: code ? code.slice(0, 40) : undefined,
    line: d.range.start.line + 1,
  };
}

/**
 * Kodni AKTIV muharrirga qo'yadi: belgilangan matn bo'lsa — almashtiriladi, aks holda
 * kursor joyiga qo'shiladi. Oddiy tahrir (`TextEditorEdit`) — Ctrl+Z bilan qaytariladi.
 * Fayl hech qachon indamay diskka yozilmaydi va saqlanmaydi.
 */
export async function applyToEditor(code: string): Promise<boolean> {
  const editor = activeEditor();
  if (!editor) return false;
  const selection = editor.selection;
  const ok = await editor.edit(
    (builder) => {
      if (selection.isEmpty) builder.insert(selection.active, code);
      else builder.replace(selection, code);
    },
    { undoStopBefore: true, undoStopAfter: true },
  );
  if (ok) await vscode.window.showTextDocument(editor.document, editor.viewColumn);
  return ok;
}
