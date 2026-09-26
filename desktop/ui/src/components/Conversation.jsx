import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Icon, { Logo } from "./Icon.jsx";
import { md } from "../lib/md.js";
import { ledgerStats, formatTokens } from "../lib/agent.js";
import { useT } from "../lib/i18n.js";
import { localizeResult, localizeBody, ledgerWarning } from "../lib/cliText.js";

const TOOL_ICON = { write_file: "pencil", make_dir: "folder", read_file: "file", list_dir: "list", run_command: "play" };
const STATUS_ICON = { ok: "check", failed: "x", declined: "ban", skipped: "repeat", stopped: "stop" };

export function ToolStep({ it, awaiting }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = it.status === "running" && awaiting ? "awaiting" : it.status;
  const target = it.args?.path || it.args?.command || "";
  const canExpand = !!it.result && it.status !== "running";
  return (
    <div className={`step step-${status}`}>
      <button type="button" className="step-row" onClick={() => canExpand && setOpen((o) => !o)} aria-expanded={canExpand ? open : undefined} disabled={!canExpand}>
        <span className="step-icon"><Icon name={TOOL_ICON[it.name] ?? "bolt"} size={13} /></span>
        <span className="step-name">{t(`tool.${it.name}`, null, it.name)}</span>
        <span className="step-target mono trunc" title={target}>{target}</span>
        {it.args?.contentLength != null && <span className="faint small tnum">{t("tool.chars", { n: it.args.contentLength })}</span>}
        <span className={`pill pill-${status}`} role="status">
          {status === "running" || status === "awaiting" ? <span className="spinner" aria-hidden="true" /> : <Icon name={STATUS_ICON[status] ?? "check"} size={12} stroke={2} />}
          {t(`status.${status}`)}
        </span>
        {it.auto === "ok" && <span className="step-auto" title={t("auto.stepTitle")} aria-label={t("auto.stepTitle")}><Icon name="bolt" size={11} stroke={2} /></span>}
        {canExpand && <Icon name="chevron" size={12} className={`caret ${open ? "open" : ""}`} />}
      </button>
      {it.auto && it.auto !== "ok" && <div className="step-note small">{t(`auto.denied.${it.auto}`)}</div>}
      {open && <pre className="step-result">{localizeResult(it.result, t)}</pre>}
    </div>
  );
}

/** Jurnal izohi: noteCode → tanlangan tildagi matn (steps | loop | budget | error). */
function ledgerNote(it, t) {
  switch (it.noteCode) {
    case "steps":
      return t("ledger.noteSteps", { n: it.maxSteps || 14 });
    case "loop": {
      const kind = ["command", "write", "repeat"].includes(it.loop?.kind) ? it.loop.kind : "repeat";
      return t(`ledger.noteLoop.${kind}`, { target: it.loop?.target ?? "", n: it.loop?.count ?? 3 });
    }
    case "budget":
      return t("ledger.noteBudget", { used: formatTokens(it.budget?.used), limit: formatTokens(it.budget?.limit) });
    default:
      return t("ledger.noteError");
  }
}

/** "Testlar o'tdi" da'vosi tasdiqlanmagan: noTest | testFailed | stale. */
function testWarningText(w, t) {
  const code = ["noTest", "testFailed", "stale"].includes(w?.code) ? w.code : "noTest";
  return t(`ledger.test.${code}`, { command: w?.command ?? "", files: (w?.files ?? []).join(", ") });
}

/** Vazifa narxi: "≈ 12.3k token · 4 qadam" (faqat token — pul emas). */
function UsageLine({ it }) {
  const t = useT();
  const vars = { tokens: formatTokens(it.tokens), limit: formatTokens(it.budget), steps: it.rounds };
  const est = it.estimated ? ` · ${t("usage.estimated")}` : "";
  return (
    <div className="usage-line faint small tnum" title={t("usage.title")} aria-label={t("usage.title")}>
      <Icon name="bolt" size={11} />
      <span>{(it.budget ? t("usage.lineBudget", vars) : t("usage.line", vars)) + est}</span>
    </div>
  );
}

