import React, { useEffect, useRef, useState } from "react";

const S = window.sovereign;
const C = { surface: "#1A1A1C", surface2: "#232327", border: "rgba(255,255,255,0.08)", text: "#ECECEC", muted: "#9B9BA0", faint: "#6A6A70", accent: "#7C6FF7", ok: "#6BBF8A" };

export default function ModelPicker({ baseUrl, label, onSelect }) {
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [fam, setFam] = useState(null);
  const [models, setModels] = useState(null);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const api = (qs) => fetch(`${baseUrl.replace(/\/$/, "")}/api/models${qs}`).then((r) => r.json()).catch(() => ({}));

  useEffect(() => { if (open && !families) api("?families=1").then((d) => { setFamilies(d.families ?? []); setFeatured(d.featured ?? []); setFam((d.families ?? [])[0] ?? null); }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (q.trim()) setModels((await api(`?q=${encodeURIComponent(q)}&limit=60`)).models ?? []);
      else if (fam) setModels((await api(`?family=${fam.key}&limit=80`)).models ?? []);
    }, q ? 240 : 0);
    return () => clearTimeout(t);
  }, [q, fam, open]);

  const choose = (id, name) => { S?.setModel(id); onSelect?.(id, name); setOpen(false); setQ(""); };

  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <button className="h-surf2 h-lift" onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 11px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, fontSize: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok }} />
        <span style={{ fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{label || "Auto"}</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={1.5} strokeLinecap="round"><path d="M7 10l5 5 5-5" /></svg>
      </button>

      {open && (
        <div style={{ position: "absolute", top: 38, right: 0, width: 452, background: "rgba(35,35,39,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 20px 48px rgba(0,0,0,.55)", overflow: "hidden", zIndex: 60, animation: "dcPop 180ms ease-out" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={1.5} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Model qidirish… (claude, gemini, deepseek)" style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5 }} />
          </div>
          {featured.length > 0 && !q && (
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.accent }}>✦</span> Tekin — tavsiya <span style={{ color: C.ok, textTransform: "none", letterSpacing: 0 }}>≥20M/oy</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {featured.map((m) => (
                  <button key={m.id} className="h-surf2" onClick={() => choose(m.id, m.label)} title={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 8, textAlign: "left", background: label === m.label ? C.surface2 : "transparent" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: C.ok }} />
                    <span className="trunc" style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", minHeight: 238 }}>
            <div style={{ width: 150, flex: "none", borderRight: `1px solid ${C.border}`, padding: 8, maxHeight: 300, overflowY: "auto" }}>
              <button className="h-surf2" onClick={() => choose("", "Auto")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 9px", borderRadius: 8, textAlign: "left", fontSize: 12, color: C.text }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, flex: "none", background: C.accent }} /><span style={{ fontWeight: 600 }}>Auto</span>
              </button>
              {!families && <div style={{ padding: 10, fontSize: 11.5, color: C.faint }}>Yuklanyapti…</div>}
              {(families || []).map((f) => (
                <button key={f.key} className="h-surf2" onClick={() => { setFam(f); setQ(""); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 9px", borderRadius: 8, textAlign: "left", fontSize: 12, color: fam?.key === f.key && !q ? C.text : C.muted, background: fam?.key === f.key && !q ? C.surface2 : "transparent" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, flex: "none", background: f.key === "claude" ? C.accent : C.muted }} />
                  <span className="trunc" style={{ flex: 1 }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: C.faint }} className="tnum">{f.count}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: 8, maxHeight: 300, overflowY: "auto" }}>
              {!models && <div style={{ padding: 26, textAlign: "center", fontSize: 12, color: C.faint }}>Yuklanyapti…</div>}
              {models && models.length === 0 && <div style={{ padding: 26, textAlign: "center", fontSize: 12, color: C.faint }}>Hech narsa topilmadi</div>}
              {(models || []).map((m) => (
                <button key={m.id} className="h-surf" onClick={() => choose(m.id, m.id.split("/").pop())} title={m.id} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", borderRadius: 9, textAlign: "left" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="trunc mono" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text }}>{m.id}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: C.faint }}>
                      {m.owner}{m.context ? ` · ${Math.round(m.context / 1000)}k` : ""}{m.tools ? " · tools" : ""}{m.vision ? " · vision" : ""}{m.reasoning ? " · reasoning" : ""}
                    </span>
                  </span>
                  {m.id.split("/").pop() === label && <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 3 }}><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "9px 12px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.faint, display: "flex", gap: 14 }}>
            <span>oila → model</span><span>qidiruv 1743 model bo‘yicha</span><span>esc yopish</span>
          </div>
        </div>
      )}
    </div>
  );
}
