import React, { useMemo, useState } from "react";
import { lineDiff, diffStats, collapseContext } from "../lib/diff.js";
import { useT } from "../lib/i18n.js";

/** Faqat o'zgargan bo'laklar (yoki to'liq fayl) ko'rsatiladigan diff. */
export default function DiffView({ oldText, newText, maxRows = 1200, compact = false }) {
  const t = useT();
  const [full, setFull] = useState(false);
  const rows = useMemo(() => lineDiff(oldText || "", newText || ""), [oldText, newText]);
  const shown = useMemo(() => (full ? rows : collapseContext(rows)), [rows, full]);
  const { add, del } = diffStats(rows);
  return (
    <div className={`diff diff-box ${compact ? "compact" : ""}`}>
      <div className="diff-caption row">
        <span className="mono tnum"><span className="add">+{add}</span> <span className="del">−{del}</span></span>
        <button type="button" className="link-btn" onClick={() => setFull((f) => !f)}>{full ? t("diff.changedOnly") : t("diff.showAll")}</button>
      </div>
      <div className="diff-scroll">
        {shown.slice(0, maxRows).map((r, i) => r.t === "gap" ? (
          <div key={i} className="diff-gap">⋯ {t("diff.gap", { n: r.count })}</div>
        ) : (
          <div key={i} className={`diff-row ${r.t}`}>
            <span className="ln">{r.a ?? ""}</span>
            <span className="ln">{r.b ?? ""}</span>
            <span className="sign">{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>
            <span className="txt">{r.text || " "}</span>
          </div>
        ))}
        {shown.length > maxRows && <div className="diff-more">⋯ {t("diff.more", { n: shown.length - maxRows })}</div>}
      </div>
    </div>
  );
}