export function LedgerCard({ it }) {
  const t = useT();
  const st = ledgerStats(it.entries);
  const effects = (it.entries ?? []).filter((e) => !(["read_file", "list_dir"].includes(e.tool) && (e.status === "ok" || e.status === "skipped")));
  const bad = st.failed + st.declined > 0 || !!it.warning || !!it.testWarning || !!it.noteCode;
  return (
    <section className={`ledger ${bad ? "ledger-warn" : ""}`} aria-label={t("ledger.title")}>
      <header className="ledger-head">
        <Icon name="shield" size={15} />
        <div className="grow">
          <div className="ledger-title">{t("ledger.title")}</div>
          <div className="faint small">{t("ledger.subtitle")}</div>
        </div>
        <div className="ledger-stats">
          {st.ok > 0 && <span className="pill pill-ok"><Icon name="check" size={11} stroke={2} />{st.ok}</span>}
          {st.failed > 0 && <span className="pill pill-failed"><Icon name="x" size={11} stroke={2} />{st.failed}</span>}
          {st.declined > 0 && <span className="pill pill-declined"><Icon name="ban" size={11} stroke={2} />{st.declined}</span>}
        </div>
      </header>
      {effects.length > 0 && (
        <ul className="ledger-list">
          {effects.map((e, i) => (
            <li key={i} className={`ledger-item s-${e.status}`}>
              <Icon name={STATUS_ICON[e.status] ?? "info"} size={13} stroke={2} />
              <span className="grow">
                {t(`ledger.${e.tool}.${e.status}`, null, `${e.tool}: ${e.status}`)} <span className="mono">{e.target}</span>
                {e.tool === "run_command" && e.exit != null && <span className="faint"> ({t("ledger.exit", { code: e.exit })})</span>}
                {e.status === "failed" && e.detail && e.tool !== "run_command" && <span className="faint"> — {localizeBody(e.detail, t)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {st.reads > 0 && <div className="ledger-reads faint small"><Icon name="eye" size={12} /> {t("ledger.reads", { n: st.reads })}</div>}
      {it.noteCode && <div className="banner banner-warn"><Icon name={it.noteCode === "loop" ? "repeat" : "alert"} size={14} /><span>{ledgerNote(it, t)}</span></div>}
      {it.warning && <div className="banner banner-danger"><Icon name="alert" size={14} /><span><b>{t("ledger.claimWarn")}</b> {ledgerWarning(it.warning, t)}</span></div>}
      {it.testWarning && <div className="banner banner-danger"><Icon name="alert" size={14} /><span><b>{t("ledger.testWarn")}</b> {testWarningText(it.testWarning, t)}</span></div>}
    </section>
  );
}

function ErrorCard({ it, onAction, last }) {
  const t = useT();
  const code = ["auth", "network", "offline", "limit", "no-folder", "busy", "server"].includes(it.code) ? it.code : "server";
  const detail = code === "server" || code === "limit" ? it.message : "";
  return (
    <div className="msg msg-error" role="alert">
      <span className="avatar avatar-err"><Icon name={code === "offline" || code === "network" ? "wifiOff" : "alert"} size={14} /></span>
      <div className="grow">
        <div className="strong">{t(`err.${code}.title`)}</div>
        <div className="muted small">{t(`err.${code}.desc`)}{detail ? <> <span className="mono">({detail}{it.status ? ` · ${it.status}` : ""})</span></> : null}</div>
        {last && (
          <div className="row gap-sm mt-sm">
            {code === "auth" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onAction("signin")}>{t("account.signIn")}</button>}
            {code === "no-folder" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onAction("folder")}>{t("folder.open")}</button>}
            {(code === "network" || code === "server") && <button type="button" className="btn btn-sm" onClick={() => onAction("retry")}><Icon name="refresh" size={13} /> {t("common.retry")}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

const Assistant = memo(function Assistant({ text }) {
  const t = useT();
  const html = useMemo(() => md(text, t("common.copy"), t("md.code")), [text, t]);
  return (
    <div className="msg msg-assistant">
      <span className="avatar"><Logo size={18} /></span>
      <div className="md grow" data-md dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

function Thinking({ startedAt, mode, awaiting }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const sec = Math.max(0, Math.round((now - (startedAt || now)) / 1000));
  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="avatar"><Logo size={18} className="pulse" /></span>
      <span className="shimmer">{awaiting ? t("status.awaitingLong") : mode === "chat" ? t("chat.writing") : t("chat.thinking")}</span>
      <span className="faint small tnum">{t("time.sec", { n: sec })}</span>
    </div>
  );
}

export function EmptyState({ mode, info, onPick, onSignIn, onSuggest, fullAuto }) {
  const t = useT();
  const sugg = mode === "chat" ? ["chat.s1", "chat.s2", "chat.s3"] : ["code.s1", "code.s2", "code.s3", "code.s4"];
  const icons = ["sparkle", "code", "play", "file"];
  return (
    <div className="empty-hero">
      <Logo size={52} className="hero-logo" />
      <h1>{mode === "chat" ? t("empty.chatTitle") : t("empty.codeTitle")}</h1>
      <p className="muted">{mode === "chat" ? t("empty.chatSub") : fullAuto ? t("empty.codeSubAuto") : t("empty.codeSub")}</p>
      {!info.authed && (
        <div className="callout">
          <Icon name="user" size={16} />
          <span className="grow">{t("empty.needSignIn")}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={onSignIn}>{t("account.signIn")}</button>
        </div>
      )}
      {info.authed && mode === "code" && !info.cwd && (
        <div className="callout">
          <Icon name="folder" size={16} />
          <span className="grow">{t("empty.needFolder")}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={onPick}>{t("folder.open")}</button>
        </div>
      )}
      <div className="suggestions">
        {sugg.map((k, i) => (
          <button key={k} type="button" className="suggestion" onClick={() => onSuggest(t(k))}>
            <Icon name={icons[i]} size={15} />
            <span>{t(k)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Suhbat oqimi: xabarlar, vosita qadamlari, jurnal, xatolar. */
export default function Conversation({ agent, mode, info, onAction, onPick, onSignIn, onSuggest, fullAuto }) {
  const t = useT();
  const ref = useRef(null);
  const stick = useRef(true);
  const { items, busy, confirm } = agent;

  // Pastga avtomatik aylantirish — foydalanuvchi yuqoriga chiqib o'qiyotgan bo'lsa, tegmaymiz.
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  // Kod bloklaridagi "Nusxalash" tugmasi (md.js HTML'i ichida) — delegatsiya.
  const onClick = (e) => {
    const btn = e.target.closest?.("[data-copy]");
    if (!btn) return;
    const code = btn.closest(".codeblock")?.querySelector("pre")?.innerText ?? "";
    navigator.clipboard?.writeText(code).then(() => {
      btn.textContent = t("common.copied");
      setTimeout(() => { btn.textContent = t("common.copy"); }, 1400);
    }).catch(() => {});
  };

  const lastErrorId = [...items].reverse().find((i) => i.kind === "error")?.id;
  const lastRunningTool = [...items].reverse().find((i) => i.kind === "tool" && i.status === "running")?.id;

  return (
    <div ref={ref} className="conv-scroll" onScroll={onScroll} onClick={onClick}>
      {items.length === 0 ? (
        <EmptyState mode={mode} info={info} onPick={onPick} onSignIn={onSignIn} onSuggest={onSuggest} fullAuto={fullAuto} />
      ) : (
        <div className="conv" aria-live="polite" aria-relevant="additions">
          {items.map((it) => {
            switch (it.kind) {
              case "user":
                return (
                  <div key={it.id} className="msg msg-user">
                    <div className="bubble">{it.text}</div>
                  </div>
                );
              case "assistant":
                return <Assistant key={it.id} text={it.text} />;
              case "tool":
                return <ToolStep key={it.id} it={it} awaiting={!!confirm && it.id === lastRunningTool} />;
              case "ledger":
                return <LedgerCard key={it.id} it={it} />;
              case "usage":
                return <UsageLine key={it.id} it={it} />;
              case "error":
                return <ErrorCard key={it.id} it={it} onAction={onAction} last={it.id === lastErrorId && !busy} />;
              case "stopped":
                return <div key={it.id} className="divider-note"><Icon name="stop" size={12} /> {t("chat.stopped")}</div>;
              default:
                return null;
            }
          })}
          {busy && <Thinking startedAt={agent.startedAt} mode={mode} awaiting={!!confirm} />}
        </div>
      )}
    </div>
  );
}
