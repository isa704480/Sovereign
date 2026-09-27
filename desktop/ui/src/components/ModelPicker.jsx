import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useModalLayer } from "./Modal.jsx";
import { useT } from "../lib/i18n.js";
import { plainText } from "../lib/agent.js";
import { useLocalMode, setLocalMode, refreshLocal, gbText } from "../lib/localMode.js";

const S = () => window.sovereign;

/** "Mahalliy (Ollama)" — oilalar ro'yxatidagi maxsus bo'lim kaliti (OmniRoute oilasi bilan to'qnashmaydi). */
const LOCAL_FAM = { key: "\u0000local", local: true };
const LOCAL_ERRORS = new Set(["busy", "bad-model", "unavailable", "not-installed"]);

/** Main'dan kelgan Ollama ro'yxati → xavfsiz ko'rinish (nom/o'lcham/imkoniyatlar; matn tozalanadi). */
export function normalizeLocalList(d) {
  const models = (Array.isArray(d?.models) ? d.models : []).slice(0, 40).map((m) => ({
    name: plainText(m?.name, 120),
    size: Number(m?.size) > 0 ? Number(m.size) : 0,
    paramSize: plainText(m?.paramSize, 16),
    quant: plainText(m?.quant, 16),
    tools: m?.tools === true,
    vision: m?.vision === true,
    // local:status imkoniyatlarni so'ramaydi — noma'lum (undefined) holat alohida ko'rsatiladi.
    capsKnown: typeof m?.tools === "boolean",
  })).filter((m) => m.name);
  const recommend = (Array.isArray(d?.recommend) ? d.recommend : []).slice(0, 6).map((r) => ({
    name: plainText(r?.name, 120),
    tier: [1, 2, 3, 4].includes(Number(r?.tier)) ? Number(r.tier) : 0,
    sizeGb: plainText(String(r?.sizeGb ?? ""), 16),
  })).filter((r) => r.name);
  const ram = Number(d?.ramGb);
  const ctx = Number(d?.contextEnv);
  return {
    available: d?.available === true,
    version: plainText(d?.version, 32),
    models,
    recommend,
    ramGb: Number.isFinite(ram) && ram > 0 ? Math.round(ram) : 0,
    contextEnv: Number.isFinite(ctx) && ctx > 0 ? Math.floor(ctx) : 0,
    localFallback: ["off", "ask", "auto"].includes(d?.localFallback) ? d.localFallback : null,
    localModel: plainText(d?.localModel, 120),
  };
}

/** Local API chaqiruvi: xato/yo'q preload → {available:false}. */
export function loadLocal(withCaps) {
  const api = S()?.local;
  const call = withCaps ? api?.models : api?.status;
  if (!call) return Promise.resolve(normalizeLocalList(null));
  return call().then(normalizeLocalList).catch(() => normalizeLocalList(null));
}

/** Tavsiya etilgan (o'rnatilmagan) modellar: "ollama pull NOM" nusxalash — ilova o'zi yuklamaydi. */
export function LocalRecommend({ recommend, ramGb, installed = [], tierNote = true }) {
  const t = useT();
  const [copied, setCopied] = useState("");
  const have = new Set(installed);
  const list = recommend.filter((r) => !have.has(r.name));
  if (!list.length) return null;
  const copy = (cmd) => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? "" : c)), 1400);
    }).catch(() => {});
  };
  const tiers = [...new Set(list.map((r) => r.tier).filter(Boolean))];
  return (
    <div className="local-rec">
      <div className="small strong">{ramGb ? t("local.recommend", { ram: ramGb }) : t("local.recommendNoRam")}</div>
      <ul className="local-rec-list">
        {list.map((r) => {
          const cmd = `ollama pull ${r.name}`;
          return (
            <li key={r.name} className="row gap-sm">
              <code className="inline trunc" title={t("model.local.pull", { cmd })}>{cmd}</code>
              {r.sizeGb && <span className="faint small tnum">{t("local.sizeApprox", { n: r.sizeGb })}</span>}
              <span className="grow" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(cmd)} aria-label={`${t("local.copyCmd")}: ${r.name}`} title={t("local.copyCmd")}>
                <Icon name={copied === cmd ? "check" : "copy"} size={13} /> {copied === cmd ? t("common.copied") : t("common.copy")}
              </button>
            </li>
          );
        })}
      </ul>
      {tierNote && tiers.map((n) => <div key={n} className="faint small">{t(`local.tier.${n}`)}</div>)}
    </div>
  );
}

