import React, { useEffect, useMemo, useRef, useState } from "react";
import ModelPicker from "./components/ModelPicker.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import DiffView from "./components/DiffView.jsx";
import { md } from "./lib/md.js";

const S = window.sovereign;
const C = {
  bg: "#0F0F10", surface: "#1A1A1C", surface2: "#232327", border: "rgba(255,255,255,0.08)",
  text: "#ECECEC", muted: "#9B9BA0", faint: "#6A6A70", accent: "#D97757",
  ok: "#6BBF8A", warn: "#E0A458", err: "#E0685E", addFg: "#7FD6A0", delFg: "#F08A94",
  mono: "var(--mono)",
};
let uid = 0;
const nid = () => ++uid;
const Ico = ({ d, s = 15, w = 1.5, stroke = "currentColor", style, children }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", ...style }}>{children || <path d={d} />}</svg>
);

export default function App() {
  const [info, setInfo] = useState({ authed: true, email: "", cwd: "", baseUrl: "", model: "Auto" });
  const [mode, setMode] = useState("code");
  const [tone, setTone] = useState("Xotirjam");
  const [modelName, setModelName] = useState("Auto");
  const [tab, setTab] = useState("files");
  const [tree, setTree] = useState([]);
  const [openDirs, setOpenDirs] = useState({});
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [term, setTerm] = useState([]);
  const [termOpen, setTermOpen] = useState(false);
  const [changes, setChanges] = useState([]);
  const [confirmReq, setConfirmReq] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [diffView, setDiffView] = useState(null);
  const [input, setInput] = useState("");

  const curAsst = useRef(null);
  const logRef = useRef(null);
  const scroll = () => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; };
  const refreshTree = () => S?.fsTree().then((r) => setTree(r?.nodes ?? []));

  const addChange = (ch) => setChanges((p) => {
    const ex = p.find((c) => c.path === ch.path);
    return [{ path: ch.path, before: ex ? ex.before : ch.before, after: ch.after }, ...p.filter((c) => c.path !== ch.path)];
  });

  useEffect(() => {
    if (!S) return;
    (async () => {
      const i = await S.init();
      setInfo({ authed: i.authed, email: i.email, cwd: i.cwd, baseUrl: i.baseUrl, model: String(i.model || "Auto").replace("SOVEREIGN ", "") });
      setModelName(String(i.model || "Auto").replace("SOVEREIGN ", ""));
      refreshTree();
    })();
    const off = S.onEvent(async (ev) => {
      if (ev.type === "text") {
        setLog((L) => {
          if (curAsst.current != null) return L.map((it) => it.id === curAsst.current ? { ...it, html: it.html + md(ev.text) } : it);
          const id = nid(); curAsst.current = id; return [...L, { id, kind: "assistant", html: md(ev.text) }];
        });
      } else if (ev.type === "tool") {
        curAsst.current = null;
        setLog((L) => [...L, { id: nid(), kind: "tool", name: ev.name, args: ev.args, done: false }]);
      } else if (ev.type === "tool-done") {
        setLog((L) => { const i = [...L].reverse().findIndex((it) => it.kind === "tool" && it.name === ev.name && !it.done); if (i === -1) return L; const r = L.length - 1 - i; return L.map((it, k) => k === r ? { ...it, done: true } : it); });
        if (ev.name === "write_file" || ev.name === "make_dir") refreshTree();
      } else if (ev.type === "terminal") {
        setTerm((T) => [...T, { command: ev.command, output: ev.output }]); setTermOpen(true);
      } else if (ev.type === "confirm") {
        if (ev.meta?.tool === "write_file") {
          const before = ev.meta.exists ? (await S.fsRead(ev.meta.path)).content ?? "" : "";
          setConfirmReq({ ...ev, _change: { path: ev.meta.path, before, after: ev.meta.content } }); return;
        }
        setConfirmReq(ev);
      } else if (ev.type === "done") { curAsst.current = null; setBusy(false); }
      else if (ev.type === "error") { curAsst.current = null; setLog((L) => [...L, { id: nid(), kind: "error", text: ev.message }]); setBusy(false); }
      setTimeout(scroll, 0);
    });
    return off;
  }, []);

  const send = (e) => {
    e?.preventDefault();
    const text = input.trim(); if (!text || busy) return;
    setLog((L) => [...L, { id: nid(), kind: "user", text }]);
    setTasks((T) => [{ title: text.slice(0, 60), meta: "ishlayapti", dot: C.warn }, ...T]);
    setInput(""); setBusy(true); curAsst.current = null; S.send(text, mode); setTimeout(scroll, 0);
  };
  const pickFolder = async () => { const r = await S.pickFolder(); if (r?.cwd) { setInfo((i) => ({ ...i, cwd: r.cwd })); refreshTree(); setChanges([]); setTerm([]); } };
  const newTask = async () => { await S.newTask?.(); setLog([]); setChanges([]); setTerm([]); curAsst.current = null; setBusy(false); };
  const openFile = async (node) => { const r = await S.fsRead(node.path); setViewer({ path: node.path, name: node.name, content: r?.content ?? r?.error ?? "" }); };
  const replyConfirm = (ok) => { if (confirmReq) { if (ok && confirmReq._change) addChange(confirmReq._change); S.confirmReply(confirmReq.id, ok); } setConfirmReq(null); };
  const undoChange = async (ch) => { await S?.fsWrite(ch.path, ch.before); setChanges((p) => p.filter((c) => c.path !== ch.path)); refreshTree(); };
  const undoAll = async () => { for (const c of changes) await S?.fsWrite(c.path, c.before); setChanges([]); refreshTree(); };
  const onSelectModel = (id, name) => { setModelName(name || "Auto"); };

  const folderName = info.cwd.split(/[\\/]/).filter(Boolean).pop() || "Papka tanlang";
  const view = log.length === 0 ? "empty" : mode === "chat" ? "chat" : "code";
  const breadcrumb = info.cwd.split(/[\\/]/).filter(Boolean).slice(-3);
  const initials = info.authed ? (info.email || "SC").replace(/@.*/, "").slice(0, 2).toUpperCase() : "—";

  // fayl daraxtini yassilaymiz
  const rows = useMemo(() => {
    const out = [];
    const walk = (nodes, depth) => nodes.forEach((n) => {
      const isOpen = !!openDirs[n.path];
      out.push({ ...n, depth, isOpen });
      if (n.dir && isOpen) walk(n.children || [], depth + 1);
    });
    walk(tree, 0);
    return out;
  }, [tree, openDirs]);

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 640, width: "100%", background: C.bg, color: C.text, overflow: "hidden" }}>
      {/* ░ SIDEBAR ░ */}
      <aside style={{ width: 272, flex: "none", display: "flex", flexDirection: "column", background: C.surface, borderRight: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 13px" }}>
          <div className="diamond" style={{ width: 22, height: 22, flex: "none", opacity: 0.95 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>SOVEREIGN</span>
            <span style={{ fontSize: 10.5, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase" }}>Cowork</span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 10, color: C.faint }} className="tnum">v0.3</div>
        </div>

        <div style={{ padding: "2px 12px 12px" }}>
          <button className="h-bright" onClick={newTask} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 34, borderRadius: 9, background: C.accent, color: "#1A1214", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
            <Ico d="" w={1.8}><path d="M12 5v14M5 12h14" /></Ico> Yangi vazifa
          </button>
        </div>
        <div style={{ height: 1, background: C.border }} />

        <button className="h-surf2" onClick={pickFolder} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 11px", textAlign: "left" }}>
          <Ico stroke={C.muted} s={16}><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" /></Ico>
          <span className="trunc" style={{ flex: 1 }}>
            <span className="trunc" style={{ display: "block", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{folderName}</span>
            <span className="trunc mono" style={{ display: "block", fontSize: 10.5, color: C.faint }}>{info.cwd || "—"}</span>
          </span>
        </button>
        <div style={{ height: 1, background: C.border }} />

        <div style={{ display: "flex", gap: 18, padding: "0 16px" }}>
          {[["files", "Fayllar"], ["tasks", "Vazifalar"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 0 8px", fontSize: 12, fontWeight: tab === k ? 600 : 400, color: tab === k ? C.text : C.muted, borderBottom: `1.5px solid ${tab === k ? C.text : "transparent"}` }}>{l}</button>
          ))}
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 10.5, color: C.faint }} className="tnum">{tab === "files" ? `${changes.length} o‘zgardi` : `${tasks.length} vazifa`}</span>
        </div>
        <div style={{ height: 1, background: C.border, marginTop: -1 }} />

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 12px" }}>
          {tab === "files" ? (
            rows.length === 0 ? <div style={{ padding: "12px 9px", fontSize: 12, color: C.faint }}>Papka bo‘sh yoki tanlanmagan</div> :
            rows.map((r) => (
              <button key={r.path} className="h-surf2"
                onClick={() => r.dir ? setOpenDirs((o) => ({ ...o, [r.path]: !o[r.path] })) : openFile(r)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, height: 27, paddingRight: 8, paddingLeft: 8 + r.depth * 14, borderRadius: 7, textAlign: "left", color: r.dir ? C.text : C.muted, fontSize: 12 }}>
                {r.dir
                  ? <Ico s={13} w={1.6} stroke={C.faint}><path d="M9 6l6 6-6 6" transform={r.isOpen ? "rotate(90 12 12)" : ""} /></Ico>
                  : <Ico s={14} stroke="currentColor"><g style={{ opacity: 0.6, marginLeft: 13 }}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></g></Ico>}
                <span className="trunc" style={{ flex: 1, fontFamily: r.dir ? "inherit" : C.mono, fontWeight: r.dir ? 600 : 400 }}>{r.name}</span>
              </button>
            ))
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {tasks.length === 0 ? <div style={{ padding: "12px 9px", fontSize: 12, color: C.faint }}>Hali vazifa yo‘q</div> :
              tasks.map((t, i) => (
                <button key={i} className="h-surf2" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 10px", borderRadius: 8, textAlign: "left" }}>
                  <span style={{ flex: "none", marginTop: 6, width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="trunc" style={{ display: "block", fontSize: 12, color: C.text }}>{t.title}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: C.faint }} className="tnum">{t.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ height: 1, background: C.border }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
          <span style={{ flex: "none", width: 26, height: 26, borderRadius: "50%", background: C.surface2, border: `1px solid ${C.border}`, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600, color: C.muted }}>{initials}</span>
          <span className="trunc" style={{ flex: 1 }}>
            <span className="trunc" style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{info.authed ? (info.email || "akkaunt") : "Kirilmagan"}</span>
            <span className="trunc" style={{ display: "block", fontSize: 10.5, color: C.faint }}>{info.authed ? "Pro · mahalliy" : "sovereign login"}</span>
          </span>
        </div>
      </aside>

      {/* ░ MAIN ░ */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        <header style={{ flex: "none", height: 53, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: `1px solid ${C.border}`, background: "rgba(15,15,16,0.72)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", flex: "none", padding: 2, gap: 2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9 }}>
            {[["chat", "Chat"], ["code", "Kod"]].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} style={{ height: 26, padding: "0 13px", borderRadius: 7, fontSize: 12, fontWeight: mode === k ? 600 : 400, color: mode === k ? C.text : C.muted, background: mode === k ? C.surface2 : "transparent" }}>{l}</button>
            ))}
          </div>
          <div className="trunc" style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, fontSize: 12, color: C.muted }}>
            <Ico s={14} stroke="currentColor"><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" style={{ opacity: 0.8 }} /></Ico>
            {breadcrumb.length ? breadcrumb.map((b, i) => (
              <React.Fragment key={i}>{i > 0 && <span style={{ color: C.faint }}>/</span>}<span style={i === breadcrumb.length - 1 ? { color: C.text } : undefined}>{b}</span></React.Fragment>
            )) : <span>SOVEREIGN Cowork</span>}
          </div>
          <div style={{ marginLeft: "auto", flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", padding: 2, gap: 2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9 }}>
              {["Xotirjam", "Aniq", "Jasur"].map((v) => (
                <button key={v} onClick={() => setTone(v)} style={{ height: 24, padding: "0 10px", borderRadius: 7, fontSize: 11.5, color: tone === v ? C.text : C.faint, background: tone === v ? C.surface2 : "transparent" }}>{v}</button>
              ))}
            </div>
            {info.baseUrl && <ModelPicker baseUrl={info.baseUrl} label={modelName} onSelect={onSelectModel} />}
            <button className="h-surf2" onClick={() => setTermOpen((o) => !o)} title="Terminal" style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, color: termOpen ? C.text : C.muted }}>
              <Ico><path d="M6 8l4 4-4 4" /><path d="M13 16h5" /></Ico>
            </button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div ref={logRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {view === "empty" && (
              <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", animation: "dcFade 220ms ease-out" }}>
                <div className="diamond" style={{ width: 44, height: 44, borderRadius: 12, opacity: 0.92, marginBottom: 38 }} />
                <h1 style={{ margin: 0, fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em" }}>{mode === "chat" ? "Suhbatlashamiz" : "Nima ustida ishlaymiz?"}</h1>
                <p style={{ margin: "10px 0 0", maxWidth: 430, textAlign: "center", fontSize: 13, color: C.muted }}>{mode === "chat" ? "Oddiy savol-javob — vositasiz." : "Vazifani tabiiy tilda yozing. Fayllarni o‘qiyman, o‘zgarishni diff bilan ko‘rsataman — tasdiqlamaguningizcha hech narsa yozilmaydi."}</p>
                {mode === "code" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 30, maxWidth: 560 }}>
                    {["src papkasida Express server yarat", "landing page yarat: hero, footer", "testlarni ishga tushir", "README yoz"].map((hnt) => (
                      <button key={hnt} className="h-surf2 h-lift" onClick={() => setInput(hnt)} style={{ padding: "7px 13px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, fontSize: 12, color: C.muted, transition: "all 170ms ease-out" }}>{hnt}</button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 44, fontSize: 11, color: C.faint }} className="mono">Enter yuborish · model tepada · terminal o‘ngda</div>
              </div>
            )}

            {view !== "empty" && (
              <div style={{ maxWidth: mode === "chat" ? 760 : 800, margin: "0 auto", padding: "30px 24px 24px", display: "flex", flexDirection: "column", gap: 20, animation: "dcFade 220ms ease-out" }}>
                {log.map((it) => it.kind === "user" ? (
                  <div key={it.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "78%", padding: "11px 15px", borderRadius: "14px 14px 4px 14px", background: C.surface2, border: `1px solid ${C.border}`, fontSize: 13.5 }}>{it.text}</div>
                  </div>
                ) : it.kind === "assistant" ? (
                  <div key={it.id} style={{ display: "flex", gap: 12 }}>
                    <div className="diamond" style={{ flex: "none", width: 24, height: 24, marginTop: 2, borderRadius: 7, opacity: 0.9 }} />
                    <div data-md style={{ minWidth: 0, flex: 1, fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: it.html }} />
                  </div>
                ) : it.kind === "error" ? (
                  <div key={it.id} style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: "none", width: 24, height: 24, marginTop: 2, borderRadius: 7, background: "rgba(224,104,94,0.18)" }} />
                    <div style={{ minWidth: 0, flex: 1, fontSize: 13.5, color: C.err }}>{it.text}</div>
                  </div>
                ) : (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, maxWidth: 520 }}>
                    <ToolIcon name={it.name} />
                    <span style={{ fontSize: 12, color: C.muted }}>{toolVerb(it.name)}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: C.text }}>{it.args?.path || it.args?.command || ""}</span>
                    {it.done && <Ico s={14} w={1.7} stroke={C.ok} style={{ marginLeft: "auto" }}><path d="M5 12.5l4.5 4.5L19 7" /></Ico>}
                  </div>
                ))}

                {changes.length > 0 && (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, background: C.surface, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.warn }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{changes.length} fayl o‘zgardi</span>
                      <button onClick={undoAll} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 7, fontSize: 11.5, color: C.ok, background: "rgba(107,191,138,0.09)", border: "1px solid rgba(107,191,138,0.22)" }}>
                        <Ico s={13} w={1.6}><path d="M3 8h11a5 5 0 0 1 0 10H8" /><path d="M6.5 4.5L3 8l3.5 3.5" /></Ico> Hammasini bekor
                      </button>
                    </div>
                    {changes.map((c) => (
                      <div key={c.path} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
                        <button className="mono h-text" onClick={() => setDiffView(c)} style={{ fontSize: 11.5, color: C.text }}>{c.path.split(/[\\/]/).slice(-2).join("/")}</button>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{c.before ? "o‘zgartirildi" : "yangi"}</span>
                        <button className="h-text" onClick={() => undoChange(c)} style={{ fontSize: 11.5, color: C.faint }}>Undo</button>
                      </div>
                    ))}
                  </div>
                )}
                {busy && <div style={{ color: C.muted, fontSize: 12.5, paddingLeft: 36 }}>{mode === "chat" ? "yozyapti" : "o‘ylayapti"}<span style={{ animation: "blink 1s infinite" }}>…</span></div>}
              </div>
            )}
          </div>

          {/* Terminal */}
          {termOpen ? (
            <div style={{ flex: "none", borderTop: `1px solid ${C.border}`, background: C.surface, animation: "dcFade 180ms ease-out" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 16px" }}>
                <Ico s={14} stroke={C.muted}><path d="M6 8l4 4-4 4" /><path d="M13 16h5" /></Ico>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>Terminal</span>
                <span className="mono" style={{ fontSize: 11, color: C.faint }}>{term.length} buyruq</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                  {term.length > 0 && <button className="h-text" onClick={() => setTerm([])} style={{ fontSize: 11, color: C.faint }}>tozalash</button>}
                  <button className="h-text" onClick={() => setTermOpen(false)} style={{ fontSize: 11, color: C.faint }}>▾</button>
                </span>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px 12px", fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.7, maxHeight: 170, overflowY: "auto" }}>
                {term.length === 0 ? <div style={{ color: C.faint }}>Hali buyruq ishga tushmagan.</div> :
                term.map((t, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div><span style={{ color: C.accent }}>$</span> <span style={{ color: C.text }}>{t.command}</span></div>
                    <pre style={{ margin: "2px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", color: C.muted }}>{t.output}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button className="h-surf2" onClick={() => setTermOpen(true)} style={{ flex: "none", display: "flex", alignItems: "center", gap: 9, padding: "8px 16px", borderTop: `1px solid ${C.border}`, background: C.surface, textAlign: "left" }}>
              <Ico s={14} stroke={C.muted}><path d="M6 8l4 4-4 4" /><path d="M13 16h5" /></Ico>
              <span style={{ fontSize: 11.5, color: C.muted }}>Terminal</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }} className="mono">{term.length ? `${term.length} buyruq` : "bo‘sh"}</span>
            </button>
          )}
        </div>

        {/* Composer */}
        <div style={{ flex: "none", padding: "12px 24px 16px", borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <form onSubmit={send} className="h-bd" style={{ maxWidth: 800, margin: "0 auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: "8px 10px 8px 12px", display: "flex", alignItems: "flex-end", gap: 8 }}>
            <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 170) + "px"; }}
              placeholder={mode === "chat" ? "Xabar yozing…" : "Vazifa yozing…   (Enter — yuborish, Shift+Enter — yangi qator)"}
              style={{ flex: 1, resize: "none", maxHeight: 170, background: "none", border: "none", color: C.text, outline: "none", fontSize: 13.5, lineHeight: 1.5, padding: "4px 2px" }} />
            <button type="submit" disabled={busy} className="h-bright" style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 8, background: busy ? C.surface2 : C.accent, color: busy ? C.muted : "#1A1214", flex: "none" }}>
              <Ico w={1.7}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></Ico>
            </button>
          </form>
        </div>

        {/* Fayl ko‘ruvchi */}
        {viewer && (
          <Overlay onClose={() => setViewer(null)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span className="mono" style={{ fontSize: 12, color: C.text }}>{viewer.name}</span>
              <button className="h-text" onClick={() => setViewer(null)} style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>Yopish</button>
            </div>
            <pre style={{ margin: 0, maxHeight: "62vh", overflow: "auto", padding: 16, fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.75, color: "#cfd4ea", whiteSpace: "pre" }}><code>{viewer.content}</code></pre>
          </Overlay>
        )}
        {diffView && (
          <Overlay onClose={() => setDiffView(null)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span className="mono" style={{ fontSize: 12, color: C.text }}>{diffView.path}</span>
              <button className="h-text" onClick={() => setDiffView(null)} style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>Yopish</button>
            </div>
            <div style={{ padding: 12 }}><DiffView oldText={diffView.before} newText={diffView.after} /></div>
          </Overlay>
        )}
        {confirmReq && <ConfirmDialog req={confirmReq} onReply={replyConfirm} />}
      </main>
    </div>
  );
}

function toolVerb(n) { return ({ write_file: "yozildi", make_dir: "yaratildi", read_file: "o‘qildi", list_dir: "ko‘rildi", run_command: "buyruq" })[n] || n; }
function ToolIcon({ name }) {
  const p = { write_file: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />, make_dir: <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />, run_command: <path d="M7 5l11 7-11 7z" />, read_file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>, list_dir: <path d="M4 6h16M4 12h16M4 18h10" /> }[name] || <path d="M12 8v8M8 12h8" />;
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>{p}</svg>;
}
function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 36, background: "rgba(10,10,11,0.58)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animation: "dcFade 160ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 820, maxHeight: "100%", display: "flex", flexDirection: "column", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 28px 64px rgba(0,0,0,.6)", overflow: "hidden", animation: "dcRise 200ms ease-out" }}>{children}</div>
    </div>
  );
}
