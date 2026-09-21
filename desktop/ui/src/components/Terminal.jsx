import React, { useEffect, useRef } from "react";

export default function Terminal({ items, open, onToggle, onClear }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items, open]);

  return (
    <div className={`term ${open ? "open" : ""}`}>
      <div className="term-bar" onClick={onToggle}>
        <span className="term-title">▸ Terminal</span>
        <span className="dim term-count">{items.length ? `${items.length} buyruq` : "bo‘sh"}</span>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="term-clear" onClick={(e) => { e.stopPropagation(); onClear(); }}>tozalash</button>
        )}
        <span className="term-caret">{open ? "▾" : "▴"}</span>
      </div>
      {open && (
        <div className="term-body" ref={bodyRef}>
          {items.length === 0 && <div className="dim term-empty">Hali buyruq ishga tushmagan.</div>}
          {items.map((it, i) => (
            <div key={i} className="term-block">
              <div className="term-cmd">$ {it.command}</div>
              <pre className="term-out">{it.output}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
