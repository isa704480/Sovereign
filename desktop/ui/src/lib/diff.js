// Qator-ma-qator diff (LCS). rows: { t: "ctx"|"add"|"del", text, a, b } (a/b — qator raqami).
// Umumiy bosh/oxir qatorlar avval kesiladi; o'rtasi katta bo'lsa (m*n > LCS_MAX)
// O(m*n) matritsa QURILMAYDI — o'rta qism butunlay "del + add" sifatida ko'rsatiladi
// (renderer xotirasi tugab qulamasin; barcha o'zgarishlar baribir ko'rinadi).
const LCS_MAX = 4_000_000;

export function lineDiff(oldText, newText) {
  const a = oldText ? oldText.replace(/\n$/, "").split("\n") : [];
  const b = newText ? newText.replace(/\n$/, "").split("\n") : [];

  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const rows = [];
  let la = 1, lb = 1;
  for (let k = 0; k < pre; k++) rows.push({ t: "ctx", text: a[k], a: la++, b: lb++ });

  const ma = a.slice(pre, a.length - suf);
  const mb = b.slice(pre, b.length - suf);
  const m = ma.length, n = mb.length;

  if (m * n > LCS_MAX) {
    for (const t of ma) rows.push({ t: "del", text: t, a: la++ });
    for (const t of mb) rows.push({ t: "add", text: t, b: lb++ });
  } else {
    // Tekis Uint32Array — (m+1)*(n+1) massiv-massivdan ancha yengil.
    const w = n + 1;
    const dp = new Uint32Array((m + 1) * w);
    for (let i = m - 1; i >= 0; i--)
      for (let j = n - 1; j >= 0; j--)
        dp[i * w + j] = ma[i] === mb[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (ma[i] === mb[j]) { rows.push({ t: "ctx", text: ma[i], a: la++, b: lb++ }); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { rows.push({ t: "del", text: ma[i], a: la++ }); i++; }
      else { rows.push({ t: "add", text: mb[j], b: lb++ }); j++; }
    }
    while (i < m) rows.push({ t: "del", text: ma[i++], a: la++ });
    while (j < n) rows.push({ t: "add", text: mb[j++], b: lb++ });
  }

  for (let k = a.length - suf; k < a.length; k++) rows.push({ t: "ctx", text: a[k], a: la++, b: lb++ });
  return rows;
}

export function diffStats(rows) {
  let add = 0, del = 0;
  for (const r of rows) {
    if (r.t === "add") add++;
    else if (r.t === "del") del++;
  }
  return { add, del };
}

/**
 * Faqat o'zgargan bo'laklar (hunk) + atrofida `context` qator. O'zgarmagan uzun
 * qismlar { t: "gap", count } bilan almashtiriladi — o'zgarishlar kontekst
 * qatorlari ortida "yashirinib" qolmasin.
 */
export function collapseContext(rows, context = 3) {
  const keep = new Uint8Array(rows.length);
  rows.forEach((r, i) => {
    if (r.t === "ctx") return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = 1;
  });
  const out = [];
  let gap = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (gap) { out.push({ t: "gap", count: gap }); gap = 0; }
      out.push(r);
    } else gap++;
  });
  if (gap) out.push({ t: "gap", count: gap });
  return out;
}
