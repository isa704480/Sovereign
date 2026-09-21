import React, { useState } from "react";

const S = window.sovereign;
const short = (p) => p.split(/[\\/]/).slice(-2).join("/");

export default function ChangesBar({ changes, onUndo, onView }) {
  const [open, setOpen] = useState(false);
  if (!changes.length) return null;

  const undoOne = async (ch) => {
    await S?.fsWrite(ch.path, ch.before);
    onUndo(ch);
  };
  const undoAll = async () => {
    for (const ch of changes) await S?.fsWrite(ch.path, ch.before);
    changes.forEach(onUndo);
  };

  return (
    <div className="changes">
      <div className="changes-bar" onClick={() => setOpen((o) => !o)}>
        <span className="cb-icon">✎</span>
        <b>{changes.length} fayl o‘zgardi</b>
        <span className="spacer" />
        <button className="cb-undo" onClick={(e) => { e.stopPropagation(); undoAll(); }}>Barchasini bekor</button>
        <span className="term-caret">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="changes-list">
          {changes.map((ch, i) => (
            <div key={ch.path + i} className="ch-row">
              <button className="ch-path mono" onClick={() => onView(ch)} title={ch.path}>{short(ch.path)}</button>
              <span className="ch-stat">{ch.before ? "o‘zgartirildi" : "yangi"}</span>
              <button className="ch-undo" onClick={() => undoOne(ch)}>bekor</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
