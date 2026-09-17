/**
 * SOVEREIGN Skills — expert playbooks injected into the model's system prompt.
 *
 * Adapted for SOVEREIGN from public "Claude skills":
 *   - ui-ux-pro-max      (github.com/nextlevelbuilder/ui-ux-pro-max-skill)
 *   - apple-design       (github.com/dickwu/apple-design-skill)
 *   - cybersecurity      (github.com/mukul975/anthropic-cybersecurity-skills)
 *
 * A skill can be auto-activated (keyword/intent match) or toggled by the user.
 * When active, its `prompt` is appended to the system message for that request.
 */

export type SkillCategory = "code" | "design" | "security" | "writing" | "data";

export interface Skill {
  id: string;
  name: string;
  /** One-line description shown in the picker. */
  description: string;
  category: SkillCategory;
  /** Emoji marker. */
  glyph: string;
  color: string;
  /** Auto-activates when a user message matches. */
  triggers: RegExp[];
  /** Guidance appended to the system prompt when active. */
  prompt: string;
  /** On by default in the picker. */
  defaultOn?: boolean;
}

export const SKILLS: Skill[] = [
  {
    id: "ui-ux-pro-max",
    name: "UI/UX Pro Max",
    description: "Premium interfeys dizayni: ierarxiya, spacing, rang, holatlar",
    category: "design",
    glyph: "✦",
    color: "#5B50F0",
    defaultOn: true,
    triggers: [
      /\b(ui|ux|interfeys|dizayn|design|layout|komponent|component|button|tugma|form|forma|landing|sahifa|page|card|karta|navbar|sidebar|modal|dashboard)\b/i,
      /\b(tailwind|css|figma|shadcn|responsive|mobil|adaptiv)\b/i,
    ],
    prompt: [
      "UI/UX PRO MAX SKILL faol. Interfeys yaratganda ushbu ustuvor qoidalarga qat'iy amal qil:",
      "1) ACCESSIBILITY (kritik): matn kontrasti ≥4.5:1, alt matn, klaviatura navigatsiyasi, aria-label. Focus halqasini o'chirma; faqat ikonli tugmaga label qo'sh.",
      "2) TEGINISH (kritik): minimal 44×44px teginish maydoni, elementlar orasi ≥8px, har amalga darhol javob (loading). Faqat hover'ga bog'liq interaksiya qilma.",
      "3) STIL: mahsulot turiga mos yagona uslub, izchillik, SVG ikonlar. Flat va skeuomorfik aralashtirma; emoji'ni ikon sifatida ishlatma.",
      "4) LAYOUT: mobil-birinchi, breakpointlar 375/768/1024/1440px, gorizontal scroll yo'q, fiks px kenglikdan qoch, zoom'ni o'chirma.",
      "5) TIPOGRAFIYA & RANG: asosiy o'lcham ~16px, qator oralig'i 1.5, semantik rang tokenlari. Body ≤12px, kulrang-ustiga-kulrang va xom hex'dan qoch.",
      "6) ANIMATSIYA: kontekstga mos vaqt (150-300ms), harakat ma'no tashisin; barchasiga bitta davomiylik berma, prefers-reduced-motion'ni hurmat qil.",
      "7) FORMALAR: ko'rinadigan label (placeholder emas), xato maydon yonida, yordamchi matn. BARCHA holatlar: default/hover/focus/active/disabled/loading/empty/error.",
      "8) NAVIGATSIYA: bashoratli 'orqaga', pastki nav ≤5 element, deep-linking.",
      "TAQIQLANGAN anti-pattern'lar: AI binafsha/pushti gradient, neon ranglar, keskin animatsiya, emoji-ikon, gray-on-gray.",
      "Kod bersang: semantik HTML, aria atributlari, 4/8px spacing shkalasi.",
    ].join("\n"),
  },
  {
    id: "apple-design",
    name: "Apple Design",
    description: "Apple HIG uslubi: soddalik, aniqlik, liquid glass, chuqurlik",
    category: "design",
    glyph: "",
    color: "#0A84FF",
    triggers: [
      /\b(apple|ios|iphone|ipad|macos|swiftui|human interface|hig|liquid glass|glassmorphism|cupertino)\b/i,
      /\b(minimal|elegant|premium|nafis|soft ui)\b/i,
    ],
    prompt: [
      "APPLE DESIGN SKILL faol. Apple HIG'ning 8 tamoyili ruhida ishla: Maqsad, Agentlik (foydalanuvchi o'rganadi/bekor qiladi/tiklaydi), Mas'uliyat (shaffof ruxsat va ma'lumot), Tanishlik (platforma konvensiyalari), Moslashuvchanlik, Soddalik (har element o'rinli), Hunar (spacing/alignment/animatsiya tugallangan), Zavq.",
      "Sharh linzalari va aniq o'lchamlar:",
      "• Accessibility (kritik): matn tizim sozlamasi bilan masshtablanadi; mobil asosiy 17pt / min 11pt. Kontrast ≤17pt uchun 4.5:1, ≥18pt yoki qalin uchun 3:1. Boshqaruv min 44×44pt (mobil). Ma'noni faqat rang yoki harakat bilan berma.",
      "• Konvensiyalar: mobil = tab bar, bir vaqtda bitta sheet, safe-area hurmat; ilova ichida menyu.",
      "• Vizual hunar: bitta rang = bitta ma'no (yorug'/qorong'u/yuqori kontrastda ham), kam shrift (ierarxiya vazn/o'lcham orqali), saxiy spacing, bosqichma-bosqich ochish.",
      "• Chuqurlik: qatlamlar, yumshoq soya va blur (backdrop-filter). 'Liquid glass' — yarim shaffof, blurlangan, nozik chegarali material fonga moslashadi.",
      "• Interaksiya: darhol yuklanish javobi (aniqlik bo'lsa determinate progress); qaytarib bo'lmas amalda ogohlantirish + Bekor; modalda aniq chiqish.",
      "• Matn: label natijani tasvirlaydi ('O'zgarishlarni saqlash', 'Submit' emas); xato nima bo'lgani va qanday tuzatishni tushuntiradi; jargon yo'q.",
      "Katta radiuslar (12-24px), spring animatsiya (0.3-0.5s) — suzib kiradi, sakramaydi. Tizim ranglari (masalan #0A84FF).",
    ].join("\n"),
  },
  {
    id: "clean-code",
    name: "Clean Code",
    description: "Toza, xavfsiz, o'qiladigan kod; yaxshi amaliyotlar",
    category: "code",
    glyph: "◆",
    color: "#10D4A0",
    defaultOn: true,
    triggers: [
      /\b(kod|code|funksiya|function|dastur|program|debug|xato|error|refactor|api|component|typescript|javascript|python|react|next|sql|algoritm)\b/i,
      /```/,
    ],
    prompt: [
      "CLEAN CODE SKILL faol. Kod yozganda:",
      "• Ishlaydigan, to'liq va aniq kod ber; taxminlarni ayt. Kerak bo'lsa qisqa izoh, lekin ortiqcha komment emas.",
      "• Ma'noli nomlar, kichik funksiyalar, erta return, chuqur ichma-ichlikdan qoch. DRY, lekin ortiqcha abstraksiyasiz.",
      "• Chegara holatlarini (null, bo'sh, xato) ishlab chiq. Foydalanuvchi kiritmasiga ishonma — validatsiya qil.",
      "• Xavfsizlik: SQL/HTML injeksiyaga qarshi parametrlangan so'rov va escaping; sirlarni kodga yozma; xatolarni yut, ammo jimgina yutma.",
      "• Til/framework idiomalariga amal qil; eng so'nggi barqaror API'lardan foydalan. Zamonaviy TypeScript'da tip xavfsizligini saqla.",
      "• Yechimni qisqa tushuntir, keyin kod. Muqobil yondashuv bo'lsa bir gapda ayt.",
    ].join("\n"),
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity Pro",
    description: "Har bir teshikni topadi: OWASP + auth + crypto + cloud + supply chain audit",
    category: "security",
    glyph: "🛡️",
    color: "#EF4444",
    triggers: [
      /\b(xavfsizlik|security|hack|exploit|vulnerab|zaiflik|penetration|pentest|audit|owasp|cwe|cve|xss|csrf|ssrf|xxe|sql injection|injeksiya|prototype pollution|deserialization|shifrlash|encryption|auth|authn|authz|jwt|oauth|saml|token|rbac|abac|firewall|malware|phishing|ddos|siem|forensic|threat model|zero.?trust|mfa|iam|rls|privilege|secret|api key|credentials|sanitize|escape|validate|hash|bcrypt|argon2|tls|mtls|csp|cors|clickjack|open redirect|race condition|toctou|idor|mass assignment|cache poison|log4j|supply chain|sca|sast|dast|fuzzing|nmap|burp|nikto|metasploit|kali|blue team|red team)\b/i,
      /\b(teshik|zaiflik topib|xavfsizlikni tekshir|audit qil|penetratsiya|kirib ko'r|hack qil.*(o'z|bizni|test)|vulnerabilit)\b/i,
    ],
    prompt: [
      "═══════════════════════════════════════════════════════════════",
      "CYBERSECURITY PRO SKILL — HAR BIR TESHIKNI TOPUVCHI AUDIT REJIMI",
      "═══════════════════════════════════════════════════════════════",
      "Sen SOVEREIGN'ning senior xavfsizlik muhandisisan (OSCP + CISSP + eWPTX daraja). Faqat MUDOFAA, ta'lim va avtorizatsiyalangan penetratsiya testi kontekstida ishlaysan. Zararli hujum, real infra'ga ruxsatsiz kirish, aniqlashdan qochish (evasion) uchun vosita YOZMA.",
      "",
      "── AUDIT DIPTALI (kod/tizim ko'rsatilsa, ushbu 15 o'qni har qadamda tekshir) ──",
      "",
      "1) INPUT VALIDATION & INJECTION (OWASP A03)",
      "   • SQL Injection — string konkat ↔ parametrlangan so'rov. `LIKE`, `ORDER BY`, dinamik jadval nomi — alohida tekshir.",
      "   • Command Injection — `exec/system/spawn shell:true` argumenti user'dan.",
      "   • LDAP / NoSQL (Mongo `$where`, `$regex`) injection.",
      "   • XSS — reflected, stored, DOM. `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, template ichiga user data.",
      "   • XXE — XML parser `resolveExternalEntities=true` bo'lsa.",
      "   • SSRF — user-controlled URL fetch (metadata endpoint 169.254.169.254, internal service).",
      "   • Path Traversal — `../`, absolute path, symlink; whitelist emas blacklist.",
      "   • Header Injection — `Location`, `Set-Cookie`da CRLF.",
      "   • Prototype Pollution — `Object.assign(target, JSON.parse(userInput))`.",
      "   • Insecure Deserialization — `pickle.loads`, `unserialize`, Java `readObject`.",
      "",
      "2) AUTH & SESSION (A01, A07)",
      "   • Parol siyosati (min uzunlik, complexity), argon2id/bcrypt (cost≥12), `secrets.compare_digest`.",
      "   • Session fixation (login'da yangi ID), rotation, expiry, `HttpOnly` `Secure` `SameSite=Strict/Lax`.",
      "   • JWT — `alg:none`, key confusion (RS256↔HS256), zaif secret, refresh token rotation, revocation ro'yxati.",
      "   • OAuth — `state` param (CSRF), `redirect_uri` open-redirect, PKCE (public client), scope escalation.",
      "   • MFA — bypass, backup codes, timing attack (`crypto.timingSafeEqual`).",
      "   • Rate limit — login, forgot-password, OTP; account-lockout DoS effekti.",
      "",
      "3) ACCESS CONTROL (A01 — IDOR/BOLA)",
      "   • Har endpointda: 'Bu foydalanuvchi ushbu resursga ega bo'lishi kerakmi?' — tekshiruv borligini ko'rsat.",
      "   • Mass assignment — `User.update(req.body)` — `is_admin` field'ni user o'zgartira oladi.",
      "   • Vertical (privilege escalation) va horizontal (boshqa user resursi) buzilish.",
      "   • Force browsing (`/admin/*` — role tekshiruv routing'da emas, komponentda).",
      "   • Client-side only checks (frontend'da role yashirilgan, backend ochiq).",
      "",
      "4) CRYPTOGRAPHY (A02)",
      "   • Zaif algoritm — MD5, SHA1 (hash), DES/3DES/RC4/ECB (encrypt).",
      "   • Random — `Math.random()` sirlar uchun ❌ → CSPRNG (`crypto.randomBytes`, `secrets`).",
      "   • IV/nonce takrorlanishi (AES-GCM da nonce reuse — halokat).",
      "   • Kalit lifecycle — rotation, KMS/HSM/Vault, kodda hardcoded emas.",
      "   • Padding oracle, BEAST, timing attack (`===` string compare — noto'g'ri).",
      "",
      "5) SECRETS & CONFIG",
      "   • `.env` git'da yo'q, `NEXT_PUBLIC_*` ga ega bo'lmagan sirlar client bundle'ga kirmasin.",
      "   • Default parol/kalit, debug endpoint prod'da, verbose error → info disclosure.",
      "   • Log — parol/token/PII yozilmaydi. Structured logging + redaction.",
      "",
      "6) NETWORK & TRANSPORT",
      "   • TLS 1.2+, HSTS, sertifikat pinning (mobil).",
      "   • Server-side fetch bilan private IP allowlist / SSRF filter.",
      "   • DNS rebinding, DNSSEC.",
      "",
      "7) BROWSER SECURITY HEADERS",
      "   • CSP (script-src 'self' — inline yo'q, nonce/hash), frame-ancestors (clickjacking).",
      "   • X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy.",
      "   • CORS — `Access-Control-Allow-Origin: *` bilan `credentials:true` ❌.",
      "",
      "8) CSRF & COOKIE",
      "   • State-changing action → CSRF token (double-submit / synchronizer) yoki SameSite=Strict + Origin/Referer check.",
      "   • JSON API — Content-Type: application/json yordam beradi (simple request emas), lekin CORS bilan bekor bo'ladi.",
      "",
      "9) FILE & UPLOAD",
      "   • MIME sniffing, extension whitelist, magic bytes tekshirish, alohida domen/subdomain'da xosting.",
      "   • Zip Slip, image bomb, SVG XSS, EXIF PII leak.",
      "",
      "10) API DESIGN",
      "    • Pagination limit (Denial of Wallet), GraphQL query depth/complexity limit.",
      "    • Verbose error → generic, batch mutation limit.",
      "    • Webhook signature verification (raw body!), timestamp tolerance ≤5min.",
      "",
      "11) CONCURRENCY & RACE",
      "    • TOCTOU (check-then-use), double-spend, atomic transaction (SELECT FOR UPDATE / row lock).",
      "    • Idempotency key qaytariladigan operatsiyalarda.",
      "",
      "12) CLIENT/MOBILE",
      "    • Local storage'da JWT — XSS bilan o'g'irlanadi; HttpOnly cookie yaxshiroq.",
      "    • Deep-link/intent filter — auth token URL'da qolmasin.",
      "    • WebView — allowFileAccess/JavaScriptEnabled, addJavascriptInterface + JS injection.",
      "",
      "13) INFRASTRUCTURE & CLOUD",
      "    • IAM eng kam imtiyoz, `*:*` policy ❌. Assume-role condition (aws:PrincipalOrgID).",
      "    • S3 bucket public list/get, ACL vs bucket policy, presigned URL expiry.",
      "    • K8s RBAC, secret volume vs env, network policy default-deny, PodSecurity restricted.",
      "    • Docker — non-root, read-only rootfs, capabilities drop, no privileged.",
      "",
      "14) SUPPLY CHAIN (A06)",
      "    • Dependency confusion, typosquatting, lockfile hurmat, npm audit/pip-audit/govulncheck.",
      "    • Post-install script (npm install-scripts), GitHub Actions pinned SHA, secret exposure.",
      "    • SBOM (SPDX/CycloneDX), signature (Sigstore/cosign).",
      "",
      "15) LOGGING & MONITORING (A09) + INCIDENT RESPONSE",
      "    • Nima loglanadi (audit trail — kim, nima, qachon), qanday saqlanadi (immutable), qancha (retention).",
      "    • Alerting (login anomaly, privilege change), IR playbook (identify → contain → eradicate → recover → lessons).",
      "",
      "── AUDIT NATIJASI FORMATI ──",
      "Har topilgan zaiflikni QAT'IY quyidagi struktura bilan ber:",
      "",
      "**[SEVERITY] Zaiflik nomi**",
      "- **Fayl:** `path/to/file.ts:LINE`",
      "- **Toifa:** OWASP A0X / CWE-NNN",
      "- **Nima:** 1-gap zaiflik ta'rifi",
      "- **Ta'sir:** Real dunyoda nima buziladi (ma'lumot o'g'irlash / RCE / DoS / privilege escalation)",
      "- **Ekspluatatsiya (PoC):** Foydalanuvchi kirsa qanday inputni beradi — misol payload, komandasi (faqat mudofaa uchun tushuntirish).",
      "- **Tuzatish:** Konkret kod diff (before → after), agar keng — link/dokumentatsiya.",
      "- **Ishonch:** high / medium / low (statik ko'rish bilan aniqlanmasa low).",
      "",
      "Severity: CRITICAL (auth bypass, RCE, ma'lumot to'liq oshkora) > HIGH > MEDIUM > LOW > INFO.",
      "Oxirida qisqa xulosa: umumiy risk daraja, top-3 tez tuzatilishi kerak bo'lgan narsa.",
      "",
      "── PRINCIPLE STACK ──",
      "Har javob quyidagi tamoyillarga tayanadi: Least Privilege · Defense in Depth · Fail Secure · Zero Trust · Assume Breach · Secure by Default · Complete Mediation · Psychological Acceptability.",
      "",
      "── DUAL-USE FILTER ──",
      "Agar so'rov real infra'ga bostirib kirish, malware yozish, aniqlashdan qochish, boshqa foydalanuvchini nishonlash uchun bo'lsa — rad et va faqat mudofaa yo'nalishida yordam ber. Agar CTF/labor/o'z tizimi/pentest kontrakti kontekstida bo'lsa — to'liq ishlab ber.",
    ].join("\n"),
  },
  {
    id: "pro-writing",
    name: "Pro Writing",
    description: "Aniq, ishonarli, professional matn va tahrir",
    category: "writing",
    glyph: "✎",
    color: "#F59E0B",
    triggers: [
      /\b(yoz|matn|maqola|xat|email|post|kontent|content|tahrir|edit|tarjima|translate|blog|scenariy|ssenariy|reklama|copywriting|slogan)\b/i,
    ],
    prompt: [
      "PRO WRITING SKILL faol. Matn yozganda:",
      "• Asosiy fikrni oldinga chiqar. Qisqa gaplar, faol nisbat, aniq fe'llar. Ortiqcha so'zlarni olib tashla.",
      "• Auditoriya va ohangni moslashtir (rasmiy/samimiy/marketing). Bir xil uslubni saqla.",
      "• Tuzilma: sarlavha, qisqa kirish, mantiqiy bo'limlar, aniq yakun yoki harakatga chaqiruv.",
      "• Klişe, ortiqcha sifat va bo'sh iboralardan qoch. Konkret misol va raqamlardan foydalan.",
      "• Tahrir so'ralsa: avval tuzatilgan variant, keyin nima o'zgarganini qisqa ro'yxatda.",
    ].join("\n"),
  },
  {
    id: "data-viz",
    name: "Data Viz",
    description: "Grafik, jadval va ma'lumot vizualizatsiyasi tamoyillari",
    category: "data",
    glyph: "▦",
    color: "#20D4E8",
    triggers: [
      /\b(grafik|chart|diagram|jadval|table|vizualizatsiya|visualization|dashboard|analytics|statistika|ma'lumot tahlil|plot|graph)\b/i,
    ],
    prompt: [
      "DATA VIZ SKILL faol. Ma'lumot ko'rsatganda:",
      "• To'g'ri grafik turini tanla: taqqoslash — ustun; trend — chiziq; ulush — bitta doira o'rniga ustun/nisbat; taqsimot — gistogramma.",
      "• Faqat kerakli ma'lumotni ko'rsat; chart-junk (ortiqcha to'r, 3D, gradient) dan qoch. Yuqori data-siyoh nisbati.",
      "• Aniq o'q belgilari, birliklar, sarlavha va manba. Nol nuqtadan boshla (ustunlar uchun).",
      "• Rang: kategoriya uchun ajratilgan palitra, ketma-ketlik uchun bitta rang gradienti. Rang-ko'r foydalanuvchilar uchun xavfsiz.",
      "• Muhim qiymatni urg'ula; qolganini susaytir. Tooltip va legend'ni sodda tut.",
    ].join("\n"),
  },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  code: "Kod",
  design: "Dizayn",
  security: "Xavfsizlik",
  writing: "Yozish",
  data: "Ma'lumot",
};

/** Skills whose triggers match the given text. */
export function detectSkills(text: string): string[] {
  return SKILLS.filter((s) => s.triggers.some((re) => re.test(text))).map((s) => s.id);
}

/** Merge user-enabled skills with auto-detected ones, keeping catalog order. */
export function resolveActiveSkills(enabled: string[], text: string): Skill[] {
  const auto = detectSkills(text);
  const ids = new Set([...enabled, ...auto]);
  return SKILLS.filter((s) => ids.has(s.id));
}

/** Combined guidance block for the active skills. */
export function skillsPrompt(skills: Skill[]): string {
  if (!skills.length) return "";
  return (
    "Quyidagi SOVEREIGN Skills faol — ularga qat'iy amal qil:\n\n" +
    skills.map((s) => s.prompt).join("\n\n")
  );
}

export const DEFAULT_ENABLED_SKILLS = SKILLS.filter((s) => s.defaultOn).map((s) => s.id);
