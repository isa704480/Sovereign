import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import { useT } from "../lib/i18n.js";
import { pastePayload, pasteLineCount, pastePreview } from "../lib/terminalPaste.js";

const S = () => window.sovereign;
const TICK = String.fromCharCode(96);
const MAX_TABS = 5;
const MIN_H = 120;
const MAX_H = 1200;
const CHUNK = 2048; // preload'dagi 4096 belgilik chegaradan past

/** pty'ga yozish — IPC chegarasidan (4096) past bo'laklarda. */
const writeChunks = (id, data) => {
  for (let i = 0; i < data.length; i += CHUNK) S()?.terminal.write(id, data.slice(i, i + CHUNK));
};

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const leaf = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";

/** xterm mavzusi — ilovaning o'z tokenlaridan (yorug'/qorong'i avtomatik). */
function themeFromTokens() {
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    background: cssVar("--code-bg", dark ? "#0a0d24" : "#f3f4fb"),
    foreground: cssVar("--text", dark ? "#f0f2ff" : "#0b0e24"),
    cursor: cssVar("--accent-soft", "#7c6ff7"),
    cursorAccent: cssVar("--code-bg", "#0a0d24"),
    selectionBackground: cssVar("--accent-bg", "rgba(91,80,240,0.16)"),
    black: dark ? "#1c2150" : "#0b0e24",
    red: cssVar("--err", "#f87171"),
    green: cssVar("--ok", "#10d4a0"),
    yellow: cssVar("--warn", "#f59e0b"),
    blue: cssVar("--accent-soft", "#7c6ff7"),
    magenta: dark ? "#d8a0ff" : "#8b2fb8",
    cyan: dark ? "#5ad7e8" : "#0e7490",
    white: dark ? "#d7dbf5" : "#2c3259",
    brightBlack: cssVar("--faint", "#7a82b0"),
    brightRed: dark ? "#ffa1a1" : "#b91c1c",
    brightGreen: dark ? "#6ee7b7" : "#047857",
    brightYellow: dark ? "#fcd34d" : "#b45309",
    brightBlue: dark ? "#a5b4fc" : "#4338ca",
    brightMagenta: dark ? "#f0abfc" : "#a21caf",
    brightCyan: dark ? "#a5f3fc" : "#0891b2",
    brightWhite: cssVar("--text", "#f0f2ff"),
  };
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Foydalanuvchining haqiqiy terminali (pastki panel).
 *
 * XAVFSIZLIK: pty'ga faqat shu komponentdagi xterm'ning `onData` (klaviatura) va
 * TASDIQLANGAN paste yozadi. Preload qo'shimcha ravishda haqiqiy (isTrusted)
 * kiritish hodisasini talab qiladi — model javobi pty'ga buyruq yubora olmaydi.
 * Ish papkasi almashsa, ochiq yorliqqa `cd` YOZILMAYDI (bu aynan taqiqlangan
 * kiritish yo'li bo'lardi) — yangi yorliq yangi papkada ochiladi.
 */
