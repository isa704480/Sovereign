import React, { useMemo } from "react";
import { lineDiff, diffStats } from "../lib/diff.js";

const SIGN = { add: "+", del: "-", ctx: " " };

export default function DiffView({ oldText, newText, maxRows = 600 }) {
  const rows = useMemo(() => lineDiff(oldText || "", newText || ""), [oldText, newText]);
  const { add, del } = diffStats(rows);
  const shown = rows.slice(0, maxRows);

  return (
    <div className="diff">
      <div className="diff-stat">
        <span className="add">+{add}</span> <span className="del">-{del}</span>
      </div>
      <div className="diff-body">
        {shown.map((r, i) => (
          <div key={i} className={`dl ${r.t}`}>
            <span className="ln">{r.a ?? ""}</span>
            <span className="ln">{r.b ?? ""}</span>
            <span className="sg">{SIGN[r.t]}</span>
            <span className="dtext">{r.text || " "}</span>
          </div>
        ))}
        {rows.length > maxRows && <div className="dl ctx"><span className="ln" /><span className="ln" /><span className="sg" /><span className="dtext">… ({rows.length - maxRows} qator ko'proq)</span></div>}
      </div>
    </div>
  );
}
