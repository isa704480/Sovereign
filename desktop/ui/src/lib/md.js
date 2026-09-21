// Yengil markdown → HTML (bold, inline kod, kod bloki, sarlavha, ro'yxat).
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

export function md(text) {
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
