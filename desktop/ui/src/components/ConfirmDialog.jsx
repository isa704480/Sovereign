import React, { useEffect, useMemo, useRef, useState } from "react";
import { lineDiff, diffStats, collapseContext } from "../lib/diff.js";

const C = { surface: "#1A1A1C", surface2: "#232327", border: "rgba(255,255,255,0.08)", text: "#ECECEC", muted: "#9B9BA0", faint: "#6A6A70", accent: "#7C6FF7", warn: "#E0A458", danger: "#F08A94", dangerBg: "rgba(240,138,148,0.10)", warnBg: "rgba(224,164,88,0.10)", addFg: "#7FD6A0", addBg: "#16281E", delFg: "#F08A94", delBg: "#2A1619" };

// Dialogda bir martada chiziladigan diff qatorlari (o'zgarmagan qismlar yig'ilgandan keyin).
const MAX_RENDER = 2000;

/** runTool savolidan xavf sababini ajratadi: "⚠️  SABAB — bajarilsinmi: ..." */
function riskReason(question) {
  const m = /⚠️?\s*(.+?)\s+—\s+bajarilsinmi:/su.exec(String(question || ""));
  return m ? m[1].trim() : "";
}

function Banner({ tone = "warn", children }) {
  const danger = tone === "danger";
  return (
    <div role="alert" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 12px", borderRadius: 9, fontFamily: "system-ui", fontSize: 12.5, lineHeight: 1.5, color: danger ? C.danger : C.warn, background: danger ? C.dangerBg : C.warnBg, border: `1px solid ${danger ? "rgba(240,138,148,0.35)" : "rgba(224,164,88,0.35)"}` }}>
      <span aria-hidden="true" style={{ flex: "none", fontWeight: 700 }}>⚠</span>
      <span style={{ wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

export default function ConfirmDialog({ req, onReply }) {
  const meta = req?.meta || {};
  const change = req?._change;
  const isWrite = meta.tool === "write_file" && !!change;
  const isCmd = meta.tool === "run_command";
  const beforeUnknown = isWrite && !!change.beforeUnknown;
  const rows = useMemo(() => (isWrite ? lineDiff(beforeUnknown ? "" : change.before || "", change.after || "") : []), [req]);
  const shown = useMemo(() => collapseContext(rows), [rows]);
  const stat = isWrite ? diffStats(rows) : { add: 0, del: 0 };
  const hiddenRows = Math.max(0, shown.length - MAX_RENDER);
  const hiddenChanges = hiddenRows ? shown.slice(MAX_RENDER).filter((r) => r.t === "add" || r.t === "del").length : 0;
  const [ackHidden, setAckHidden] = useState(false);
  useEffect(() => setAckHidden(false), [req?.id]); // har yangi so'rovda rozilik qaytadan

  // Hujjat darajasidagi Enter xavfli buyruqni avtomatik tasdiqlardi (hatto fokus
  // "Bekor qilish"da yoki orqadagi textarea'da bo'lsa ham). Endi: fokus xavfsiz
  // tugmaga o'tadi, Enter faqat fokusdagi tugmani bosadi; Escape — bekor qilish.
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onReply(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onReply]);

  // Ogohlantirishlar: runTool meta'dagi outside/autoRun/risky belgilari aniq ko'rsatiladi.
  const warnings = [];
  if (meta.outside) warnings.push({ tone: "danger", text: <>Ish papkasidan <b>TASHQARIDA</b>: <span className="mono">{meta.path}</span></> });
  if (meta.autoRun) warnings.push({ tone: "danger", text: "Bu fayl ishga tushganda kod bajaradi (npm skriptlari, VS Code tasks, CI, git hooks, .env) — tarkibini diqqat bilan tekshiring." });
  if (beforeUnknown) warnings.push({ tone: "danger", text: "Mavjud fayl TO‘LIQ almashtiriladi — eski tarkib juda katta yoki o‘qib bo‘lmadi, shuning uchun diff emas, faqat yangi tarkib ko‘rsatilgan." });
  if (isCmd && meta.risky) warnings.push({ tone: "danger", text: <>Xavfli buyruq{riskReason(req.question) ? <>: <b>{riskReason(req.question)}</b></> : ""}. Nima qilishini tushunmasangiz — bekor qiling.</> });
  if (hiddenRows) warnings.push({ tone: "warn", text: `Diff juda uzun: oxirgi ${hiddenRows} qator (${hiddenChanges} ta o‘zgarish) bu oynada ko‘rsatilmadi.` });

  const danger = warnings.some((w) => w.tone === "danger");
  const title = isWrite ? (meta.exists ? "O‘zgarishni tasdiqlash" : "Yangi fayl") : isCmd ? (meta.risky ? "Xavfli buyruqni bajarish" : "Buyruqni bajarish") : "Tasdiqlash";
  const sub = isWrite ? meta.path : "";
  const approveDisabled = hiddenRows > 0 && !ackHidden;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 36, background: "rgba(10,10,11,0.58)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animation: "dcFade 160ms ease-out" }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ width: "100%", maxWidth: isWrite ? 820 : 520, maxHeight: "100%", display: "flex", flexDirection: "column", background: C.surface2, border: `1px solid ${danger ? "rgba(240,138,148,0.35)" : C.border}`, borderRadius: 16, boxShadow: "0 28px 64px rgba(0,0,0,.6)", overflow: "hidden", animation: "dcRise 200ms ease-out" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: danger ? C.danger : C.warn }} />
          <span style={{ flex: "none", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em", color: danger ? C.danger : C.text }}>{title}</span>
          {sub && <span className="trunc mono" style={{ fontSize: 11.5, color: C.muted }}>{sub}</span>}
          {isWrite && <span className="mono tnum" style={{ marginLeft: "auto", display: "flex", gap: 9, fontSize: 11.5 }}><span style={{ color: C.addFg }}>+{stat.add}</span><span style={{ color: C.delFg }}>−{stat.del}</span></span>}
          <button className="h-surf" aria-label="Yopish" onClick={() => onReply(false)} style={{ marginLeft: isWrite ? 0 : "auto", width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7, color: C.faint }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {warnings.length > 0 && (
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 8, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
            {warnings.map((w, i) => <Banner key={i} tone={w.tone}>{w.text}</Banner>)}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.7, padding: isWrite ? "8px 0" : "0" }}>
          {isWrite ? (
            <>
              <div style={{ padding: "4px 18px 8px", color: C.faint, fontSize: 11 }}>{rows.length} qator · faqat o‘zgargan bo‘laklar ko‘rsatiladi</div>
              {shown.slice(0, MAX_RENDER).map((r, i) => r.t === "gap" ? (
                <div key={i} style={{ padding: "2px 18px", color: C.faint, fontSize: 11, background: "rgba(255,255,255,0.03)" }}>⋯ {r.count} ta o‘zgarmagan qator</div>
              ) : (
                <div key={i} style={{ display: "flex", background: r.t === "add" ? C.addBg : r.t === "del" ? C.delBg : "transparent" }}>
                  <span className="tnum" style={{ flex: "none", width: 44, textAlign: "right", paddingRight: 10, color: C.faint }}>{r.a ?? ""}</span>
                  <span className="tnum" style={{ flex: "none", width: 44, textAlign: "right", paddingRight: 12, color: C.faint }}>{r.b ?? ""}</span>
                  <span style={{ flex: "none", width: 16, color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : C.faint }}>{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: r.t === "add" ? C.addFg : r.t === "del" ? C.delFg : C.muted, paddingRight: 18 }}>{r.text || " "}</span>
                </div>
              ))}
              {hiddenRows > 0 && (
                <div style={{ margin: "8px 18px", padding: "8px 12px", borderRadius: 8, color: C.warn, background: C.warnBg, fontFamily: "system-ui", fontSize: 12 }}>
                  ⋯ yana {hiddenRows} qator ({hiddenChanges} ta o‘zgarish) ko‘rsatilmadi
                </div>
              )}
            </>
          ) : isCmd ? (
            <div style={{ padding: 18 }}>
              <pre style={{ margin: 0, color: meta.risky ? C.danger : C.warn, background: "#0e101c", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "var(--mono)", fontSize: 12 }}>$ {meta.command}</pre>
            </div>
          ) : (
            <div style={{ padding: 18, fontFamily: "system-ui", color: C.muted, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{req.question || "Bu amalni bajaraymi?"}</div>
          )}
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
          {hiddenRows > 0 ? (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.warn, cursor: "pointer" }}>
              <input type="checkbox" checked={ackHidden} onChange={(e) => setAckHidden(e.target.checked)} />
              Ko‘rsatilmagan qismni ko‘rmasdan qo‘llashga roziman
            </label>
          ) : (
            <span style={{ fontSize: 11.5, color: C.faint }}>{isWrite ? meta.path?.split(/[\\/]/).pop() : ""}</span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button ref={cancelRef} className="h-text" onClick={() => onReply(false)} style={{ height: 32, padding: "0 14px", borderRadius: 9, fontSize: 12.5, color: C.muted, background: C.surface, border: `1px solid ${C.border}` }}>Bekor qilish</button>
            <button className="h-bright" disabled={approveDisabled} onClick={() => onReply(true)} style={{ height: 32, padding: "0 16px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: approveDisabled ? C.surface : danger ? "#C2555F" : C.accent, color: approveDisabled ? C.faint : "#ffffff", cursor: approveDisabled ? "not-allowed" : "pointer" }}>Qo‘llash</button>
          </span>
        </div>
      </div>
    </div>
  );
}
