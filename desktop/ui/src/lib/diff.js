// Qator-ma-qator diff (LCS). rows: { t: "ctx"|"add"|"del", text, a, b } (a/b — qator raqami).
export function lineDiff(oldText, newText) {
  const a = oldText ? oldText.replace(/\n$/, "").split("\n") : [];
  const b = newText ? newText.replace(/\n$/, "").split("\n") : [];
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const rows = [];
  let i = 0, j = 0, la = 1, lb = 1;
  while (i < m && j < n) {
    if (a[i] === b[j]) { rows.push({ t: "ctx", text: a[i], a: la++, b: lb++ }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ t: "del", text: a[i], a: la++ }); i++; }
    else { rows.push({ t: "add", text: b[j], b: lb++ }); j++; }
  }
  while (i < m) rows.push({ t: "del", text: a[i++], a: la++ });
  while (j < n) rows.push({ t: "add", text: b[j++], b: lb++ });
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
