// CLI (../cli/src) matnlari faqat o'zbekcha — dizayn bo'yicha. UI ularni o'zgartirmaydi,
// balki ma'lum naqshlarni tanib, tanlangan tilga i18n kalitlari orqali o'giradi.
// Tanilmagan matn (buyruq chiqishi, fayl tarkibi, server xatosi) o'zgarishsiz qoladi.

const A = "['’‘ʻ`]"; // CLI ASCII apostrof ishlatadi; tarixda boshqasi ham bo'lishi mumkin

// classifyCommand() sabablari → risk.* kalitlari. Tasdiq savolida sabab KATTA harfda
// keladi, shuning uchun naqshlar registrga befarq.
const RISK = [
  [new RegExp(`^Xavfli naqsh\\b`, "i"), "risk.blocked"],
  [new RegExp(`^Bo${A}sh buyruq$`, "i"), "risk.empty"],
  [/^Shell metasimvoli\b/i, "risk.shell"],
  [new RegExp(`^Dastur yo${A}l orqali chaqirilgan$`, "i"), "risk.path-exe"],
  [/^git: fayl yozuvchi/i, "risk.git-arg"],
  [new RegExp(`^git\\s*(.*?)\\s*— faqat-o${A}qish emas$`, "i"), "risk.git-write"],
  [/^grep -R symlinklarga ergashadi$/i, "risk.grep-r"],
  [new RegExp(`^Faqat-o${A}qish ro${A}yxatida yo${A}q:\\s*(.+)$`, "i"), "risk.not-readonly"],
  [new RegExp(`^Diskka nisbiy yo${A}l\\b`, "i"), "risk.drive-rel"],
  [new RegExp(`^Ish papkasidan tashqaridagi yo${A}l:\\s*(.+)$`, "i"), "risk.outside"],
  [new RegExp(`^Himoyalangan yo${A}l:\\s*(.+)$`, "i"), "risk.protected"],
];

/** Buyruq xavfi sababini tarjima qiladi (tanilmasa — asl matn). */
export function riskText(reason, t) {
  const r = String(reason ?? "").trim();
  if (!r) return "";
  for (const [re, key] of RISK) {
    const m = re.exec(r);
    if (m) return t(key, { arg: m[1] ?? "" });
  }
  return r;
}

// "XATO: ..." dan keyingi tana qismi.
const BODY = [
  [new RegExp(`^"(.+)" — himoyalangan yo${A}l\\b[^\\n]*$`, "s"), (m, t) => t("cli.protected", { path: m[1] })],
  [/^"(.+)" topilmadi\.?$/s, (m, t) => t("cli.notFound", { path: m[1] })],
  [/^Buyruqda terminal boshqaruv belgilari bor\b.*$/s, (_m, t) => t("cli.ctrlChars")],
  [/^exit (\S+)$/, (m, t) => t("ledger.exit", { code: m[1] })],
  [/^Bu buyruq xavfli sifatida bloklandi \((.*)\)\.[^\n]*$/s, (m, t) => t("cli.blocked", { reason: riskText(m[1], t) })],
];

// To'liq natija matnlari (prefikssiz).
const WHOLE = [
  [/^OK: (.+) papkasi yaratildi\.$/s, (m, t) => t("cli.dirCreated", { path: m[1] })],
  [/^OK: (.+) yozildi\.$/s, (m, t) => t("cli.written", { path: m[1] })],
  [/^Foydalanuvchi rad etdi\b.*$/s, (_m, t) => t("cli.declined")],
  [new RegExp(`^Noma${A}lum vosita: (.+)$`, "s"), (m, t) => t("cli.unknownTool", { name: m[1] })],
  [new RegExp(`^\\(bo${A}sh\\)$`), (_m, t) => t("cli.empty")],
  [/^Bu amal shu navbatda allaqachon MUVAFFAQIYATLI\b.*$/s, (_m, t) => t("cli.skip.ok")],
  [/^Bu amalni foydalanuvchi shu navbatda RAD ETGAN\b.*$/s, (_m, t) => t("cli.skip.declined")],
  [/^Bu amal shu navbatda XATO bergan(?: \((.*?)\))? va shundan beri\b.*$/s, (m, t) => t("cli.skip.failed", { detail: m[1] ? ` (${localizeBody(m[1], t)})` : "" })],
];

// Buyruq chiqishi ichidagi CLI izohlari.
const INLINE = [
  [new RegExp(`Bekor qilindi \\(Ctrl\\+C\\) — jarayon to${A}xtatildi\\.`, "g"), "cli.aborted"],
  [new RegExp(`Bekor qilindi \\(Ctrl\\+C\\) — buyruq ishga tushirilmadi\\.`, "g"), "cli.notStarted"],
  [new RegExp(`Vaqt tugadi \\(120 s\\) — jarayon to${A}xtatildi\\.`, "g"), "cli.timeout"],
  [/\n(?:\.\.\.|…) \(qisqartirildi\)$/, "cli.truncated", "\n"],
];

function inline(s, t) {
  let out = s;
  for (const [re, key, lead = ""] of INLINE) out = out.replace(re, () => lead + t(key));
  return out;
}

/** "XATO:" siz xato tanasi (jurnal `detail` maydoni ham shunday). */
export function localizeBody(body, t) {
  const s = String(body ?? "");
  for (const [re, fn] of BODY) {
    const m = re.exec(s);
    if (m) return fn(m, t);
  }
  return inline(s, t);
}

/** Vosita natijasi (tool-done `result`, terminal chiqishi) — tanilgan qismlar tarjima qilinadi. */
export function localizeResult(text, t) {
  const s = String(text ?? "");
  for (const [re, fn] of WHOLE) {
    const m = re.exec(s);
    if (m) return fn(m, t);
  }
  let m = /^EXIT (\d+)\n?/.exec(s);
  if (m) return `${t("ledger.exit", { code: m[1] })}\n${inline(s.slice(m[0].length), t)}`;
  m = /^XATO \(exit ([^)]+)\):\n?/.exec(s);
  if (m) return `${t("cli.exitFail", { code: m[1] })}\n${inline(s.slice(m[0].length), t)}`;
  m = /^XATO:\s*/.exec(s);
  if (m) return `${t("cli.error")}: ${localizeBody(s.slice(m[0].length), t)}`;
  return inline(s, t);
}

/** Terminal paneli: muvaffaqiyatli chiqishdagi "EXIT 0" sarlavhasi olib tashlanadi. */
export function localizeTerminal(output, t) {
  const s = String(output ?? "");
  if (/^EXIT 0\b/.test(s)) return inline(s.replace(/^EXIT 0\n?/, ""), t);
  return localizeResult(s, t);
}

/** "Aslida nima bo'ldi" ogohlantirishi: CLI unsupportedClaim() matni yoki {code, files}. */
export function ledgerWarning(w, t) {
  if (!w) return "";
  if (typeof w === "object") {
    if (w.code === "noEffects") return t("ledger.warn.noEffects");
    if (w.code === "missed") return t("ledger.warn.missed", { files: (w.files ?? []).join(", ") });
    return "";
  }
  const s = String(w);
  if (/^Javobda amal bajarilgandek aytilgan\b/.test(s)) return t("ledger.warn.noEffects");
  const m = /^Javobda tilga olingan, lekin aslida yozilmagan: (.+?)\.?$/s.exec(s);
  if (m) return t("ledger.warn.missed", { files: m[1] });
  return s;
}
