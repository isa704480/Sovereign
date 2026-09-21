import React, { useEffect, useMemo } from "react";
import { lineDiff, diffStats } from "../lib/diff.js";

const C = { surface: "#1A1A1C", surface2: "#232327", border: "rgba(255,255,255,0.08)", text: "#ECECEC", muted: "#9B9BA0", faint: "#6A6A70", accent: "#D97757", warn: "#E0A458", addFg: "#7FD6A0", addBg: "#16281E", delFg: "#F08A94", delBg: "#2A1619" };

export default function ConfirmDialog({ req, onReply }) {
  const meta = req?.meta || {};
  const isWrite = meta.tool === "write_file" && req._change;
  const isCmd = meta.tool === "run_command";
  const rows = useMemo(() => (isWrite ? lineDiff(req._change.before || "", req._change.after || "") : []), [req]);
  const stat = isWrite ? diffStats(rows) : { add: 0, del: 0 };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Enter") onReply(true); if (e.key === "Escape") onReply(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onReply]);

  const title = isWrite ? (meta.exists ? "O‘zgarishni tasdiqlash" : "Yangi fayl") : isCmd ? "Buyruqni bajarish" : "Tasdiqlash";
  const sub = isWrite ? meta.path : isCmd ? "" : "";

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 36, background: "rgba(10,10,11,0.58)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animation: "dcFade 160ms ease-out" }}>
      <div style={{ width: "100%", maxWidth: isWrite ? 820 : 480, maxHeight: "100%", display: "flex", flexDirection: "column", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 28px 64px rgba(0,0,0,.6)", overflow: "hidden", animation: "dcRise 200ms ease-out" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.warn }} />
          <span style={{ flex: "none", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</span>
          {sub && <span className="trunc mono" style={{ fontSize: 11.5, color: C.muted }}>{sub}</span>}
          {isWrite && <span className="mono tnum" style={{ marginLeft: "auto", display: "flex", gap: 9, fontSize: 11.5 }}><span style={{ color: C.addFg }}>+{stat.add}</span><span style={{ color: C.delFg }}>−{stat.del}</span></span>}
          <button className="h-surf" onClick={() => onReply(false)} style={{ marginLeft: isWrite ? 0 : "auto", width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7, color: C.faint }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.7, padding: isWrite ? "8px 0" : "0" }}>
          {isWrite ? (
            <>
              <div style={{ padding: "4px 18px 8px", color: C.faint, fontSize: 11 }}>{rows.length} qator diff</div>
              {rows.slice(0, 600).map((r, i) => (
                <div key={i} style={{ display: "flex", background: r.t === "add" ? C.addBg : r.t === "del" ? C.delBg : "transparent" }}>
                  <span className="tnum" style={{ flex: "none", width: 44, textAlign: "right", paddingRight: 10, color: C.faint }}>{r.a ?? ""}</span>
                  <span className="tnum" style={{ flex: "none", width: 44, textAlign: "right", paddingRight: 12, color: C.faint }}>{r.b ?? ""}</span>
                  <span style={{ flex: "none", width: 16, color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : C.faint }}>{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : C.muted, paddingRight: 18 }}>{r.text || " "}</span>
                </div>
              ))}
            </>
          ) : isCmd ? (
            <div style={{ padding: 18 }}><div style={{ color: C.warn, background: "#0e101c", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>$ {meta.command}</div></div>
          ) : (
            <div style={{ padding: 18, fontFamily: "system-ui", color: C.muted, fontSize: 13 }}>{req.question || "Bu amalni bajaraymi?"}</div>
          )}
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11.5, color: C.faint }}>{isWrite ? meta.path?.split(/[\\/]/).pop() : ""}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="h-text" onClick={() => onReply(false)} style={{ height: 32, padding: "0 14px", borderRadius: 9, fontSize: 12.5, color: C.muted, background: C.surface, border: `1px solid ${C.border}` }}>Bekor qilish</button>
            <button className="h-bright" onClick={() => onReply(true)} style={{ height: 32, padding: "0 16px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: C.accent, color: "#1A1214" }}>Qo‘llash</button>
          </span>
        </div>
      </div>
    </div>
  );
}
