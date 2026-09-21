import React, { useEffect, useRef, useState } from "react";
import FileTree from "./components/FileTree.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import { md } from "./lib/md.js";

const S = window.sovereign;
let uid = 0;
const nid = () => ++uid;

const TOOL_LABEL = {
  write_file: (a) => `✎  ${a.path} yozilyapti`,
  make_dir: (a) => `📁  ${a.path} yaratilyapti`,
  read_file: (a) => `📖  ${a.path} o‘qilyapti`,
  list_dir: () => `📂  papka ko‘zdan kechirilyapti`,
  run_command: (a) => `▶  ${a.command}`,
};

export default function App() {
  const [info, setInfo] = useState({ authed: true, email: "", model: "Auto", cwd: "" });
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [vibe, setVibe] = useState(false);
  const [tree, setTree] = useState([]);
  const [sideTab, setSideTab] = useState("files");
  const [tasks, setTasks] = useState([]);
  const [confirmReq, setConfirmReq] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [input, setInput] = useState("");

  const curAsst = useRef(null);
  const vibeRef = useRef(vibe);
  vibeRef.current = vibe;
  const logRef = useRef(null);

  const scroll = () => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const refreshTree = () => S?.fsTree().then((r) => setTree(r?.nodes ?? []));

  useEffect(() => {
    if (!S) return;
    (async () => {
      const i = await S.init();
      setInfo({ authed: i.authed, email: i.email, model: String(i.model || "Auto").replace("SOVEREIGN ", ""), cwd: i.cwd });
      refreshTree();
    })();

    const off = S.onEvent((ev) => {
      if (ev.type === "text") {
        setLog((L) => {
          if (curAsst.current != null) {
            return L.map((it) => (it.id === curAsst.current ? { ...it, html: it.html + md(ev.text) } : it));
          }
          const id = nid();
          curAsst.current = id;
          return [...L, { id, kind: "assistant", html: md(ev.text) }];
        });
      } else if (ev.type === "tool") {
        curAsst.current = null;
        setLog((L) => [...L, { id: nid(), kind: "tool", name: ev.name, args: ev.args, done: false }]);
      } else if (ev.type === "tool-done") {
        setLog((L) => {
          const idx = [...L].reverse().findIndex((it) => it.kind === "tool" && it.name === ev.name && !it.done);
          if (idx === -1) return L;
          const real = L.length - 1 - idx;
          return L.map((it, k) => (k === real ? { ...it, done: true } : it));
        });
        if (ev.name === "write_file" || ev.name === "make_dir") refreshTree();
      } else if (ev.type === "confirm") {
        if (vibeRef.current && !ev.forcePrompt) {
          S.confirmReply(ev.id, true);
          return;
        }
        setConfirmReq(ev);
      } else if (ev.type === "done") {
        curAsst.current = null;
        setBusy(false);
      } else if (ev.type === "error") {
        curAsst.current = null;
        setLog((L) => [...L, { id: nid(), kind: "error", text: ev.message }]);
        setBusy(false);
      }
      setTimeout(scroll, 0);
    });
    return off;
  }, []);

  const sendMsg = (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setLog((L) => [...L, { id: nid(), kind: "user", text }]);
    setTasks((T) => [text.slice(0, 60), ...T]);
    setInput("");
    setBusy(true);
    curAsst.current = null;
    S.send(text);
    setTimeout(scroll, 0);
  };

  const pickFolder = async () => {
    const r = await S.pickFolder();
    if (r?.cwd) {
      setInfo((i) => ({ ...i, cwd: r.cwd }));
      refreshTree();
    }
  };

  const newTask = async () => {
    await S.newTask?.();
    setLog([]);
    curAsst.current = null;
    setBusy(false);
  };

  const openFile = async (node) => {
    const r = await S.fsRead(node.path);
    setViewer({ path: node.path, name: node.name, content: r?.content ?? r?.error ?? "" });
  };

  const replyConfirm = (ok) => {
    if (confirmReq) S.confirmReply(confirmReq.id, ok);
    setConfirmReq(null);
  };

  const folderName = info.cwd.split(/[\\/]/).filter(Boolean).pop() || "Papka tanlang";

  return (
    <div className="app">
      <aside className="side">
        <div className="side-head"><span className="mark">◆</span> SOVEREIGN <span className="dim">Cowork</span></div>
        <button className="side-new" onClick={newTask}><span>+</span> Yangi vazifa</button>

        <button className="side-folder" onClick={pickFolder}>
          <span className="ficon">📁</span>
          <span className="side-folder-txt">
            <span className="fname">{folderName}</span>
            <span className="fpath dim">{info.cwd}</span>
          </span>
        </button>

        <div className="side-tabs">
          <button className={sideTab === "files" ? "on" : ""} onClick={() => setSideTab("files")}>Fayllar</button>
          <button className={sideTab === "tasks" ? "on" : ""} onClick={() => setSideTab("tasks")}>Vazifalar</button>
        </div>

        <div className="side-list">
          {sideTab === "files" ? (
            <FileTree nodes={tree} onOpen={openFile} activePath={viewer?.path} />
          ) : tasks.length ? (
            tasks.map((t, i) => <button key={i} className={`task ${i === 0 ? "active" : ""}`} title={t}>{t}</button>)
          ) : (
            <div className="tempty dim">Hali vazifa yo‘q</div>
          )}
        </div>

        <div className="side-foot">
          <div className="dim" style={info.authed ? undefined : { color: "var(--warn)" }}>
            {info.authed ? info.email || "akkaunt" : "⚠ kirilmagan — sovereign login"}
          </div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="crumb dim">{info.cwd || "SOVEREIGN Cowork"}</div>
          <div className="spacer" />
          <button className="chip"><span className="cdot">✦</span>{info.model}</button>
          <button className={`chip vibe ${vibe ? "on" : ""}`} onClick={() => setVibe((v) => !v)}>
            {vibe ? "▶▶ avto" : "○ oddiy"}
          </button>
        </header>

        <main className="log" ref={logRef}>
          {log.length === 0 && (
            <div className="empty">
              <div className="emark">◆</div>
              <h1>Ish stolidagi AI hamkoringiz</h1>
              <p className="dim">Papkani ulang va vazifa bering — reja tuzadi, fayl yozadi, ishga tushiradi va sinaydi.</p>
              <p className="hint dim">Masalan: <span className="mono">src papkasida Express server yarat va test qil</span></p>
            </div>
          )}
          {log.map((it) =>
            it.kind === "user" ? (
              <div key={it.id} className="msg user"><div className="role">Siz</div><div className="bubble">{it.text}</div></div>
            ) : it.kind === "assistant" ? (
              <div key={it.id} className="msg assistant"><div className="role">SOVEREIGN</div><div className="bubble" dangerouslySetInnerHTML={{ __html: it.html }} /></div>
            ) : it.kind === "error" ? (
              <div key={it.id} className="msg assistant"><div className="role">Xato</div><div className="bubble err">{it.text}</div></div>
            ) : (
              <div key={it.id} className="tool">
                <div className="row">
                  <span className="lbl">{(TOOL_LABEL[it.name] || (() => it.name))(it.args || {})}</span>
                  {it.done && <span className="done">✓</span>}
                </div>
              </div>
            ),
          )}
          {busy && <div className="spin">o‘ylayapti<span className="d">…</span></div>}
        </main>

        <form className="composer" onSubmit={sendMsg}>
          <textarea
            rows={1}
            value={input}
            placeholder="Vazifa yozing…   (Enter — yuborish, Shift+Enter — yangi qator)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
            }}
            style={{ height: "auto" }}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 170) + "px"; }}
          />
          <button type="submit" disabled={busy} aria-label="Yuborish">↑</button>
        </form>
      </section>

      {viewer && (
        <div className="scrim" onClick={() => setViewer(null)}>
          <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
            <div className="dtitle mono">{viewer.name}</div>
            <pre className="fileview"><code>{viewer.content}</code></pre>
            <div className="dbtns"><button className="btn primary" onClick={() => setViewer(null)}>Yopish</button></div>
          </div>
        </div>
      )}

      {confirmReq && <ConfirmDialog req={confirmReq} onReply={replyConfirm} />}
    </div>
  );
}
