import React, { useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

/** Yassilangan, klaviatura bilan boshqariladigan fayl daraxti (role=tree). */
export default function FileTree({ nodes, onOpen, activePath, changed }) {
  const t = useT();
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const out = [];
    const q = filter.trim().toLowerCase();
    if (q) {
      const walk = (list, depth) => list.forEach((n) => {
        if (!n.dir && n.name.toLowerCase().includes(q)) out.push({ ...n, depth: 0, rel: n.path });
        if (n.dir) walk(n.children || [], depth + 1);
      });
      walk(nodes, 0);
      return out.slice(0, 300);
    }
    const walk = (list, depth) => list.forEach((n) => {
      const isOpen = !!open[n.path];
      out.push({ ...n, depth, isOpen });
      if (n.dir && isOpen) walk(n.children || [], depth + 1);
    });
    walk(nodes, 0);
    return out;
  }, [nodes, open, filter]);

  const onKey = (e, r) => {
    if (e.key === "ArrowRight" && r.dir && !r.isOpen) { e.preventDefault(); setOpen((o) => ({ ...o, [r.path]: true })); }
    else if (e.key === "ArrowLeft" && r.dir && r.isOpen) { e.preventDefault(); setOpen((o) => ({ ...o, [r.path]: false })); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      sib?.focus();
    }
  };

  return (
    <div className="tree-wrap">
      <div className="tree-filter">
        <Icon name="search" size={13} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("files.filter")} aria-label={t("files.filter")} />
      </div>
      <div role="tree" aria-label={t("files.title")} className="tree">
        {rows.length === 0 && <div className="muted small pad-sm">{filter ? t("files.noMatch") : t("files.emptyFolder")}</div>}
        {rows.map((r) => (
          <button
            key={r.path}
            type="button"
            role="treeitem"
            aria-expanded={r.dir ? r.isOpen : undefined}
            aria-level={r.depth + 1}
            className={`tree-row ${r.dir ? "dir" : "file"} ${activePath === r.path ? "active" : ""}`}
            style={{ paddingLeft: 8 + r.depth * 14 }}
            onClick={() => (r.dir ? setOpen((o) => ({ ...o, [r.path]: !o[r.path] })) : onOpen(r))}
            onKeyDown={(e) => onKey(e, r)}
            title={r.path}
          >
            {r.dir ? <Icon name="chevron" size={12} className={`caret ${r.isOpen ? "open" : ""}`} /> : <span className="caret-space" />}
            <Icon name={r.dir ? (r.isOpen ? "folderOpen" : "folder") : "file"} size={14} className={r.dir ? "icon-dir" : "icon-file"} />
            <span className="trunc grow">{r.name}</span>
            {changed?.has(r.path.replace(/\\/g, "/").toLowerCase()) &&<span className="dot dot-warn" title={t("files.changed")} />}
          </button>
        ))}
      </div>
    </div>
  );
}
