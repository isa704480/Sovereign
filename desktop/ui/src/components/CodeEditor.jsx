import React, { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { baseExtensions, editorTheme, languageFor, themeCompartment, langCompartment, wrapCompartment, editableCompartment } from "../lib/editor.js";

/**
 * Bitta CodeMirror 6 ko'rinishi; har yorliq uchun alohida EditorState saqlanadi —
 * shuning uchun yorliq almashganda undo tarixi, kursor va aylantirish joyi yo'qolmaydi.
 *
 * Props: tab (ochiq fayl), dark, wrap, onChange(path, doc), onSave(path).
 * Ref: { focus(), doc(path), setDoc(path, text), forget(path) }.
 */
const CodeEditor = forwardRef(function CodeEditor({ tab, dark, wrap, onChange, onSave }, ref) {
  const host = useRef(null);
  const view = useRef(null);
  const states = useRef(new Map()); // path -> EditorState
  const current = useRef(null); // ko'rinishdagi yorliq yo'li
  // Callback'lar keymap ichida "muzlab" qolmasin.
  const cb = useRef({ onChange, onSave, tab });
  cb.current = { onChange, onSave, tab };

  // Ko'rinish bir marta yaratiladi.
  useEffect(() => {
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged && current.current) cb.current.onChange?.(current.current, u.state.doc.toString());
    });
    const v = new EditorView({
      state: EditorState.create({ doc: "", extensions: [listener, ...baseExtensions({ onSave: () => cb.current.onSave?.(current.current), dark, wrap, editable: false, name: "" })] }),
      parent: host.current,
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
      states.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yorliq almashdi yoki diskdan qayta o'qildi → holatni almashtiramiz.
  useEffect(() => {
    const v = view.current;
    if (!v || !tab || tab.kind !== "text") return;
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged && current.current) cb.current.onChange?.(current.current, u.state.doc.toString());
    });
    if (current.current && current.current !== tab.path) states.current.set(current.current, v.state);
    const reuse = tab.reloadSeq ? null : states.current.get(tab.path);
    const state =
      reuse ??
      EditorState.create({
        doc: tab.content ?? "",
        extensions: [listener, ...baseExtensions({ onSave: () => cb.current.onSave?.(current.current), dark, wrap, editable: !tab.readOnly, name: tab.name })],
      });
    current.current = tab.path;
    v.setState(state);
    v.dispatch({
      effects: [
        themeCompartment.reconfigure(editorTheme(dark)),
        langCompartment.reconfigure(languageFor(tab.name)),
        wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
        editableCompartment.reconfigure([EditorView.editable.of(!tab.readOnly), EditorState.readOnly.of(!!tab.readOnly)]),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.path, tab?.reloadSeq, tab?.readOnly]);

  // Mavzu / o'rash — joriy holatda qayta sozlanadi.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: [themeCompartment.reconfigure(editorTheme(dark)), wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : [])] });
  }, [dark, wrap]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    doc: () => view.current?.state.doc.toString() ?? "",
    forget: (path) => states.current.delete(path),
    forgetAll: () => states.current.clear(),
  }));

  return <div className="cm-host" ref={host} />;
});

export default CodeEditor;
