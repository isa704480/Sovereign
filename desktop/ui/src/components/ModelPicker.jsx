import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

const S = () => window.sovereign;

/** OmniRoute model tanlagich: tekin tavsiyalar, oilalar, qidiruv. Katalog main orqali olinadi. */
export default function ModelPicker({ label, onSelect, disabled, placement = "up" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [fam, setFam] = useState(null);
  const [models, setModels] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const btnRef = useRef(null);

  const api = (qs) => (S()?.models ? S().models(qs).then((d) => d ?? {}).catch(() => ({ error: "network" })) : Promise.resolve({ error: "offline" }));

  useEffect(() => {
    if (!open || families) return;
    setError("");
    api("?families=1").then((d) => {
      if (d.error) { setError(d.error); setModels([]); return; }
      setFamilies(d.families ?? []);
      setFeatured(d.featured ?? []);
      setFam((d.families ?? [])[0] ?? null);
    });
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  useEffect(() => {
    if (!open || error) return;
    const h = setTimeout(async () => {
      if (q.trim()) setModels((await api(`?q=${encodeURIComponent(q)}&limit=60`)).models ?? []);
      else if (fam) setModels((await api(`?family=${encodeURIComponent(fam.key)}&limit=80`)).models ?? []);
    }, q ? 240 : 0);
    return () => clearTimeout(h);
  }, [q, fam, open, error]);

  const choose = (id, name) => { onSelect?.(id, name); setOpen(false); setQ(""); btnRef.current?.focus(); };
  const retry = () => { setFamilies(null); setModels(null); setError(""); setReload((n) => n + 1); };

  return (
    <div ref={ref} className="picker">
      <button ref={btnRef} type="button" className="chip" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={t("model.pick")}>
        <Icon name="sparkle" size={13} />
        <span className="chip-label">{label || "Auto"}</span>
        <Icon name="chevronDown" size={13} />
      </button>

      {open && (
        <div className={`popover picker-pop ${placement}`} role="dialog" aria-label={t("model.pick")}>
          <div className="picker-search">
            <Icon name="search" size={14} />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("model.search")} aria-label={t("model.search")} />
          </div>
          {error ? (
            <div className="empty small-empty">
              <Icon name={error === "offline" ? "wifiOff" : "alert"} size={20} />
              <p>{error === "offline" ? t("model.offline") : t("model.error")}</p>
              {error !== "offline" && <button type="button" className="btn btn-sm" onClick={retry}>{t("common.retry")}</button>}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => choose("", "Auto")}>{t("model.useAuto")}</button>
            </div>
          ) : (
            <>
              {featured.length > 0 && !q && (
                <div className="picker-featured">
                  <div className="eyebrow"><Icon name="sparkle" size={11} /> {t("model.featured")}</div>
                  <div className="picker-grid">
                    {featured.map((m) => (
                      <button key={m.id} type="button" className={`picker-item ${label === m.label ? "active" : ""}`} onClick={() => choose(m.id, m.label)} title={m.id}>
                        <span className="dot dot-ok" aria-hidden="true" />
                        <span className="trunc">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="picker-cols">
                <div className="picker-fams">
                  <button type="button" className={`picker-item ${label === "Auto" ? "active" : ""}`} onClick={() => choose("", "Auto")}>
                    <span className="dot dot-accent" aria-hidden="true" /><b>Auto</b>
                  </button>
                  {!families && <div className="muted small pad-sm">{t("common.loading")}</div>}
                  {(families || []).map((f) => (
                    <button key={f.key} type="button" className={`picker-item ${fam?.key === f.key && !q ? "active" : ""}`} onClick={() => { setFam(f); setQ(""); }}>
                      <span className="trunc grow">{f.label}</span>
                      <span className="faint tnum small">{f.count}</span>
                    </button>
                  ))}
                </div>
                <div className="picker-models">
                  {!models && <div className="muted small center pad">{t("common.loading")}</div>}
                  {models && models.length === 0 && <div className="muted small center pad">{t("model.none")}</div>}
                  {(models || []).map((m) => (
                    <button key={m.id} type="button" className="picker-model" onClick={() => choose(m.id, m.id.split("/").pop())} title={m.id}>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="trunc mono block strong">{m.id}</span>
                        <span className="faint small block">
                          {m.owner}{m.context ? ` · ${Math.round(m.context / 1000)}k` : ""}{m.tools ? " · tools" : ""}{m.vision ? " · vision" : ""}{m.reasoning ? " · reasoning" : ""}
                        </span>
                      </span>
                      {m.id.split("/").pop() === label && <Icon name="check" size={15} className="accent" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="picker-foot faint small">{t("model.foot")}</div>
        </div>
      )}
    </div>
  );
}