export default function TerminalPanel({ cwd, height, onHeight, onClose, platform }) {
  const t = useT();
  const labelId = useId();
  const [tabs, setTabs] = useState([]);
  const [active, setActive] = useState("");
  const [errCode, setErrCode] = useState("");
  const [paste, setPaste] = useState(null); // { id, text }
  const hostRef = useRef(null);
  const termsRef = useRef(new Map()); // id -> { term, fit, el, dData, dBinary }
  const activeRef = useRef("");
  activeRef.current = active;
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const approvedRef = useRef(false); // tasdiqlangan qo'yish — bir marta o'tkaziladi
  const heightRef = useRef(height);
  heightRef.current = height;

  const fitNow = useCallback((id) => {
    const rec = termsRef.current.get(id);
    if (!rec || !rec.el.isConnected || rec.el.offsetParent === null) return;
    try {
      rec.fit.fit();
      S()?.terminal.resize(id, rec.term.cols, rec.term.rows);
    } catch {
      /* panel hali o'lchamsiz */
    }
  }, []);

  const disposeTerm = (rec) => {
    try {
      rec.dData.dispose();
      rec.dBinary.dispose();
      rec.term.dispose();
    } catch {
      /* allaqachon yopilgan */
    }
    rec.el.remove();
  };

  /** Ctrl+V: matn main'dan olinadi; ko'p satrli bo'lsa — avval tasdiq. */
  const pasteFromClipboard = useCallback(async (id) => {
    const r = await S()?.terminal.paste(id).catch(() => null);
    const text = typeof r?.text === "string" ? r.text : "";
    if (!text) return;
    if (pastePayload(text) !== null) {
      setPaste({ id, text });
      return;
    }
    const rec = termsRef.current.get(id);
    if (!rec) return;
    approvedRef.current = true;
    rec.term.paste(text);
  }, []);

  // ---- Yorliq ochish -------------------------------------------------------
  const addTab = useCallback(async () => {
    if (termsRef.current.size >= MAX_TABS) return;
    const dark = document.documentElement.dataset.theme !== "light";
    const term = new Terminal({
      cursorBlink: !reducedMotion(),
      cursorStyle: "bar",
      scrollback: 5000,
      fontFamily: cssVar("--mono", "Consolas, monospace"),
      fontSize: 12.5,
      lineHeight: 1.25,
      drawBoldTextInBrightColors: dark,
      theme: themeFromTokens(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    const el = document.createElement("div");
    el.className = "shterm-screen";
    hostRef.current?.appendChild(el);
    term.open(el);
    try {
      fit.fit();
    } catch {
      /* o'lcham hali yo'q */
    }

    const r = await S()?.terminal.create(term.cols, term.rows);
    if (!r || r.error) {
      term.dispose();
      el.remove();
      setErrCode(r?.error === "too-many" ? "tooMany" : "spawn");
      return;
    }
    setErrCode("");

    // Klaviatura va qo'yish → pty. Bu YAGONA yozish yo'li. Ko'p satrli qo'yish
    // shu oqimda ushlanadi (DOM paste hodisasidan ishonchliroq: Ctrl+V, o'ng
    // tugma, o'rta tugma va sudrab tashlash — hammasi shu yerdan o'tadi).
    const dData = term.onData((d) => {
      if (approvedRef.current) {
        approvedRef.current = false;
        writeChunks(r.id, d);
        return;
      }
      const body = pastePayload(d);
      if (body !== null) {
        // Tasdiqsiz ko'p satrli matn pty'ga bormaydi (sudrab tashlash,
        // o'rta tugma bilan qo'yish va h.k.).
        setPaste({ id: r.id, text: body });
        return;
      }
      writeChunks(r.id, d);
    });
    const dBinary = term.onBinary((d) => writeChunks(r.id, d));
    // Ctrl+V / Cmd+V / Shift+Insert — xterm ularni shellga ^V sifatida yuboradi,
    // Windows'da esa PSReadLine buferdan O'ZI qo'yib yuboradi va tasdiq
    // chetlab o'tilardi. Shuning uchun tugmani shu yerda ushlaymiz.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = platform === "darwin" ? e.metaKey : e.ctrlKey;
      const wantsPaste = (mod && !e.altKey && (e.key === "v" || e.key === "V")) || (e.shiftKey && e.key === "Insert");
      if (!wantsPaste) return true;
      e.preventDefault();
      pasteFromClipboard(r.id);
      return false;
    });

    termsRef.current.set(r.id, { term, fit, el, dData, dBinary });
    setTabs((list) => [...list, { id: r.id, name: r.name, cwd: r.cwd, mode: r.mode }]);
    setActive(r.id);
    setTimeout(() => {
      fitNow(r.id);
      term.focus();
    }, 0);
  }, [fitNow, pasteFromClipboard, platform]);
  const addTabRef = useRef(addTab);
  addTabRef.current = addTab;

  const closeTab = useCallback((id) => {
    const rec = termsRef.current.get(id);
    if (rec) {
      disposeTerm(rec);
      termsRef.current.delete(id);
    }
    S()?.terminal.close(id);
    setTabs((list) => {
      const next = list.filter((x) => x.id !== id);
      if (activeRef.current === id) setActive(next[next.length - 1]?.id ?? "");
      return next;
    });
  }, []);

  // ---- Main'dan kelgan chiqish --------------------------------------------
  useEffect(() => {
    const off = S()?.terminal.onEvent((ev) => {
      const rec = termsRef.current.get(ev?.id);
      if (!rec) return;
      if (ev.type === "data") rec.term.write(ev.data);
      else if (ev.type === "exit") {
        rec.term.write(`\r\n\x1b[2m${t("sh.exited")}\x1b[0m\r\n`);
        try {
          rec.dData.dispose();
          rec.dBinary.dispose();
        } catch {
          /* yopilgan */
        }
      }
    });
    return () => off?.();
  }, [t]);

  // ---- Panel ochilganda bitta yorliq; yopilganda hammasi to'xtaydi ---------
  useEffect(() => {
    addTabRef.current();
    return () => {
      for (const [id, rec] of termsRef.current) {
        disposeTerm(rec);
        S()?.terminal.close(id);
      }
      termsRef.current.clear();
    };
  }, []);

  // ---- Faol yorliqni ko'rsatish + fokus ------------------------------------
  useEffect(() => {
    for (const [id, rec] of termsRef.current) rec.el.style.display = id === active ? "block" : "none";
    if (!active) return;
    fitNow(active);
    termsRef.current.get(active)?.term.focus();
  }, [active, tabs, fitNow]);

  // ---- O'lcham o'zgarsa — fit() → pty.resize() -----------------------------
  // fit() o'zi kuzatilayotgan element ichini o'zgartiradi, shuning uchun
  // o'lchash keyingi kadrga suriladi (aks holda eski o'lcham bilan hisoblanadi).
  const scheduleFit = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => fitNow(activeRef.current));
  }, [fitNow]);
  useEffect(() => {
    const ro = new ResizeObserver(scheduleFit);
    if (hostRef.current) ro.observe(hostRef.current);
    window.addEventListener("resize", scheduleFit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleFit);
      cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleFit]);
  // Panel balandligi (sudrash / sozlamadan tiklash) — darhol moslashtiramiz.
  useEffect(scheduleFit, [height, scheduleFit]);

  // ---- Mavzu almashsa — xterm ranglari ham --------------------------------
  useEffect(() => {
    const apply = () => {
      const th = themeFromTokens();
      for (const rec of termsRef.current.values()) rec.term.options.theme = th;
    };
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // ---- Balandlikni sudrab o'zgartirish -------------------------------------
  const onDragStart = (e) => {
    e.preventDefault();
    dragRef.current = { y: e.clientY, h: heightRef.current };
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      onHeight(Math.max(MIN_H, Math.min(MAX_H, Math.round(d.h + (d.y - ev.clientY)))), false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragRef.current = null;
      onHeight(heightRef.current, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onDragKey = (e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onHeight(Math.min(MAX_H, heightRef.current + step), true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onHeight(Math.max(MIN_H, heightRef.current - step), true);
    }
  };

  // ---- Tasdiqlangan qo'yish ------------------------------------------------
  const confirmPaste = () => {
    const p = paste;
    setPaste(null);
    if (!p) return;
    const rec = termsRef.current.get(p.id);
    if (!rec) return;
    rec.term.focus();
    // xterm o'zi \n → \r ga aylantiradi va kerak bo'lsa qavsli qo'yishni qo'shadi.
    approvedRef.current = true;
    rec.term.paste(p.text);
  };

  const cur = tabs.find((x) => x.id === active);
  const staleCwd = !!(cwd && cur && cur.cwd && cur.cwd !== cwd);
  const mod = platform === "darwin" ? "Cmd" : "Ctrl";

  return (
    <section className="shterm" style={{ height }} aria-labelledby={labelId}>
      <div
        className="shterm-grip"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={t("sh.resize")}
        aria-valuenow={height}
        aria-valuemin={MIN_H}
        aria-valuemax={MAX_H}
        onPointerDown={onDragStart}
        onKeyDown={onDragKey}
      />
      <div className="shterm-bar">
        <h2 id={labelId} className="sr-only">{t("sh.title")}</h2>
        <div className="shterm-tabs" role="tablist" aria-label={t("sh.tabs")}>
          {tabs.map((tab, i) => (
            <div key={tab.id} className={`shterm-tab ${tab.id === active ? "on" : ""}`}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === active}
                aria-label={t("sh.tabLabel", { n: i + 1, shell: tab.name || t("sh.shell"), dir: leaf(tab.cwd) })}
                title={tab.cwd || ""}
                onClick={() => setActive(tab.id)}
              >
                <Icon name="terminal" size={12} />
                <span className="shterm-tab-name">{tab.name || t("sh.shell")}</span>
                {leaf(tab.cwd) && <span className="shterm-tab-cwd faint">{leaf(tab.cwd)}</span>}
              </button>
              <button type="button" className="shterm-x" aria-label={t("sh.closeTab", { n: i + 1 })} onClick={() => closeTab(tab.id)}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="icon-btn shterm-add"
            aria-label={t("sh.newTab")}
            title={`${t("sh.newTab")} (${tabs.length}/${MAX_TABS})`}
            disabled={tabs.length >= MAX_TABS}
            onClick={addTab}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <span className="grow" />
        <button type="button" className="icon-btn" aria-label={t("sh.close")} title={`${t("sh.close")} (${mod}+${TICK})`} onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {errCode && (
        <div className="banner banner-warn shterm-note">
          <Icon name="alert" size={13} />
          <span>{t(`sh.err.${errCode}`)}</span>
        </div>
      )}
      {cur?.mode === "pipe" && (
        <div className="banner banner-warn shterm-note">
          <Icon name="alert" size={13} />
          <span>{t("sh.fallback")}</span>
        </div>
      )}
      {staleCwd && (
        <div className="banner shterm-note">
          <Icon name="info" size={13} />
          <span className="grow">{t("sh.folderChanged", { name: leaf(cwd) })}</span>
          <button type="button" className="btn btn-sm" disabled={tabs.length >= MAX_TABS} onClick={addTab}>{t("sh.newTabHere")}</button>
        </div>
      )}
      <div className="shterm-host" ref={hostRef} role="group" aria-label={t("sh.a11yLabel")} />
      {paste && (
        <Modal
          title={t("sh.paste.title")}
          tone="danger"
          width={620}
          onClose={() => setPaste(null)}
          footer={(
            <>
              <span className="faint small">{t("sh.paste.lines", { n: pasteLineCount(paste.text) })}</span>
              <span className="foot-actions">
                <button type="button" className="btn" data-autofocus onClick={() => setPaste(null)}>{t("confirm.cancel")}</button>
                <button type="button" className="btn btn-danger" onClick={confirmPaste}>{t("sh.paste.run")}</button>
              </span>
            </>
          )}
        >
          <p>{t("sh.paste.body")}</p>
          <pre className="shterm-paste mono">{pastePreview(paste.text)}</pre>
        </Modal>
      )}
    </section>
  );
}