/** Model imkoniyatlari: 🔧 vositalar (Kod rejimi) / faqat Chat, 👁 rasm. Matn — sarlavhada (title). */
export function LocalCaps({ m }) {
  const t = useT();
  const parts = [];
  if (m.paramSize) parts.push(<span key="p">{m.paramSize}</span>);
  if (m.size) parts.push(<span key="s" className="tnum">{t("local.sizeGb", { n: gbText(m.size) })}</span>);
  if (m.capsKnown) {
    parts.push(m.tools
      ? <span key="t" className="local-cap ok" title={t("model.local.tools")}><span aria-hidden="true">🔧</span> {t("model.cap.tools")}</span>
      : <span key="t" className="local-cap warn" title={t("model.local.chatOnly")}>{t("local.chatOnly")}</span>);
    if (m.vision) parts.push(<span key="v" className="local-cap" title={t("model.local.vision")}><span aria-hidden="true">👁</span> {t("model.cap.vision")}</span>);
  }
  return <span className="local-caps faint small">{parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span aria-hidden="true">·</span>}{p}</React.Fragment>)}</span>;
}

/** OmniRoute model tanlagich: tekin tavsiyalar, oilalar, qidiruv + "Mahalliy (Ollama)" bo'limi. Katalog main orqali olinadi. */
export default function ModelPicker({ label, onSelect, disabled, placement = "up" }) {
  const t = useT();
  const local = useLocalMode();
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [fam, setFam] = useState(null);
  const [models, setModels] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);
  const [loc, setLoc] = useState(null); // null — yuklanmoqda
  const [locBusy, setLocBusy] = useState("");
  const [locErr, setLocErr] = useState("");
  const [announce, setAnnounce] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);
  const btnRef = useRef(null);

  const api = (qs) => (S()?.models ? S().models(qs).then((d) => d ?? {}).catch(() => ({ error: "network" })) : Promise.resolve({ error: "offline" }));
  const localView = fam?.local && !q.trim();

  useEffect(() => {
    if (!open || families) return;
    setError("");
    api("?families=1").then((d) => {
      if (d.error) { setError(d.error); setModels([]); return; }
      setFamilies(d.families ?? []);
      setFeatured(d.featured ?? []);
      // Mahalliy rejim faol bo'lsa — ro'yxat mahalliy bo'limdan ochiladi.
      setFam((f) => f ?? (local ? LOCAL_FAM : (d.families ?? [])[0] ?? null));
    });
  }, [open, reload]);

  // Popover modal stekiga qo'shiladi: Esc faqat u eng ustida bo'lganda yopadi (Sozlamalar dialogi
  // birga yopilmaydi), Ctrl+K kabi global tugmalar ochiq popover ustidan ishlamaydi.
  useModalLayer(open, { trap: false, onEscape: () => { setOpen(false); setQ(""); btnRef.current?.focus(); } });
  // Popover oynadan chiqmasin (tor oyna / composer ikki qatorga o'tganda): o'ng chetdan 16px ichkarida.
  const popRef = useRef(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const fit = () => {
      const el = popRef.current;
      if (!el) return;
      el.style.left = "0px";
      const r = el.getBoundingClientRect();
      const over = Math.min(r.right - (window.innerWidth - 16), r.left - 16);
      if (over > 0) el.style.left = `${-over}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Ro'yxat so'rovi xatosi "model topilmadi" deb ko'rsatilmaydi — alohida xato + Qayta urinish.
  const [listErr, setListErr] = useState(false);
  const [listReload, setListReload] = useState(0);
  useEffect(() => {
    if (!open || error || localView) return;
    let alive = true;
    const put = (d) => {
      if (!alive) return;
      setListErr(!!d.error);
      setModels(d.error ? [] : d.models ?? []);
    };
    const h = setTimeout(async () => {
      if (q.trim()) put(await api(`?q=${encodeURIComponent(q)}&limit=60`));
      else if (fam && !fam.local) put(await api(`?family=${encodeURIComponent(fam.key)}&limit=80`));
    }, q ? 240 : 0);
    return () => { alive = false; clearTimeout(h); };
  }, [q, fam, open, error, listReload]);

  // Mahalliy bo'lim ochilganda — o'rnatilgan modellar imkoniyatlari bilan (main → 127.0.0.1).
  useEffect(() => {
    if (!open || !localView) return;
    let alive = true;
    setLoc(null);
    setLocErr("");
    loadLocal(true).then((d) => alive && setLoc(d));
    return () => { alive = false; };
  }, [open, localView, reload]);

  const close = () => { setOpen(false); setQ(""); btnRef.current?.focus(); };
  const choose = (id, name) => {
    // Bulut modeli tanlansa main mahalliy rejimdan chiqadi (app:set-model) — holat qayta o'qiladi.
    Promise.resolve(onSelect?.(id, name)).catch(() => {}).finally(refreshLocal);
    if (local) setAnnounce(t("local.backedToCloud"));
    close();
  };
  const switchLocal = async (name) => {
    if (locBusy) return;
    setLocBusy(name || "\u0000cloud");
    setLocErr("");
    const r = await (S()?.local?.use(name) ?? Promise.resolve(null)).catch(() => null);
    setLocBusy("");
    if (!r?.ok) {
      const code = LOCAL_ERRORS.has(r?.error) ? r.error : "unavailable";
      setLocErr(t(`model.local.err.${code}`));
      return;
    }
    setLocalMode(r.local ?? null);
    setAnnounce(name ? t("model.local.switched", { model: name }) : t("local.backedToCloud"));
    close();
  };
  useEffect(() => {
    if (!announce) return;
    const h = setTimeout(() => setAnnounce(""), 4000);
    return () => clearTimeout(h);
  }, [announce]);
  const retry = () => { setFamilies(null); setModels(null); setError(""); setReload((n) => n + 1); };
  const retryLocal = () => setReload((n) => n + 1);

  const chipLabel = local ? local.model : label || "Auto";
  const cloudActive = !local;

  const localPane = () => {
    if (!loc) return <div className="muted small center pad" role="status">{t("common.loading")}</div>;
    const names = loc.models.map((m) => m.name);
    return (
      <div className="local-pane">
        {!loc.available ? (
          <div className="local-empty">
            <Icon name="wifiOff" size={18} />
            <p className="small">{t("model.local.unavailable")}</p>
            <div className="row gap-sm wrap">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => S()?.openLink("ollama")}><Icon name="external" size={13} /> {t("local.install")}</button>
              <button type="button" className="btn btn-sm" onClick={retryLocal}><Icon name="refresh" size={13} /> {t("common.retry")}</button>
            </div>
          </div>
        ) : loc.models.length === 0 ? (
          <div className="local-empty">
            <Icon name="download" size={18} />
            <p className="small">{t("model.local.none")}</p>
            <button type="button" className="btn btn-sm" onClick={() => S()?.openLink("ollamaLibrary")}><Icon name="external" size={13} /> {t("local.library")}</button>
          </div>
        ) : (
          loc.models.map((m) => {
            const active = local?.model === m.name;
            return (
              <button
                key={m.name} type="button" className={`picker-model ${active ? "active" : ""}`} disabled={!!locBusy}
                onClick={() => (active ? close() : switchLocal(m.name))} aria-label={t("model.local.use", { model: m.name })} aria-current={active ? "true" : undefined}
              >
                <Icon name="monitor" size={14} className={active ? "local-mark" : "faint"} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="trunc mono block strong">{m.name}</span>
                  <LocalCaps m={m} />
                </span>
                {locBusy === m.name ? <span className="spinner sm" aria-hidden="true" /> : active && <span className="pill pill-ok">{t("model.local.active")}</span>}
              </button>
            );
          })
        )}
        {locErr && <div className="banner banner-danger" role="alert"><Icon name="alert" size={14} /><span>{locErr}</span></div>}
        {local && (
          <button type="button" className="btn btn-sm btn-ghost local-back" onClick={() => switchLocal(null)} disabled={!!locBusy}>
            <Icon name="undo" size={13} /> {t("local.backToCloud")}
          </button>
        )}
        {loc.models.length > 0 && loc.models.every((m) => m.capsKnown && !m.tools) && <div className="faint small">{t("local.about.tools")}</div>}
        <LocalRecommend recommend={loc.recommend} ramGb={loc.ramGb} installed={names} tierNote={loc.models.length === 0} />
      </div>
    );
  };

  return (
    <div ref={ref} className="picker">
      <button
        ref={btnRef} type="button" className={`chip ${local ? "chip-local" : ""}`} disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setLocErr(""); }} title={local ? t("local.badgeTitle", { model: local.model }) : t("model.pick")}
      >
        <Icon name={local ? "monitor" : "sparkle"} size={13} />
        <span className="chip-label">{chipLabel}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>

      {open && (
        <div ref={popRef} className={`popover picker-pop ${placement}`} role="dialog" aria-label={t("model.pick")}>
          <div className="picker-search">
            <Icon name="search" size={14} />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("model.search")} aria-label={t("model.search")} />
          </div>
          {error && !localView ? (
            <div className="empty small-empty" role="alert">
              <Icon name={error === "offline" ? "wifiOff" : "alert"} size={20} />
              <p>{error === "offline" ? t("model.offline") : t("model.error")}</p>
              {error !== "offline" && <button type="button" className="btn btn-sm" onClick={retry}>{t("common.retry")}</button>}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => choose("", "Auto")}>{t("model.useAuto")}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setFam(LOCAL_FAM); setQ(""); }}><Icon name="monitor" size={13} /> {t("model.local.title")}</button>
            </div>
          ) : (
            <>
              {featured.length > 0 && !q && !localView && (
                <div className="picker-featured">
                  <div className="eyebrow"><Icon name="sparkle" size={11} /> {t("model.featured")}</div>
                  <div className="picker-grid">
                    {featured.map((m) => (
                      <button key={m.id} type="button" className={`picker-item ${cloudActive && label === m.label ? "active" : ""}`} onClick={() => choose(m.id, m.label)} title={m.id}>
                        <span className="dot dot-ok" aria-hidden="true" />
                        <span className="trunc">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="picker-cols">
                <div className="picker-fams">
                  <button type="button" className={`picker-item ${cloudActive && label === "Auto" ? "active" : ""}`} onClick={() => choose("", "Auto")}>
                    <span className="dot dot-accent" aria-hidden="true" /><b>Auto</b>
                  </button>
                  <button type="button" className={`picker-item ${localView ? "active" : ""}`} onClick={() => { setFam(LOCAL_FAM); setQ(""); }} aria-pressed={!!localView}>
                    <Icon name="monitor" size={13} className={local ? "local-mark" : "faint"} />
                    <span className="trunc grow">{t("model.local.title")}</span>
                    {local && <span className="dot dot-ok" aria-hidden="true" />}
                  </button>
                  {!families && !error && <div className="muted small pad-sm">{t("common.loading")}</div>}
                  {(families || []).map((f) => (
                    <button key={f.key} type="button" className={`picker-item ${fam?.key === f.key && !q ? "active" : ""}`} onClick={() => { setFam(f); setQ(""); }}>
                      <span className="trunc grow">{f.label}</span>
                      <span className="faint tnum small">{f.count}</span>
                    </button>
                  ))}
                </div>
                <div className="picker-models">
                  {localView ? localPane() : (
                    <>
                      {!models && <div className="muted small center pad">{t("common.loading")}</div>}
                      {models && listErr && (
                        <div className="small-empty" role="alert">
                          <Icon name="alert" size={18} />
                          <p>{t("model.error")}</p>
                          <button type="button" className="btn btn-sm" onClick={() => { setModels(null); setListReload((n) => n + 1); }}><Icon name="refresh" size={13} /> {t("common.retry")}</button>
                        </div>
                      )}
                      {models && !listErr && models.length === 0 && <div className="muted small center pad">{t("model.none")}</div>}
                      {(models || []).map((m) => (
                        <button key={m.id} type="button" className="picker-model" onClick={() => choose(m.id, m.id.split("/").pop())} title={m.id}>
                          <span className="grow" style={{ minWidth: 0 }}>
                            <span className="trunc mono block strong">{m.id}</span>
                            <span className="faint small block">
                              {m.owner}{m.context ? ` · ${Math.round(m.context / 1000)}k` : ""}{m.tools ? ` · ${t("model.cap.tools")}` : ""}{m.vision ? ` · ${t("model.cap.vision")}` : ""}{m.reasoning ? ` · ${t("model.cap.reasoning")}` : ""}
                            </span>
                          </span>
                          {cloudActive && m.id.split("/").pop() === label && <Icon name="check" size={15} className="accent" />}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="picker-foot faint small">{localView ? t("model.local.foot") : t("model.foot")}</div>
        </div>
      )}
    </div>
  );
}
