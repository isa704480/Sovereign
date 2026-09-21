import React, { useEffect, useRef, useState } from "react";

const S = window.sovereign;

export default function ModelPicker({ baseUrl, label, onSelect }) {
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState(null);
  const [fam, setFam] = useState(null);
  const [models, setModels] = useState(null);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  const api = (qs) => fetch(`${baseUrl.replace(/\/$/, "")}/api/models${qs}`).then((r) => r.json()).catch(() => ({}));

  useEffect(() => {
    if (open && !families) api("?families=1").then((d) => setFamilies(d.families ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (q.trim()) setModels((await api(`?q=${encodeURIComponent(q)}&limit=50`)).models ?? []);
      else if (fam) setModels((await api(`?family=${fam.key}&limit=60`)).models ?? []);
      else setModels(null);
    }, q ? 260 : 0);
    return () => clearTimeout(t);
  }, [q, fam, open]);

  const choose = (id, name) => {
    S?.setModel(id);
    onSelect?.(id, name);
    setOpen(false);
    setFam(null);
    setQ("");
  };

  return (
    <div ref={ref} className="mp">
      <button className="chip" onClick={() => setOpen((o) => !o)}>
        <span className="cdot">✦</span>{label || "Auto"}
      </button>
      {open && (
        <div className="mp-menu">
          <button className="mp-item" onClick={() => choose("", "Auto")}>
            <span className="mp-mark">✦</span><b>SOVEREIGN Auto</b><span className="dim"> — eng yaxshisini tanlaydi</span>
          </button>
          <div className="mp-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="qidirish: claude, gemini…" />
          </div>
          {fam && !q && (
            <button className="mp-back" onClick={() => setFam(null)}>← {fam.label}</button>
          )}
          <div className="mp-list">
            {!q && !fam && (families || []).map((f) => (
              <button key={f.key} className="mp-item" onClick={() => setFam(f)}>
                <span className="mp-mark">✦</span>{f.label}<span className="mp-count">{f.count}</span><span className="mp-arrow">›</span>
              </button>
            ))}
            {(q || fam) && (models || []).map((m) => (
              <button key={m.id} className="mp-item mono" onClick={() => choose(m.id, m.id.split("/").pop())} title={m.id}>
                <span className="mp-mark">✦</span><span className="mp-id">{m.id}</span>
              </button>
            ))}
            {(q || fam) && models && models.length === 0 && <div className="dim mp-empty">Topilmadi</div>}
          </div>
        </div>
      )}
    </div>
  );
}
