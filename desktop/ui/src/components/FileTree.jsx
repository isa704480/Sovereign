import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import { useT } from "../lib/i18n.js";

const S = () => window.sovereign;
const parentOf = (p) => String(p).replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "");

/** Main'dan kelgan xato kodi → UI tilidagi matn. */
function errText(r, t) {
  const code = String(r?.error ?? "");
  const text = t(`fsErr.${code}`, null, code || t("common.unknownError"));
  return r?.detail ? `${text} (${r.detail})` : text;
}

/** O'ng tugma menyusi (role=menu): strelkalar bilan yuriladi, Escape yopadi. */
function ContextMenu({ at, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button:not([disabled])")?.focus();
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [onClose]);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...ref.current.querySelectorAll("button:not([disabled])")];
    const i = els.indexOf(document.activeElement);
    els[(i + (e.key === "ArrowDown" ? 1 : els.length - 1) + els.length) % els.length]?.focus();
  };
  // Ekrandan chiqib ketmasin.
  const style = { left: Math.min(at.x, window.innerWidth - 230), top: Math.min(at.y, window.innerHeight - (items.length * 30 + 20)) };
  return (
    <div className="ctx-menu" role="menu" ref={ref} style={style} onKeyDown={onKey}>
      {items.map((it) =>
        it.sep ? (
          <span key={it.key} className="ctx-sep" role="separator" />
        ) : (
          <button key={it.key} type="button" role="menuitem" className={`ctx-item ${it.danger ? "danger" : ""}`} disabled={it.disabled} onClick={() => { onClose(); it.run(); }}>
            <Icon name={it.icon} size={13} />
            <span className="grow">{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

/** Ichki nom kiritish maydoni (yaratish / nomini o'zgartirish). */
function NameInput({ value, onDone, onCancel, label }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="tree-input"
      value={v}
      autoFocus
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); onDone(v); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
    />
  );
}

/**
 * Yassilangan, klaviatura bilan boshqariladigan fayl daraxti (role=tree) —
 * ochish, yaratish, nomini o'zgartirish, nusxalash, savatga o'chirish.
 * Har bir amalni main jarayon qayta tekshiradi (electron/files-ipc.mjs).
 */
export default function FileTree({ nodes, onOpen, activePath, changed, cwd, platform, onRefresh, onToast, onRenamed, onRemoved }) {
  const t = useT();
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, node }
  const [renaming, setRenaming] = useState(null); // { path, value }
  const [creating, setCreating] = useState(null); // { dir, kind, value }
  const [ask, setAsk] = useState(null); // { kind: "delete" | "tegma", … }
  const listRef = useRef(null);
  const busy = useRef(false);

  const rows = useMemo(() => {
    const out = [];
    const q = filter.trim().toLowerCase();
    if (q) {
      const walk = (list) => list.forEach((n) => {
        if (!n.dir && n.name.toLowerCase().includes(q)) out.push({ ...n, depth: 0 });
        if (n.dir) walk(n.children || []);
      });
      walk(nodes);
      return out.slice(0, 300);
    }
    const walk = (list, depth) => list.forEach((n) => {
      const isOpen = !!open[n.path];
      out.push({ ...n, depth, isOpen });
      if (n.dir && isOpen) walk(n.children || [], depth + 1);
    });
    walk(nodes, 0);
    // Yangi fayl/papka kiritish qatori — nishon papkadan keyin (ildiz uchun — eng boshida).
    if (creating) {
      const i = creating.dir === cwd ? -1 : out.findIndex((r) => r.path === creating.dir);
      const depth = i === -1 ? 0 : (out[i].depth ?? 0) + 1;
      out.splice(i + 1, 0, { path: "__new__", name: "", depth, creating: true });
    }
    return out;
  }, [nodes, open, filter, creating, cwd]);

  const targetDir = useCallback(
    (node) => {
      if (!node) return cwd;
      return node.dir ? node.path : parentOf(node.path);
    },
    [cwd],
  );

  // ---- Amallar ----------------------------------------------------------
  // fn(confirmTegma) → IPC. «Tegma» ro'yxatidagi yo'l — avval tasdiq so'raladi.
  const run = useCallback(
    async (fn, { onOk, confirmTegma = false } = {}) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const r = await fn(confirmTegma).catch(() => null);
        if (r?.error === "tegma") {
          setAsk({ kind: "tegma", rel: r.rel ?? "", run: () => run(fn, { onOk, confirmTegma: true }) });
          return;
        }
        if (!r?.ok) { onToast?.(errText(r, t), "err"); return; }
        onOk?.(r);
        onRefresh?.();
      } finally {
        busy.current = false;
      }
    },
    [onRefresh, onToast, t],
  );

  const startCreate = (kind, node) => {
    const dir = targetDir(node ?? rows.find((r) => r.path === sel));
    if (dir && dir !== cwd) setOpen((o) => ({ ...o, [dir]: true }));
    setFilter("");
    setCreating({ dir: dir || cwd, kind, value: "" });
  };

  const commitCreate = (name) => {
    const c = creating;
    setCreating(null);
    if (!c || !name.trim()) return;
    run((confirmTegma) => S().files.create({ dir: c.dir, name: name.trim(), kind: c.kind, confirmTegma }), {
      onOk: (r) => {
        onToast?.(t(c.kind === "folder" ? "files.folderCreated" : "files.fileCreated", { name: name.trim() }), "ok");
        setSel(r.path);
        if (c.kind === "file") onOpen?.({ path: r.path, name: name.trim() });
      },
    });
  };

  const commitRename = (node, name) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === node.name) return;
    run((confirmTegma) => S().files.rename({ path: node.path, name: name.trim(), confirmTegma }), {
      onOk: (r) => { onToast?.(t("files.renamed", { name: name.trim() }), "ok"); setSel(r.path); onRenamed?.(node.path, r.path); },
    });
  };

  const doTrash = (node) =>
    run((confirmTegma) => S().files.trash({ path: node.path, confirmTegma }), {
      onOk: () => { onToast?.(t("files.trashed", { name: node.name }), "ok"); onRemoved?.(node.path); if (sel === node.path) setSel(null); },
    });

  const doDuplicate = (node) =>
    run((confirmTegma) => S().files.duplicate({ path: node.path, confirmTegma }), {
      onOk: (r) => { onToast?.(t("files.duplicated", { name: r.rel }), "ok"); setSel(r.path); },
    });

  const menuItems = (node) => [
    { key: "open", icon: "eye", label: t("files.openInEditor"), disabled: node.dir, run: () => onOpen?.(node) },
    { key: "s1", sep: true },
    { key: "nf", icon: "filePlus", label: t("files.newFile"), run: () => startCreate("file", node) },
    { key: "nd", icon: "folderPlus", label: t("files.newFolder"), run: () => startCreate("folder", node) },
    { key: "s2", sep: true },
    { key: "rn", icon: "pencil", label: `${t("files.rename")} (F2)`, run: () => setRenaming({ path: node.path, value: node.name }) },
    { key: "dup", icon: "copy", label: t("files.duplicate"), disabled: node.dir, run: () => doDuplicate(node) },
    { key: "rv", icon: "external", label: t(platform === "darwin" ? "files.revealMac" : "files.reveal"), run: () => S().files.revealItem(node.path) },
    { key: "s3", sep: true },
    { key: "del", icon: "trash", label: t("files.delete"), danger: true, run: () => setAsk({ kind: "delete", node }) },
  ];

  const openMenuFor = (node, x, y) => { setSel(node.path); setMenu({ x, y, node }); };

  // ---- Klaviatura --------------------------------------------------------
  const move = (el, dir) => {
    const all = [...(listRef.current?.querySelectorAll('[role="treeitem"]') ?? [])];
    const i = all.indexOf(el);
    const next = all[i + dir];
    if (next) { next.focus(); setSel(next.dataset.path); }
  };
  const onKey = (e, r) => {
    if (renaming || creating) return;
    const k = e.key;
    if (k === "ArrowRight" && r.dir && !r.isOpen) { e.preventDefault(); setOpen((o) => ({ ...o, [r.path]: true })); }
    else if (k === "ArrowLeft" && r.dir && r.isOpen) { e.preventDefault(); setOpen((o) => ({ ...o, [r.path]: false })); }
    else if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); move(e.currentTarget, k === "ArrowDown" ? 1 : -1); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); r.dir ? setOpen((o) => ({ ...o, [r.path]: !o[r.path] })) : onOpen?.(r); }
    else if (k === "F2") { e.preventDefault(); setRenaming({ path: r.path, value: r.name }); }
    else if (k === "Delete") { e.preventDefault(); setAsk({ kind: "delete", node: r }); }
    else if (k === "ContextMenu" || (k === "F10" && e.shiftKey)) {
      e.preventDefault();
      const b = e.currentTarget.getBoundingClientRect();
      openMenuFor(r, b.left + 24, b.bottom);
    }
  };

  return (
    <div className="tree-wrap">
      <div className="tree-filter">
        <Icon name="search" size={13} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("files.filter")} aria-label={t("files.filter")} />
        <button type="button" className="icon-btn" aria-label={t("files.newFile")} title={t("files.newFile")} onClick={() => startCreate("file")}><Icon name="filePlus" size={13} /></button>
        <button type="button" className="icon-btn" aria-label={t("files.newFolder")} title={t("files.newFolder")} onClick={() => startCreate("folder")}><Icon name="folderPlus" size={13} /></button>
      </div>
      <div role="tree" aria-label={t("files.title")} className="tree" ref={listRef}>
        {rows.length === 0 && <div className="muted small pad-sm">{filter ? t("files.noMatch") : t("files.emptyFolder")}</div>}
        {rows.map((r) =>
          r.creating ? (
            <div key="__new__" className="tree-row creating" style={{ paddingLeft: 8 + r.depth * 14 }}>
              <span className="caret-space" />
              <Icon name={creating.kind === "folder" ? "folder" : "file"} size={14} className={creating.kind === "folder" ? "icon-dir" : "icon-file"} />
              <NameInput value="" label={t(creating.kind === "folder" ? "files.newFolder" : "files.newFile")} onDone={commitCreate} onCancel={() => setCreating(null)} />
            </div>
          ) : renaming?.path === r.path ? (
            <div key={r.path} className="tree-row" style={{ paddingLeft: 8 + r.depth * 14 }}>
              <span className="caret-space" />
              <Icon name={r.dir ? "folder" : "file"} size={14} className={r.dir ? "icon-dir" : "icon-file"} />
              <NameInput value={r.name} label={t("files.rename")} onDone={(v) => commitRename(r, v)} onCancel={() => setRenaming(null)} />
            </div>
          ) : (
            <div
              key={r.path}
              role="treeitem"
              data-path={r.path}
              tabIndex={sel === r.path || (!sel && rows[0]?.path === r.path) ? 0 : -1}
              aria-expanded={r.dir ? r.isOpen : undefined}
              aria-level={r.depth + 1}
              aria-selected={sel === r.path}
              className={`tree-row ${r.dir ? "dir" : "file"} ${activePath === r.path ? "active" : ""} ${sel === r.path ? "sel" : ""}`}
              style={{ paddingLeft: 8 + r.depth * 14 }}
              onClick={() => { setSel(r.path); r.dir ? setOpen((o) => ({ ...o, [r.path]: !o[r.path] })) : onOpen?.(r); }}
              onContextMenu={(e) => { e.preventDefault(); openMenuFor(r, e.clientX, e.clientY); }}
              onKeyDown={(e) => onKey(e, r)}
              title={r.path}
            >
              {r.dir ? <Icon name="chevron" size={12} className={`caret ${r.isOpen ? "open" : ""}`} /> : <span className="caret-space" />}
              <Icon name={r.dir ? (r.isOpen ? "folderOpen" : "folder") : "file"} size={14} className={r.dir ? "icon-dir" : "icon-file"} />
              <span className="trunc grow">{r.name}</span>
              {changed?.has(r.path.replace(/\\/g, "/").toLowerCase()) && <span className="dot dot-warn" title={t("files.changed")} />}
              <button
                type="button"
                tabIndex={-1}
                className="tree-more"
                aria-label={`${t("files.actions")}: ${r.name}`}
                title={t("files.actions")}
                onClick={(e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); openMenuFor(r, b.left, b.bottom); }}
              >
                <Icon name="dots" size={13} />
              </button>
            </div>
          ),
        )}
      </div>

      {menu && <ContextMenu at={menu} items={menuItems(menu.node)} onClose={() => setMenu(null)} />}

      {ask?.kind === "delete" && (
        <Modal
          title={t("files.deleteTitle")}
          tone="danger"
          width={460}
          onClose={() => setAsk(null)}
          footer={(
            <span className="foot-actions">
              <button type="button" className="btn" data-autofocus onClick={() => setAsk(null)}>{t("confirm.cancel")}</button>
              <button type="button" className="btn btn-danger" onClick={() => { const n = ask.node; setAsk(null); doTrash(n); }}>{t("files.delete")}</button>
            </span>
          )}
        >
          <p>{t("files.deleteBody", { name: ask.node.name })}</p>
          <p className="muted small">{t("files.deleteHint")}</p>
        </Modal>
      )}
      {ask?.kind === "tegma" && (
        <Modal
          title={t("editor.tegmaTitle")}
          tone="danger"
          width={480}
          onClose={() => setAsk(null)}
          footer={(
            <span className="foot-actions">
              <button type="button" className="btn" data-autofocus onClick={() => setAsk(null)}>{t("confirm.cancel")}</button>
              <button type="button" className="btn btn-danger" onClick={() => { const f = ask.run; setAsk(null); f(); }}>{t("editor.tegmaYes")}</button>
            </span>
          )}
        >
          <p>{t("editor.tegmaBody")}</p>
          {ask.rel ? <p className="mono small muted">{ask.rel}</p> : null}
        </Modal>
      )}
    </div>
  );
}
