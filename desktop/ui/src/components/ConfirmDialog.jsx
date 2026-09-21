import React, { useEffect, useState } from "react";
import DiffView from "./DiffView.jsx";

const S = window.sovereign;

export default function ConfirmDialog({ req, onReply }) {
  const [oldText, setOldText] = useState(null);
  const meta = req?.meta;
  const isWrite = meta?.tool === "write_file";

  useEffect(() => {
    let alive = true;
    if (isWrite && meta.exists) {
      S?.fsRead(meta.path).then((r) => alive && setOldText(r?.content ?? ""));
    } else {
      setOldText("");
    }
    return () => { alive = false; };
  }, [req]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") onReply(true);
      if (e.key === "Escape") onReply(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onReply]);

  if (!req) return null;

  return (
    <div className="scrim">
      <div className={`dialog ${isWrite ? "wide" : ""}`}>
        <div className="dtitle">
          {isWrite ? (meta.exists ? "Faylni o‘zgartirish" : "Yangi fayl") : meta?.tool === "run_command" ? "Buyruqni bajarish" : "Tasdiqlash"}
        </div>

        {isWrite ? (
          <>
            <div className="dpath mono">{meta.path}</div>
            <DiffView oldText={oldText} newText={meta.content} />
          </>
        ) : meta?.tool === "run_command" ? (
          <div className="dcmd mono">▶ {meta.command}</div>
        ) : (
          <div className="dmsg">{req.question || "Bu amalni bajaraymi?"}</div>
        )}

        <div className="dbtns">
          <button className="btn ghost" onClick={() => onReply(false)}>Bekor</button>
          <button className="btn primary" onClick={() => onReply(true)}>Ha, davom et</button>
        </div>
      </div>
    </div>
  );
}
