// SOVEREIGN Cowork — renderer. Main jarayon bilan `window.sovereign` orqali gaplashadi.
const S = window.sovereign;
const $ = (id) => document.getElementById(id);
const log = $("log");
const empty = $("empty");
const input = $("input");
const composer = $("composer");
const sendBtn = $("sendBtn");
const folderName = $("folderName");
const folderPath = $("folderPath");
const crumb = $("crumb");
const whoEl = $("who");
const modelName = $("modelName");
const vibeChip = $("vibeChip");
const taskList = $("taskList");
const scrim = $("scrim");
const dmsg = $("dmsg");

let busy = false;
let vibeOn = false;
let spinEl = null;
let curAssistant = null;

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function md(text) {
  const parts = String(text).split(/```/);
  let out = "";
  parts.forEach((seg, i) => {
    if (i % 2 === 1) {
      const nl = seg.indexOf("\n");
      out += `<pre><code>${esc((nl === -1 ? seg : seg.slice(nl + 1)).replace(/\n$/, ""))}</code></pre>`;
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
        .replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>");
    }
  });
  return out;
}

const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
const scroll = () => (log.scrollTop = log.scrollHeight);

function addUser(text) {
  empty?.remove();
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="role">Siz</div><div class="bubble">${esc(text)}</div>`;
  log.appendChild(el);
  scroll();
}
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
  write_file: (a) => `✎  ${a.path} yozilyapti`,
  make_dir: (a) => `📁  ${a.path} yaratilyapti`,
  read_file: (a) => `📖  ${a.path} o'qilyapti`,
  list_dir: () => `📂  papka ko'zdan kechirilyapti`,
  run_command: (a) => `▶  ${a.command}`,
};
function addTool(name, args) {
  curAssistant = null;
  const el = document.createElement("div");
  el.className = "tool";
  el.dataset.name = name;
  const label = (TOOL_LABEL[name] || (() => name))(args || {});
  el.innerHTML = `<div class="row"><span class="lbl">${esc(label)}</span><span class="done" hidden>✓</span></div>`;
  log.appendChild(el);
  scroll();
}
function markToolDone(name) {
  const cards = [...log.querySelectorAll(`.tool[data-name="${name}"]`)];
  cards[cards.length - 1]?.querySelector(".done")?.removeAttribute("hidden");
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
function reply(ok) {
  scrim.hidden = true;
  if (confirmId) S.confirmReply(confirmId, ok);
  confirmId = null;
}
$("dyes").onclick = () => reply(true);
$("dno").onclick = () => reply(false);
document.addEventListener("keydown", (e) => {
  if (scrim.hidden) return;
  if (e.key === "Enter") reply(true);
  if (e.key === "Escape") reply(false);
});

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
    // Vibe rejim: xavfsiz amallarni avtomatik tasdiqlaymiz (majburiylar bundan mustasno).
    if (vibeOn && !ev.forcePrompt) {
      S.confirmReply(ev.id, true);
      return;
    }
    hideSpinner();
    confirmId = ev.id;
    dmsg.textContent = ev.question || "Bu amalni bajaraymi?";
    scrim.hidden = false;
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
  input.style.height = Math.min(input.scrollHeight, 170) + "px";
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
  addTask(text);
  input.value = "";
  autosize();
  setBusy(true);
  S.send(text);
});

// ---- tasks (sidebar) ----
function addTask(text) {
  const el = document.createElement("button");
  el.className = "task active";
  [...taskList.querySelectorAll(".task.active")].forEach((t) => t.classList.remove("active"));
  el.textContent = text.slice(0, 60);
  el.title = text;
  taskList.prepend(el);
}

$("newTask").onclick = async () => {
  await S.newTask?.();
  log.querySelectorAll(".msg, .tool, .spin").forEach((n) => n.remove());
  curAssistant = null;
  setBusy(false);
};

// ---- folder ----
function setFolder(cwd) {
  const name = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;
  folderName.textContent = name;
  folderPath.textContent = cwd;
  crumb.textContent = cwd;
}
$("folder").onclick = async () => {
  const r = await S.pickFolder();
  if (r?.cwd) setFolder(r.cwd);
};

// ---- vibe ----
vibeChip.onclick = () => {
  vibeOn = !vibeOn;
  vibeChip.classList.toggle("on", vibeOn);
  vibeChip.textContent = vibeOn ? "▶▶ avto" : "○ oddiy";
};

// ---- init ----
(async () => {
  if (!S) return;
  const info = await S.init();
  setFolder(info.cwd);
  modelName.textContent = String(info.model || "Auto").replace("SOVEREIGN ", "");
  whoEl.textContent = info.authed ? info.email || "akkaunt" : "⚠ kirilmagan — sovereign login";
  if (!info.authed) whoEl.style.color = "var(--warn)";
})();
