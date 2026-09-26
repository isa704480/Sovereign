import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { lineDiff, diffStats, collapseContext } from "../lib/diff.js";
import { useFocusTrap } from "./Modal.jsx";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";
import { riskText } from "../lib/cliText.js";

// Dialogda bir martada chiziladigan diff qatorlari (o'zgarmagan qismlar yig'ilgandan keyin).
const MAX_RENDER = 2000;

/**
 * Xavf sababi: main meta.riskReason (classifyCommand, asl registr) beradi; eski/soxta
 * manbada — CLI savolidan ajratiladi: "⚠️  SABAB — bajarilsinmi: ...". Matn UI tilida.
 */
function riskReason(meta, question, t) {
  if (meta.riskReason) return riskText(meta.riskReason, t);
  const m = /⚠️?\s*(.+?)\s+—\s+bajarilsinmi:/su.exec(String(question || ""));
  return m ? riskText(m[1].trim(), t) : "";
}

function Banner({ tone = "warn", children }) {
  return (
    <div role="alert" className={`banner banner-${tone}`}>
      <Icon name="alert" size={15} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Tasdiq dialogi. Xavfsizlik: fokus "Bekor qilish"da boshlanadi, Enter faqat
 * fokusdagi tugmani bosadi (hujjat darajasida avtomatik tasdiqlash YO'Q),
 * Escape — bekor qilish, Tab dialogdan chiqmaydi.
 */
export default function ConfirmDialog({ req, onReply }) {
  const t = useT();
  const hid = useId();
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

  const ref = useRef(null);
  const cancelRef = useRef(null);
  useFocusTrap(ref, { initialFocus: cancelRef, onEscape: () => onReply(false) });

  // Ogohlantirishlar: runTool meta'dagi outside/autoRun/risky belgilari aniq ko'rsatiladi.
  const warnings = [];
  if (meta.outside) warnings.push({ tone: "danger", text: <>{t("confirm.outside")} <span className="mono">{meta.path}</span></> });
  if (meta.autoRun) warnings.push({ tone: "danger", text: t("confirm.autoRun") });
  if (beforeUnknown) warnings.push({ tone: "danger", text: t("confirm.beforeUnknown") });
  if (isCmd && meta.risky) {
    const why = riskReason(meta, req.question, t);
    warnings.push({ tone: "danger", text: <>{t("confirm.risky")}{why ? <>: <b>{why}</b></> : ""}. {t("confirm.riskyHint")}</> });
  }
  if (hiddenRows) warnings.push({ tone: "warn", text: t("confirm.hidden", { rows: hiddenRows, changes: hiddenChanges }) });

  const danger = warnings.some((w) => w.tone === "danger");
  const title = isWrite
    ? meta.exists ? t("confirm.titleEdit") : t("confirm.titleNew")
    : isCmd ? (meta.risky ? t("confirm.titleRisky") : t("confirm.titleCmd"))
    : meta.tool === "make_dir" ? t("confirm.titleDir")
    : meta.tool === "read_file" || meta.tool === "list_dir" ? t("confirm.titleRead")
    : t("confirm.title");
  const approveDisabled = hiddenRows > 0 && !ackHidden;

  return (
    <div className="overlay">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={hid} className={`modal confirm ${danger ? "modal-danger" : ""}`} style={{ maxWidth: isWrite ? 880 : 560 }}>
        <div className="modal-head">
          <span className={`dot ${danger ? "dot-err" : "dot-warn"}`} aria-hidden="true" />
          <h2 id={hid} className="modal-title">{title}</h2>
          {isWrite && <span className="trunc mono muted small">{meta.path}</span>}
          {isWrite && (
            <span className="mono tnum small diffstat" aria-label={t("diff.stats", { add: stat.add, del: stat.del })}>
              <span className="add">+{stat.add}</span>
              <span className="del">−{stat.del}</span>
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="confirm-warnings">
            {warnings.map((w, i) => <Banner key={i} tone={w.tone}>{w.text}</Banner>)}
          </div>
        )}

        <div className="confirm-body">
          {isWrite ? (
            <div className="diff">
              <div className="diff-caption">{t("confirm.diffCaption", { n: rows.length })}</div>
              {shown.slice(0, MAX_RENDER).map((r, i) => r.t === "gap" ? (
                <div key={i} className="diff-gap">⋯ {t("diff.gap", { n: r.count })}</div>
              ) : (
                <div key={i} className={`diff-row ${r.t}`}>
                  <span className="ln">{r.a ?? ""}</span>
                  <span className="ln">{r.b ?? ""}</span>
                  <span className="sign">{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>
                  <span className="txt">{r.text || " "}</span>
                </div>
              ))}
              {hiddenRows > 0 && <div className="diff-more">⋯ {t("confirm.hiddenShort", { rows: hiddenRows, changes: hiddenChanges })}</div>}
            </div>
          ) : isCmd ? (
            <div className="pad">
              <div className="label-sm">{t("confirm.cmdLabel")}</div>
              <pre className={`cmd ${meta.risky ? "cmd-risky" : ""}`}>$ {meta.command}</pre>
              <p className="muted small">{t("confirm.cmdCwd")}</p>
            </div>
          ) : (
            // CLI savoli o'zbekcha — o'rniga meta.tool bo'yicha UI tilidagi savol + aniq yo'l.
            <div className="pad question">
              {["list_dir", "read_file", "make_dir"].includes(meta.tool) ? t(`confirm.q.${meta.tool}`) : t("confirm.default")}
              {meta.path && <pre className="cmd">{meta.path}</pre>}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {hiddenRows > 0 ? (
            <label className="ack">
              <input type="checkbox" checked={ackHidden} onChange={(e) => setAckHidden(e.target.checked)} />
              {t("confirm.ack")}
            </label>
          ) : (
            <span className="muted small">{t("confirm.footHint")}</span>
          )}
          <span className="foot-actions">
            <button ref={cancelRef} type="button" className="btn" onClick={() => onReply(false)}>{t("confirm.cancel")}</button>
            <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={approveDisabled} onClick={() => onReply(true)}>
              {isCmd ? t("confirm.run") : t("confirm.apply")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
