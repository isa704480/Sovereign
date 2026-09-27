// CodeMirror 6 sozlamalari: mavzu (faqat CSS o'zgaruvchilari — qattiq palitra yo'q),
// sintaksis ranglari va til paketlari. Monaco ishlatilmaydi (og'ir va ilovaning
// qat'iy CSP'si bilan ziddiyatli).

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { tags as tg } from "@lezer/highlight";

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";

/** Kengaytmani mavzu almashganda almashtirish uchun. */
export const themeCompartment = new Compartment();
export const langCompartment = new Compartment();
export const wrapCompartment = new Compartment();
export const editableCompartment = new Compartment();

// ---- Ranglar: hammasi styles.css dagi tokenlardan (--cm-*) --------------
const hl = HighlightStyle.define([
  { tag: [tg.comment, tg.lineComment, tg.blockComment, tg.docComment], color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: [tg.keyword, tg.modifier, tg.controlKeyword, tg.moduleKeyword, tg.operatorKeyword], color: "var(--cm-keyword)" },
  { tag: [tg.string, tg.special(tg.string), tg.regexp], color: "var(--cm-string)" },
  { tag: [tg.number, tg.bool, tg.null, tg.atom], color: "var(--cm-number)" },
  { tag: [tg.function(tg.variableName), tg.function(tg.propertyName), tg.labelName], color: "var(--cm-fn)" },
  { tag: [tg.typeName, tg.className, tg.namespace, tg.standard(tg.typeName)], color: "var(--cm-type)" },
  { tag: [tg.propertyName, tg.attributeName], color: "var(--cm-prop)" },
  { tag: [tg.variableName, tg.definition(tg.variableName)], color: "var(--cm-var)" },
  { tag: [tg.tagName, tg.angleBracket], color: "var(--cm-keyword)" },
  { tag: [tg.operator, tg.punctuation, tg.separator, tg.bracket], color: "var(--cm-punct)" },
  { tag: [tg.meta, tg.processingInstruction, tg.documentMeta], color: "var(--cm-meta)" },
  { tag: [tg.heading, tg.strong], color: "var(--cm-fn)", fontWeight: "600" },
  { tag: [tg.emphasis], fontStyle: "italic" },
  { tag: [tg.link, tg.url], color: "var(--cm-type)", textDecoration: "underline" },
  { tag: [tg.deleted], color: "var(--del-fg)" },
  { tag: [tg.inserted], color: "var(--add-fg)" },
  { tag: [tg.invalid], color: "var(--cm-invalid)" },
]);

/** Muharrir chrome'i — barcha ranglar CSS o'zgaruvchilaridan (mavzu bilan birga o'zgaradi). */
export function editorTheme(dark) {
  return EditorView.theme(
    {
      "&": { color: "var(--text)", backgroundColor: "var(--code-bg)", height: "100%", fontSize: "12.5px" },
      ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.55", overflow: "auto" },
      ".cm-content": { caretColor: "var(--cm-cursor)", padding: "8px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cm-cursor)", borderLeftWidth: "2px" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--cm-sel)" },
      ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--cm-gutter)", border: "none", borderRight: "1px solid var(--border)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--cm-active)", color: "var(--text-2)" },
      ".cm-activeLine": { backgroundColor: "var(--cm-active)" },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px", minWidth: "34px" },
      ".cm-foldGutter .cm-gutterElement": { padding: "0 2px" },
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--accent-bg)", outline: "1px solid var(--accent-ring)" },
      ".cm-nonmatchingBracket": { color: "var(--err)" },
      ".cm-selectionMatch": { backgroundColor: "var(--cm-match)" },
      ".cm-searchMatch": { backgroundColor: "var(--cm-match)", outline: "1px solid var(--border-strong)" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent-bg)", outline: "1px solid var(--accent-ring)" },
      ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--text)", borderColor: "var(--border)" },
      ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
      ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
      ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { fontFamily: "var(--font)", fontSize: "12px" },
      ".cm-panel.cm-search input": { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "3px 6px" },
      ".cm-panel.cm-search button[name]": { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "3px 8px", backgroundImage: "none" },
      ".cm-tooltip": { background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)", color: "var(--text)" },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "var(--accent-bg)", color: "var(--text)" },
      ".cm-tooltip-autocomplete > ul > li": { fontFamily: "var(--mono)" },
      ".cm-specialChar": { color: "var(--err)" },
      "&.cm-editor.cm-focused": { outline: "none" },
    },
    { dark },
  );
}

// ---- Tillar --------------------------------------------------------------
// Bo'sh massiv — oddiy matn (yaroqli standart): raqamlar, qidiruv, undo baribir ishlaydi.
const PLAIN = StreamLanguage.define({ token: (s) => (s.next(), null) });

const BY_EXT = {
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  mts: () => javascript({ typescript: true }),
  cts: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  jsonc: () => json(),
  webmanifest: () => json(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  md: () => markdown(),
  mdx: () => markdown(),
  markdown: () => markdown(),
  py: () => python(),
  pyw: () => python(),
  sql: () => sql(),
};

/** Fayl nomidan til kengaytmasi (topilmasa — oddiy matn). */
export function languageFor(name) {
  const ext = String(name ?? "").toLowerCase().split(".").pop();
  const make = BY_EXT[ext];
  try {
    return make ? make() : PLAIN;
  } catch {
    return PLAIN;
  }
}

/** Yorliqda ko'rsatiladigan til nomi (foydalanuvchiga — texnik atama, tarjima qilinmaydi). */
export function languageLabel(name) {
  const ext = String(name ?? "").toLowerCase().split(".").pop();
  const L = {
    js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JSX",
    ts: "TypeScript", mts: "TypeScript", cts: "TypeScript", tsx: "TSX",
    json: "JSON", jsonc: "JSON", webmanifest: "JSON",
    html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", less: "LESS",
    md: "Markdown", mdx: "Markdown", markdown: "Markdown",
    py: "Python", pyw: "Python", sql: "SQL",
  };
  return L[ext] ?? "";
}

/**
 * Asosiy kengaytmalar to'plami.
 * @param {{onSave: () => void, onDirty: (dirty: boolean) => void, dark: boolean, wrap: boolean, editable: boolean, name: string}} o
 */
export function baseExtensions({ onSave, dark, wrap, editable, name }) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of("  "),
    syntaxHighlighting(hl, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      // Ctrl+S / Cmd+S — saqlash (brauzerning o'z amalini bosadi).
      { key: "Mod-s", preventDefault: true, run: () => (onSave(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    themeCompartment.of(editorTheme(dark)),
    langCompartment.of(languageFor(name)),
    wrapCompartment.of(wrap ? EditorView.lineWrapping : []),
    editableCompartment.of([EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]),
  ];
}
