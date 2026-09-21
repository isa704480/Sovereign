// SOVEREIGN Cowork — renderer. Main jarayon bilan `window.sovereign` orqali gaplashadi.
const S = window.sovereign;
const log = document.getElementById("log");
const empty = document.getElementById("empty");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const sendBtn = document.getElementById("sendBtn");
const cwdEl = document.getElementById("cwd");
const whoEl = document.getElementById("who");
const folderBtn = document.getElementById("folder");
const scrim = document.getElementById("scrim");
const dmsg = document.getElementById("dmsg");

let busy = false;
let spinEl = null;

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// Yengil markdown → HTML (kod bloki, inline kod, bold, sarlavha, ro'yxat).
function md(text) {
  const parts = String(text).split(/```/);
  let out = "";
  parts.forEach((seg, i) => {
    if (i % 2 === 1) {
      const nl = seg.indexOf("\n");
      const body = nl === -1 ? seg : seg.slice(nl + 1);
      out += `<pre><code>${esc(body.replace(/\n$/, ""))}</code></pre>`;
    } else {
      out += seg
        .split("\n")
        .map((line) => {
          const h = /^#{1,6}\s+(.*)$/.exec(line);
          if (h) return `<h3>${inline(h[1])}</h3>`;
          const li = /^\s*[-*]\s+(.*)$/.exec(line);
          if (li) return `<li>${inline(li[1])}</li>`;
          return line.trim() ? `<p>${inline(line)}</p>` : "";
        })
        .join("")
        .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
    }
  });
  return out;
}
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function atBottom() {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
}
function scroll() {
  log.scrollTop = log.scrollHeight;
}

function addUser(text) {
  empty?.remove();
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="role">Siz</div><div class="bubble">${esc(text)}</div>`;
  log.appendChild(el);
  scroll();
}

let curAssistant = null;
function assistantBubble() {
  if (curAssistant) return curAssistant;
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = `<div class="role">SOVEREIGN</div><div class="bubble"></div>`;
  log.appendChild(el);
  curAssistant = el.querySelector(".bubble");
  return curAssistant;
}
function addText(text) {
  const pin = atBottom();
  assistantBubble().innerHTML += md(text);
  if (pin) scroll();
}

const TOOL_LABEL = {
  write_file: (a) => `✎ ${a.path} yozilyapti`,
  make_dir: (a) => `📁 ${a.path} yaratilyapti`,
  read_file: (a) => `📖 ${a.path} o'qilyapti`,
  list_dir: () => `📂 papka ko'zdan kechirilyapti`,
  run_command: (a) => `▶ ${a.command}`,
};
function addTool(name, args) {
  curAssistant = null; // vositadan keyin yangi matn yangi bubble'da
  const el = document.createElement("div");
  el.className = "tool";
  const label = (TOOL_LABEL[name] || (() => name))(args || {});
  el.innerHTML = `<div class="row"><span class="g"></span><span class="lbl">${esc(label)}</span><span class="done" hidden>✓</span></div>`;
  el.dataset.name = name;
  log.appendChild(el);
  scroll();
  return el;
}
function markToolDone(name) {
  const cards = [...log.querySelectorAll(`.tool[data-name="${name}"]`)];
  const last = cards[cards.length - 1];
  last?.querySelector(".done")?.removeAttribute("hidden");
}

function showSpinner() {
  hideSpinner();
  spinEl = document.createElement("div");
  spinEl.className = "spin";
  spinEl.innerHTML = `o'ylayapti<span class="d">…</span>`;
  log.appendChild(spinEl);
  scroll();
}
function hideSpinner() {
  spinEl?.remove();
  spinEl = null;
}

function setBusy(b) {
  busy = b;
  sendBtn.disabled = b;
  if (b) showSpinner();
  else hideSpinner();
}

// ---- confirm dialog ----
let confirmId = null;
function askConfirm(id, question) {
  confirmId = id;
  dmsg.textContent = question;
  scrim.hidden = false;
}
document.getElementById("dyes").onclick = () => reply(true);
document.getElementById("dno").onclick = () => reply(false);
function reply(ok) {
  scrim.hidden = true;
  if (confirmId) S.confirmReply(confirmId, ok);
  confirmId = null;
}

// ---- events from main ----
S?.onEvent((ev) => {
  if (ev.type === "text") {
    hideSpinner();
    addText(ev.text);
  } else if (ev.type === "tool") {
    hideSpinner();
    addTool(ev.name, ev.args);
  } else if (ev.type === "tool-done") {
    markToolDone(ev.name);
    if (busy) showSpinner();
  } else if (ev.type === "confirm") {
    hideSpinner();
    askConfirm(ev.id, ev.question);
  } else if (ev.type === "done") {
    curAssistant = null;
    setBusy(false);
  } else if (ev.type === "error") {
    hideSpinner();
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = `<div class="role">Xato</div><div class="bubble" style="color:var(--err)">${esc(ev.message)}</div>`;
    log.appendChild(el);
    curAssistant = null;
    setBusy(false);
  }
});

// ---- composer ----
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  addUser(text);
  input.value = "";
  autosize();
  setBusy(true);
  S.send(text);
});

folderBtn.onclick = async () => {
  const r = await S.pickFolder();
  if (r?.cwd) cwdEl.textContent = r.cwd;
};

// ---- init ----
(async () => {
  if (!S) return; // preview (brauzerda ochilganda bridge yo'q)
  const info = await S.init();
  cwdEl.textContent = info.cwd;
  whoEl.textContent = info.authed ? `${info.email || "akkaunt"} · ${info.model}` : "kirilmagan";
  if (!info.authed) {
    whoEl.style.color = "var(--warn)";
  }
})();
