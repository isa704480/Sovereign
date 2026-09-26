// Yengil, xavfsiz markdown → HTML. Barcha matn escape qilinadi; havolalar
// bosiladigan qilinmaydi (tashqi navigatsiya taqiqlangan). Kod bloklari
// nusxalash tugmasi bilan (App'da event delegation orqali ishlaydi).

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

function block(text) {
  const lines = text.split("\n");
  let out = "";
  let list = null; // "ul" | "ol"
  const close = () => {
    if (list) out += `</${list}>`;
    list = null;
  };
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (h) {
      close();
      const lvl = Math.min(4, h[1].length + 1);
      out += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
    } else if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        close();
        out += `<${want}>`;
        list = want;
      }
      out += `<li>${inline((ul ?? ol)[1])}</li>`;
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      close();
      out += "<hr/>";
    } else if (q) {
      close();
      out += `<blockquote>${inline(q[1])}</blockquote>`;
    } else if (line.trim()) {
      close();
      out += `<p>${inline(line)}</p>`;
    } else {
      close();
    }
  }
  close();
  return out;
}

export function md(text, copyLabel = "Copy") {
  const parts = String(text ?? "").split(/```/);
  let out = "";
  parts.forEach((seg, i) => {
    if (i % 2 === 1) {
      const nl = seg.indexOf("\n");
      const lang = nl === -1 ? "" : seg.slice(0, nl).trim().slice(0, 20);
      const code = (nl === -1 ? seg : seg.slice(nl + 1)).replace(/\n$/, "");
      out += `<div class="codeblock"><div class="codeblock-bar"><span>${esc(lang || "code")}</span><button type="button" class="codeblock-copy" data-copy>${esc(copyLabel)}</button></div><pre><code>${esc(code)}</code></pre></div>`;
    } else {
      out += block(seg);
    }
  });
  return out;
}
