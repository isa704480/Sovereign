/**
 * Serverga yuboriladigan xabarlar ro'yxatini yig'ish — sof mantiq.
 * Tarix chegaralanadi: server bitta so'rovda 60 xabar va har birida 40 000 belgini
 * qabul qiladi; biz undan ancha pastda turamiz.
 */
import type { ChatMessage } from "./api";
import type { BuiltContext, DiagnosticContext } from "./context";
import { renderContextBlock } from "./context";
import type { Lang } from "./i18n";

/** Panelda saqlanadigan tarix uzunligi (user + assistant juftliklari). */
export const MAX_HISTORY_MESSAGES = 20;

const LANG_NAME: Record<Lang, string> = {
  uz: "Uzbek (Latin script)",
  "uz-cyrl": "Uzbek (Cyrillic script)",
  ru: "Russian",
  en: "English",
};

export function systemPrompt(lang: Lang): string {
  return [
    "You are SOVEREIGN, a coding assistant embedded in the user's editor (VS Code).",
    `Answer in ${LANG_NAME[lang]}, but keep code, identifiers and error messages verbatim.`,
    "You only see the snippet the user shared — never claim to have read other files.",
    "Be concise. Put every piece of code in a fenced block with a language tag, so the user can copy or apply it.",
    "You cannot edit files, run commands or access the workspace: the user applies your code manually.",
    "If a change spans several files, say so and show each file's code in its own fenced block with the path above it.",
  ].join(" ");
}

export interface TurnInput {
  instruction: string;
  userText?: string;
  context?: BuiltContext | null;
  diagnostic?: DiagnosticContext | null;
}

/** Bitta foydalanuvchi navbati: ko'rsatma + chegaralangan kontekst. */
export function buildTurn(input: TurnInput): string {
  const parts: string[] = [];
  if (input.instruction.trim()) parts.push(input.instruction.trim());
  if (input.userText && input.userText.trim() && input.userText.trim() !== input.instruction.trim()) {
    parts.push(input.userText.trim());
  }
  if (input.context) {
    parts.push(renderContextBlock(input.context, input.diagnostic ?? undefined));
  }
  return parts.join("\n\n");
}

export function buildMessages(lang: Lang, history: ChatMessage[], turn: string): ChatMessage[] {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  return [{ role: "system", content: systemPrompt(lang) }, ...trimmed, { role: "user", content: turn }];
}
