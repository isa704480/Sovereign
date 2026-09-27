// @ts-check
/**
 * SOVEREIGN paneli — webview tomoni.
 *
 * Xavfsizlik eslatmasi: bu skript ishonchsiz kontekstda ishlaydi va MODEL CHIQISHI
 * shu yerga tushadi. Shu bois:
 *   - model matni hech qachon `innerHTML` ga to'g'ridan-to'g'ri qo'yilmaydi. Oqim
 *     davomida `textContent`, yakunda esa kengaytma xosti tomonidan ekranlangan
 *     (`src/core/markdown.ts`) HTML ishlatiladi;
 *   - havolalar bosilganda hech qachon `window.open` qilinmaydi — xostga `openLink`
 *     yuboriladi, u yerda yana https tekshiruvi bor;
 *   - xostdan kelgan har bir xabar turi bo'yicha tekshiriladi.
 * CSP script-src faqat nonce — `eval`, inline handler va tashqi skript mumkin emas.
 */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();

  /** @type {Record<string,string>} */
  let S = {};

  const el = {
    ctx: /** @type {HTMLElement} */ (document.getElementById("ctx")),
    log: /** @type {HTMLElement} */ (document.getElementById("log")),
    empty: /** @type {HTMLElement} */ (document.getElementById("empty")),
    gate: /** @type {HTMLElement} */ (document.getElementById("gate")),
    main: /** @type {HTMLElement} */ (document.getElementById("main")),
    input: /** @type {HTMLTextAreaElement} */ (document.getElementById("input")),
    send: /** @type {HTMLButtonElement} */ (document.getElementById("send")),
    stop: /** @type {HTMLButtonElement} */ (document.getElementById("stop")),
    fresh: /** @type {HTMLButtonElement} */ (document.getElementById("fresh")),
    useCtx: /** @type {HTMLInputElement} */ (document.getElementById("useCtx")),
    signIn: /** @type {HTMLButtonElement} */ (document.getElementById("signIn")),
    useCli: /** @type {HTMLButtonElement} */ (document.getElementById("useCli")),
    codeBox: /** @type {HTMLElement} */ (document.getElementById("codeBox")),
    codeVal: /** @type {HTMLElement} */ (document.getElementById("codeVal")),
    codeHint: /** @type {HTMLElement} */ (document.getElementById("codeHint")),
  };

  /** @type {Map<number, HTMLElement>} */
  const streams = new Map();
  let busy = false;

  function post(msg) {
    vscode.postMessage(msg);
  }

  function scroll() {
    el.log.scrollTop = el.log.scrollHeight;
  }

  function setBusy(value) {
    busy = value === true;
    el.send.disabled = busy;
    el.stop.classList.toggle("hidden", !busy);
    el.input.readOnly = busy;
  }

  function bubble(kind, who) {
    el.empty.classList.add("hidden");
    const wrap = document.createElement("div");
    wrap.className = "msg " + kind;
    if (who) {
      const label = document.createElement("div");
      label.className = "who";
      label.textContent = who;
      wrap.appendChild(label);
    }
    const body = document.createElement("div");
    body.className = "bubble";
    wrap.appendChild(body);
    el.log.appendChild(wrap);
    return body;
  }

  function send() {
    const text = el.input.value.trim();
    if (!text || busy) return;
    post({ type: "ask", text: text.slice(0, 8000), useContext: el.useCtx.checked });
    el.input.value = "";
  }

  el.send.addEventListener("click", send);
  el.stop.addEventListener("click", function () {
    post({ type: "stop" });
  });
  el.fresh.addEventListener("click", function () {
    post({ type: "newChat" });
  });
  el.signIn.addEventListener("click", function () {
    post({ type: "signIn" });
  });
  el.useCli.addEventListener("click", function () {
    post({ type: "useCliLogin" });
  });
  el.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });

  // Kod bloklari tugmalari va havolalar — bitta delegatsiya qilingan ishlovchi.
  el.log.addEventListener("click", function (e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const link = target.closest("a[data-ext]");
    if (link instanceof HTMLAnchorElement) {
      e.preventDefault();
      post({ type: "openLink", url: link.getAttribute("href") || "" });
      return;
    }

    const btn = target.closest("button.code-btn");
    if (!(btn instanceof HTMLButtonElement)) return;
    const index = Number(btn.getAttribute("data-index"));
    if (!Number.isInteger(index) || index < 0) return;
    const act = btn.getAttribute("data-act");
    if (act !== "copy" && act !== "apply") return;
    post({ type: act, index: index });
    if (act === "copy") {
      const original = btn.textContent;
      btn.textContent = S["panel.copied"] || "Copied";
      setTimeout(function () {
        btn.textContent = original;
      }, 1200);
    }
  });

  window.addEventListener("message", function (event) {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
      case "init": {
        S = msg.strings && typeof msg.strings === "object" ? msg.strings : {};
        applyStrings();
        setSignedIn(msg.signedIn === true);
        break;
      }
      case "status": {
        setSignedIn(msg.signedIn === true);
        break;
      }
      case "context": {
        el.ctx.textContent = "";
        if (typeof msg.label === "string" && msg.label) {
          const prefix = document.createTextNode((S["panel.contextOn"] || "Context: {file}").replace("{file}", ""));
          const code = document.createElement("code");
          code.textContent = msg.label;
          el.ctx.appendChild(prefix);
          el.ctx.appendChild(code);
        } else {
          el.ctx.textContent = S["panel.contextOff"] || "";
        }
        break;
      }
      case "user": {
        const body = bubble("user", S["panel.you"] || "You");
        body.textContent = String(msg.text || "");
        scroll();
        break;
      }
      case "start": {
        const body = bubble("assistant", S["panel.assistant"] || "SOVEREIGN");
        const pre = document.createElement("pre");
        pre.className = "stream";
        body.appendChild(pre);
        streams.set(Number(msg.id), body);
        setBusy(true);
        scroll();
        break;
      }
      case "delta": {
        const body = streams.get(Number(msg.id));
        if (!body) break;
        const pre = body.querySelector("pre.stream");
        if (pre) pre.textContent = (pre.textContent || "") + String(msg.text || "");
        scroll();
        break;
      }
      case "end": {
        const body = streams.get(Number(msg.id));
        streams.delete(Number(msg.id));
        setBusy(false);
        if (!body) break;
        // Xostda ekranlangan HTML (src/core/markdown.ts) — skript, xom teg va
        // https'dan boshqa havola chiqmaydi.
        body.innerHTML = typeof msg.html === "string" ? msg.html : "";
        scroll();
        break;
      }
      case "busy": {
        setBusy(msg.value === true);
        break;
      }
      case "error": {
        const body = bubble("error", null);
        body.textContent = String(msg.text || "");
        setBusy(false);
        scroll();
        break;
      }
      case "notice": {
        const body = bubble("notice", null);
        body.textContent = String(msg.text || "");
        scroll();
        break;
      }
      case "reset": {
        el.log.textContent = "";
        el.log.appendChild(el.empty);
        el.empty.classList.remove("hidden");
        streams.clear();
        setBusy(false);
        break;
      }
      case "authCode": {
        const code = String(msg.code || "");
        if (code) {
          el.codeVal.textContent = code.slice(0, 8).toUpperCase();
          el.codeBox.classList.remove("hidden");
        } else {
          el.codeBox.classList.add("hidden");
        }
        break;
      }
      case "authEnd": {
        el.codeBox.classList.add("hidden");
        break;
      }
      default:
        break;
    }
  });

  function applyStrings() {
    const nodes = document.querySelectorAll("[data-t]");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const key = node.getAttribute("data-t");
      if (key && S[key]) node.textContent = S[key];
    }
    el.input.placeholder = S["panel.placeholder"] || "";
    el.input.setAttribute("aria-label", S["panel.placeholder"] || "");
    el.codeHint.textContent = S["auth.waiting"] || "";
  }

  function setSignedIn(signedIn) {
    el.gate.classList.toggle("hidden", signedIn);
    el.main.classList.toggle("hidden", !signedIn);
  }

  post({ type: "ready" });
})();
