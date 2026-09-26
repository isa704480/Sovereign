// Fayl yozishdan oldin ko'rsatiladigan ixcham diff (zero-dep).
// Umumiy bosh/oxir qatorlar kesiladi, o'rtasi LCS bilan solishtiriladi;
// juda katta fayllarda faqat statistika (+N −M) chiqadi.

import { c, termWidth } from "./ui.mjs";
import { visible } from "./tools.mjs";

const LCS_MAX = 1500; // o'rta qism shu qatordan uzun bo'lsa — LCS o'rniga oddiy almashtirish

function splitLines(s) {
  const t = String(s ?? "").replace(/\r\n/g, "\n");
  if (!t) return [];
  const lines = t.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Qatorlar farqi: [{ op: " " | "-" | "+", text, a?, b? }] (a/b — 1 dan boshlangan qator raqami).
 * @returns {{ ops: {op: string, text: string, a?: number, b?: number}[], added: number, removed: number }}
 */
export function diffLines(oldText, newText) {
  const A = splitLines(oldText);
  const B = splitLines(newText);
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a = A.slice(pre, A.length - suf);
  const b = B.slice(pre, B.length - suf);

  const ops = [];
  for (let i = 0; i < pre; i++) ops.push({ op: " ", text: A[i], a: i + 1, b: i + 1 });

  if (a.length && b.length && a.length <= LCS_MAX && b.length <= LCS_MAX) {
    const n = a.length;
    const m = b.length;
    const W = m + 1;
    const dp = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        ops.push({ op: " ", text: a[i], a: pre + i + 1, b: pre + j + 1 });
        i++;
        j++;
      } else if (i < n && (j >= m || dp[(i + 1) * W + j] >= dp[i * W + j + 1])) {
        // O'chirilgan qator avval (diff an'anasi: "-" keyin "+").
        ops.push({ op: "-", text: a[i], a: pre + i + 1 });
        i++;
      } else {
        ops.push({ op: "+", text: b[j], b: pre + j + 1 });
        j++;
      }
    }
  } else {
    a.forEach((t, k) => ops.push({ op: "-", text: t, a: pre + k + 1 }));
    b.forEach((t, k) => ops.push({ op: "+", text: t, b: pre + k + 1 }));
  }
  for (let k = 0; k < suf; k++) {
    const ai = A.length - suf + k;
    const bi = B.length - suf + k;
    ops.push({ op: " ", text: A[ai], a: ai + 1, b: bi + 1 });
  }
  const added = ops.filter((o) => o.op === "+").length;
  const removed = ops.filter((o) => o.op === "-").length;
  return { ops, added, removed };
}

/**
 * Terminal uchun diff ko'rinishi (qatorlar massivi, gutter'siz).
 * O'zgarishlar atrofida `context` qator, jami `maxLines` dan oshsa kesiladi.
 */
export function renderDiff(oldText, newText, { context = 2, maxLines = 40, isNew = false } = {}) {
  const { ops, added, removed } = diffLines(isNew ? "" : oldText, newText);
  const width = Math.max(40, termWidth() - 14);
  const cut = (s) => {
    const v = visible(s).replace(/\t/g, "  ");
    return v.length > width ? v.slice(0, width - 1) + "…" : v;
  };
  const stat = `${c.green("+" + added)} ${c.red("−" + removed)}`;
  if (!added && !removed) return { lines: [c.dim("(o'zgarish yo'q — tarkib bir xil)")], added, removed, stat };

  // Ko'rsatiladigan indekslar: o'zgargan qatorlar ± context.
  const show = new Array(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.op === " ") return;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) show[k] = true;
  });

  const lines = [];
  let hidden = 0;
  let prevShown = -2;
  for (let i = 0; i < ops.length; i++) {
    if (!show[i]) continue;
    if (lines.length >= maxLines) {
      hidden += ops.slice(i).filter((o, k) => show[i + k] && o.op !== " ").length;
      break;
    }
    if (prevShown >= 0 && i !== prevShown + 1) lines.push(c.faint("   ⋯"));
    prevShown = i;
    const o = ops[i];
    const num = String(o.op === "-" ? o.a : o.b ?? o.a ?? "").padStart(4);
    if (o.op === "+") lines.push(c.faint(num) + " " + c.green("+ " + cut(o.text)));
    else if (o.op === "-") lines.push(c.faint(num) + " " + c.red("- " + cut(o.text)));
    else lines.push(c.faint(num) + " " + c.dim("  " + cut(o.text)));
  }
  if (hidden) lines.push(c.faint(`   … yana ${hidden} ta o'zgargan qator ko'rsatilmadi`));
  return { lines, added, removed, stat };
}
