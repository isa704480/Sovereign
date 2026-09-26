import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useFocusTrap } from "./Modal.jsx";
import { useT } from "../lib/i18n.js";

/** Ctrl+K — buyruqlar palitrasi. commands: [{ id, label, icon, hint, run, group }] */
export default function CommandPalette({ commands, onClose }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const input = useRef(null);
  useFocusTrap(ref, { initialFocus: input, onEscape: onClose });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? commands.filter((c) => `${c.label} ${c.group ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(s)) : commands;
  }, [q, commands]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    ref.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const run = (c) => { onClose(); setTimeout(() => c.run(), 0); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[idx]) run(list[idx]); }
  };

  return (
    <div className="overlay overlay-top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("palette.title")} className="modal palette">
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={list[idx] ? `cmd-${list[idx].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="palette-list">
          {list.length === 0 && <li className="muted small pad">{t("palette.none")}</li>}
          {list.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === idx}
              data-idx={i}
              className={`palette-item ${i === idx ? "on" : ""}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c)}
            >
              <Icon name={c.icon ?? "command"} size={15} />
              <span className="grow">{c.label}</span>
              {c.group && <span className="faint small">{c.group}</span>}
              {c.hint && <kbd>{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const SHORTCUTS = [
  ["Ctrl K", "sc.palette"],
  ["Ctrl /", "sc.help"],
  ["Ctrl N", "sc.new"],
  ["Ctrl O", "sc.open"],
  ["Ctrl ,", "sc.settings"],
  ["Ctrl B", "sc.sidebar"],
  ["Ctrl J", "sc.panel"],
  ["Ctrl L", "sc.focus"],
  ["Ctrl E", "sc.mode"],
  ["Ctrl .", "sc.stop"],
  ["Enter", "sc.send"],
  ["Shift Enter", "sc.newline"],
  ["Esc", "sc.close"],
];

export function ShortcutsHelp({ onClose, Modal }) {
  const t = useT();
  return (
    <Modal title={t("sc.title")} onClose={onClose} width={520}>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>{t(d)}</td>
              <td className="right">{k.split(" ").map((p, i) => <kbd key={i}>{p}</kbd>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint small mt">{t("sc.note")}</p>
    </Modal>
  );
}
