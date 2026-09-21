import React, { useMemo } from "react";
import { lineDiff, diffStats } from "../lib/diff.js";

const C = { border: "rgba(255,255,255,0.08)", faint: "#6A6A70", muted: "#9B9BA0", addFg: "#7FD6A0", addBg: "#16281E", delFg: "#F08A94", delBg: "#2A1619" };

export default function DiffView({ oldText, newText, maxRows = 600 }) {
  const rows = useMemo(() => lineDiff(oldText || "", newText || ""), [oldText, newText]);
  const { add, del } = diffStats(rows);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: "#0d0f18" }}>
      <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: "var(--mono)", fontSize: 11.5 }}>
        <span style={{ color: C.addFg }}>+{add}</span> <span style={{ color: C.delFg }}>−{del}</span>
      </div>
      <div style={{ maxHeight: "52vh", overflow: "auto", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.7 }}>
        {rows.slice(0, maxRows).map((r, i) => (
          <div key={i} style={{ display: "flex", background: r.t === "add" ? C.addBg : r.t === "del" ? C.delBg : "transparent" }}>
            <span style={{ flex: "none", width: 40, textAlign: "right", padding: "0 6px", color: C.faint, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{r.a ?? ""}</span>
            <span style={{ flex: "none", width: 40, textAlign: "right", padding: "0 6px", color: C.faint, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{r.b ?? ""}</span>
            <span style={{ flex: "none", width: 16, textAlign: "center", color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : C.faint }}>{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", paddingRight: 10, color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : "#cfd4ea" }}>{r.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
