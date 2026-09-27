/**
 * SOVEREIGN Skills — expert playbooks injected into the model's system prompt.
 *
 * SINGLE SOURCE OF TRUTH for the web chat (/api/chat), the CLI/Cowork proxy (/api/cli/chat)
 * and the settings endpoint (/api/cli/me). Everything in `SKILLS` is plain, JSON-serialisable
 * data (triggers are regex *source strings*), so the catalog can be shipped to other clients
 * as-is. The CLI (cli/src/skills.mjs) and Cowork (desktop/ui/src/lib/skills.js) keep small
 * display-only copies; src/config/skills.test.ts fails if their ids/aliases drift from this file.
 *
 * Prompts are distilled from public "Claude skills" (attribution + license per skill below):
 *   - ui-ux-pro-max  github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT)
 *   - apple-design   "Apple Liquid Glass" — github.com/naplesblue/apple-liquid-glass (MIT © 2026 naplesblue);
 *                    motion layer adapted there from emilkowalski/skills apple-design (MIT © 2026 Emil Kowalski)
 *   - cybersecurity  github.com/mukul975/anthropic-cybersecurity-skills (MIT) — defensive subset only
 *   - no-ai-slop     github.com/petergyang/no-ai-slop (MIT © 2026 Peter Yang)
 *   - focus-mode     github.com/ayghri/i-have-adhd (MIT © 2026 Ayoub Ghriss)
 *   - clean-code, data-viz — SOVEREIGN originals
 *
 * Prompts are written in English for the model (≈ 25–40% fewer tokens than Uzbek/Russian and
 * followed more reliably); the answer language is set separately by the caller.
 *
 * Activation: user-enabled skills apply when the message is on-topic (score ≥ 1; manual-only style
 * skills always), capped at MAX_ACTIVE_SKILLS; on top of that
 * up to MAX_AUTO_SKILLS are auto-detected from the last user message with weighted keyword
 * triggers (score ≥ TRIGGER_THRESHOLD). Trivial messages ("hi", "thanks", one word) never
 * auto-activate anything. Skills without triggers (focus-mode) are manual-only.
 */

import type { TKey } from "@/lib/i18n";

export type SkillCategory = "design" | "code" | "security" | "writing" | "data" | "style";

/** Icon identifier (lucide-style kebab name). Web → lucide-react, Cowork → its own SVG set. */
export type SkillIconName =
  | "layout-template"
  | "layers"
  | "braces"
  | "shield-check"
  | "pen-line"
  | "chart-column"
  | "focus";

export interface SkillTrigger {
  /** RegExp source (JSON-safe). */
  source: string;
  flags: string;
  /** Score contribution: 2 = strong (one hit activates), 1 = weak (needs two), negative = counter-signal. */
  weight: number;
}

export interface Skill {
  id: string;
  /** Brand name — fallback when no translation is available (server logs, old clients). */
  name: string;
  nameKey: TKey;
  descKey: TKey;
  /** Bullet points shown when the skill is expanded in the market. */
  detailKeys: TKey[];
  category: SkillCategory;
  icon: SkillIconName;
  color: string;
  /** Empty → manual toggle only (never auto-activated). */
  triggers: SkillTrigger[];
  /** Guidance appended to the system prompt when active. */
  prompt: string;
  /** On by default for new users. */
  defaultOn?: boolean;
  /** Older / alternative ids that map to this skill (stored enabled_skills keep working). */
  aliases?: string[];
  source?: { url: string; license: string };
}

/** Max skills injected into one request (user-enabled + auto), to bound prompt tokens. */
export const MAX_ACTIVE_SKILLS = 4;
/** Max skills added by auto-detection on top of the user-enabled ones. */
export const MAX_AUTO_SKILLS = 2;
/** Minimum trigger score for auto-activation. */
export const TRIGGER_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Trigger helpers — Unicode-aware word boundaries (JS `\b` is ASCII-only, so it
// fails on Cyrillic). A trailing `*` means prefix match (agglutinative Uzbek,
// Russian case endings: "dizayn*" matches "dizaynini", "дизайн*" → "дизайна").
// ---------------------------------------------------------------------------

const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function kw(weight: number, ...words: string[]): SkillTrigger {
  const alts = words.map((w) => {
    const prefix = w.endsWith("*");
    const body = escapeRe(prefix ? w.slice(0, -1) : w).replace(/ /g, "[\\s-]+");
    return prefix ? body : body + E;
  });
  return { source: `${B}(?:${alts.join("|")})`, flags: "iu", weight };
}

const strong = (...w: string[]) => kw(2, ...w);
const weak = (...w: string[]) => kw(1, ...w);

// ---------------------------------------------------------------------------
// Prompts (each ≤ ~600 tokens; see src/config/skills.test.ts for the budget check)
// ---------------------------------------------------------------------------

const UI_UX_PROMPT = `SKILL: UI/UX Pro Max — apply to any interface you design, build or review. Fix in priority order:
1. Accessibility (critical): text contrast ≥4.5:1 (large text 3:1); visible focus rings; label or aria-label on icon-only controls; keyboard order = visual order; alt text; never convey meaning by color alone; respect prefers-reduced-motion and text scaling.
2. Touch & interaction (critical): hit areas ≥44×44px, ≥8px apart; feedback within 100ms (pressed state; disabled button + spinner during async); never hover-only; confirm or allow undo for destructive actions.
3. Performance: reserve space for images and async content (no layout shift), lazy-load below the fold, skeletons for waits >300ms, virtualize long lists.
4. Style: one coherent style matched to the product; one SVG icon family (e.g. Lucide) — never emoji as icons; one radius/shadow/elevation scale; one primary CTA per screen.
5. Layout: mobile-first, breakpoints 375/768/1024/1440, no horizontal scroll, never disable zoom, 4/8px spacing scale, 60–75 character lines, min-h-dvh instead of 100vh, fixed bars never cover content.
6. Type & color: body ≥16px, line-height 1.5–1.75, a consistent type scale, semantic color tokens (no raw hex inside components), dark mode designed and contrast-checked separately (not inverted), tabular numbers in data.
7. Motion: 150–300ms micro-interactions, ≤400ms transitions, exit faster than enter, animate transform/opacity only, every animation explains a cause and effect, never block input.
8. Forms & feedback: visible labels (not placeholder-only), validate on blur, error next to the field stating cause and fix, correct input types and autocomplete; design empty, loading, error and success states.
9. Navigation: predictable back, current location highlighted, ≤5 labeled bottom-nav items, deep-linkable screens, every modal has a clear exit.
Reject: purple/pink "AI" gradients, neon on white, emoji icons, gray-on-gray text, random shadows, everything boxed in cards, decorative-only animation.
In code: semantic HTML, every state (default/hover/focus/active/disabled/loading/empty/error), responsive by default.
Before delivering, check: contrast, 44px targets, visible focus, works at 375px, reduced motion, dark-mode contrast.`;

const APPLE_PROMPT = `SKILL: Apple Liquid Glass — the current Apple visual language: calm, premium, restrained. Decide by these rules, in order:
1. One unified surface beats fragmented cards: sibling items share one white panel split by hairlines rgba(0,0,0,.07), not separately bordered or tinted cards.
2. Glass only where layers truly overlap (sticky nav, modal/popover/sheet, labels on a colored CTA). Plain content is solid #fff + soft shadow. Nav: background rgba(245,245,247,.72); backdrop-filter: saturate(180%) blur(20px). On color: rgba(255,255,255,.16), 1px rgba(255,255,255,.22) border, blur(8px). Never stack translucent on translucent.
3. Restraint is luxury: solve with whitespace and hierarchy before adding borders, fills, icons or numbers. No decorative stats, emoji or filler copy.
4. Hierarchy from weight, size and grayscale, not color. Color only for one accent (#0071e3), heat (#ff6b00) or live (#30d158).
5. Details: negative tracking on titles (H1 clamp(27px,5vw,46px)/700/-0.03em, H2 -0.02em), long body line-height ≥1.85, tabular-nums, system font stack (-apple-system, "SF Pro Text"…), never Inter/Roboto as the brand face.
Tokens: ground #f5f5f7 (cool; never cream/beige), surface #fff, row hover #fbfbfd, text #1d1d1f / #424245 / #6e6e73 / #86868b, track #e8e8ed.
Radius tiers only: pill 999 · thumb 12 · sheet button 16 · card 18 · panel 22 · hero 26.
Shadows are always two-layer: card 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05); overlay 0 2px 8px rgba(0,0,0,.1), 0 30px 80px rgba(0,0,0,.24). No hard black borders, no single heavy shadow.
Layout: flex/grid + gap; containers 720px (reading) / 1080px (grid); side padding 22px; section gap clamp(34px,6vw,56px); one column below ~680px; targets ≥44px.
Motion: static content only gets a hover lift (translateY(-2px to -3px), 0.15–0.25s). Overlays: feedback on pointer-down; enter ~400ms cubic-bezier(.32,.72,0,1), exit 250–300ms along the same path; transform-origin at the trigger; glass materializes (blur + scale + opacity together); use transitions, not keyframes, so they stay interruptible; animate transform/opacity only. Always handle prefers-reduced-motion, prefers-reduced-transparency (solid #fff) and prefers-contrast.
Interaction: every screen answers where am I, where can I go, how do I get out; prefer undo to confirmation (confirm only the irreversible); specific labels ("Save changes", not "Submit").`;

const CLEAN_CODE_PROMPT = `SKILL: Clean Code — production-quality code.
- Deliver complete, runnable code for the stated stack and versions; state assumptions in one line. Follow the project's existing conventions, naming and libraries before adding new ones.
- Small functions with one job, meaningful names, early returns, shallow nesting. No dead code, no speculative abstractions; remove duplication only when it is real.
- Handle edge cases explicitly: null/empty input, errors, timeouts, concurrency. Never swallow errors silently; fail with a message that helps fix the problem.
- Validate untrusted input at boundaries, use parameterized queries, escape output, keep secrets out of code and logs.
- Keep types strong (no \`any\` or unchecked casts in TypeScript); make invalid states unrepresentable when it is cheap.
- Use current stable APIs. Never invent functions, flags or packages; if unsure an API exists, say so.
- For non-trivial logic, include or propose focused tests for the main path and the edge cases.
- When changing existing code: minimal diff, preserve behavior unless asked, flag risky side effects.
- Explain the approach in 1–3 sentences, then the code; mention an alternative in one line only if it matters.`;

const SECURITY_PROMPT = `SKILL: Cybersecurity — defensive secure coding and security review.
Scope: the user's own or authorized systems, CTFs/labs, incident response, education. No malware, detection evasion, credential theft or attacks on third-party systems — offer the defensive equivalent.
Writing code: least privilege, deny by default, validate input at trust boundaries (schemas, allowlists), context-aware output encoding, fail closed, no secrets or personal data in logs.
Review checklist (what applies):
1. Access control (OWASP A01): each endpoint verifies the caller may access that exact resource (IDOR/BOLA); server-side role checks; no mass assignment; tenant/RLS filters.
2. Injection (A03): parameterized SQL (allowlist identifiers/ORDER BY); argv arrays, never shell strings from input; no innerHTML/dangerouslySetInnerHTML with user data; also NoSQL operators, path traversal (resolve, then check prefix), prototype pollution, unsafe deserialization, header CRLF.
3. SSRF: scheme/host allowlist for user URLs; block private and link-local ranges (169.254.169.254) after DNS resolution and on redirects.
4. Authentication (A07): argon2id/bcrypt (cost ≥12); constant-time compares; rotate the session id on login; HttpOnly+Secure+SameSite cookies; JWT: fixed alg, verify iss/aud/exp; OAuth: state + PKCE + exact redirect_uri; rate-limit login, OTP and reset.
5. Crypto (A02): no MD5/SHA-1/ECB/DES/RC4 for security; AES-GCM with unique nonces; CSPRNG tokens (never Math.random); keys from a KMS/secret store, rotated.
6. Secrets & config: none in code, git history, client bundles (NEXT_PUBLIC_*) or logs; no debug endpoints/stack traces in prod; CSP, HSTS, nosniff, frame-ancestors; never CORS * with credentials.
7. Web: CSRF protection on state changes; webhook signatures over the raw body plus a timestamp window; uploads checked by size and magic bytes, served from another origin.
8. Logic: races/TOCTOU → transactions, row locks, idempotency keys; limits on pagination and expensive calls.
9. Supply chain (A06): committed lockfile, npm/pip audit, no unreviewed install scripts, CI actions pinned by SHA.
10. Logging (A09): audit trail for auth and privilege changes, redaction, alerts on anomalies.
Findings: [CRITICAL|HIGH|MEDIUM|LOW] title — file:line — CWE/OWASP — impact — fix (diff) — confidence; sorted by severity, then the top 3 fixes. Never invent findings; say what you could not verify.`;

const NO_AI_SLOP_PROMPT = `SKILL: No AI Slop — write and edit prose like a sharp human editor.
Applies to prose you write (emails, posts, articles, docs, UI copy) and to edits of the user's drafts; code and data are exempt.
Editing: keep the writer's voice (vocabulary, cadence, bluntness, humor, honest uncertainty); make the minimum effective edit; keep the meaning — never invent claims, numbers, sources or quotes; if the audience or goal is unclear, ask one question. Return the full edited draft, then a short "What changed" list.
Detection ("does this sound like AI?", "audit this"): name each pattern below that appears, quote the line and give a few-word fix. Do not rewrite, score, or guess who wrote it.
Principles: lead with the point; active voice with a real actor; concrete names, numbers, dates and mechanisms over abstractions; portability test — a sentence that could describe any company or product gets a specific fact or gets cut; show instead of labeling ("this is important"); direct verbs ("decided", not "made a decision"); repeat the right word instead of cycling synonyms.
Cut these words and their equivalents in other languages: delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, game changer, tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount, transformative, elevate, embark, supercharge, harness, ever-evolving; fillers such as "it's worth noting", "at the end of the day", "in today's world", "when it comes to", "let's dive in", "in order to".
Cut these patterns: "not X, it's Y" contrasts; throat-clearing openers ("Here's the thing"); faux-insight setups ("what most people miss"); dramatic colon reveals; trailing "-ing" pseudo-analysis ("highlighting its commitment"); puffery ("a testament to", "a pivotal moment"); lines telling the reader what matters; weasel attribution ("experts agree") — name the source or cut it; "Not X. Not Y. Z." lists; dramatic fragments; self-answered rhetorical questions; fake-profound closing lines; "In conclusion" recaps; formatting slop (emoji in headings, bold mid-sentence, bullets where two sentences read better); em dashes as rhythm (none in short copy, at most two in long pieces).
Before sending, reread and remove anything above that slipped in.`;

const FOCUS_PROMPT = `SKILL: Focus mode — shape every answer so a reader with ADHD can act on it immediately.
1. First line = the next action or the direct answer (command, path, snippet). No context first.
2. Multi-step work → a numbered list, one bounded action per step, the fewest steps that work.
3. If anything is left open, end with ONE concrete next action doable in under two minutes.
4. No tangents: finish the main thing; offer a side issue as one separate question at the end.
5. In ongoing work, restate where things stand: "Step 3 of 5 done: X. Next: Y."
6. Time estimates in concrete units ("about 15 minutes", "an afternoon"), never "some work".
7. Make wins visible: say what works now and how to try it.
8. Errors are matter-of-fact: cause, then fix.
9. Show at most 5 items per list or group, most relevant first (this limits presentation, not analysis).
10. No preamble ("Great question", "Sure!", "Let me…"), no recap, no closing pleasantries ("Hope this helps").
Break the shape only when the user asks for an in-depth explanation (explain fully with headers, still no preamble or closer), a destructive action needs confirmation, repeated fixes keep failing (name the suspect assumption and ask one diagnostic question), or the request is genuinely ambiguous (ask one short question). System and tool instructions outrank this skill.
Before sending: from the first and last line alone, the reader must know what to do next and what just happened.`;

const DATA_VIZ_PROMPT = `SKILL: Data Viz — honest, readable charts, tables and dashboards.
- Pick the form from the question: comparison → sorted bar; trend over time → line; part-to-whole → stacked bar, or one donut with ≤5 parts; distribution → histogram or box plot; relationship → scatter; exact lookup → table.
- Bars start at zero; never truncate an axis to exaggerate; label axes with units; the title states the takeaway ("Revenue up 18% in Q3"); cite the source and date.
- Remove chart junk: no 3D, gradients, shadows or heavy gridlines; prefer direct labels to a legend when there are few series.
- Color: one hue ramp for sequential data, a diverging palette around a meaningful midpoint, at most 6–8 categorical colors, colorblind-safe (never red vs green alone); highlight the key series and mute the rest; check contrast in light and dark themes.
- Numbers: locale-aware formatting, consistent precision, tabular figures, explicit units (%, $, k, M).
- Accessibility: a one-sentence text summary of the insight, a table alternative, tooltips reachable by keyboard and touch.
- Dashboards: most important KPI first (top-left), 5–7 charts per view at most, shared scales for comparable charts, empty/loading/error states.
- In code (Recharts, Chart.js, D3, matplotlib…): responsive sizing, fewer ticks on small screens, aggregate or sample large datasets (>1000 points).`;

// ---------------------------------------------------------------------------
// Catalog (order = display order and prompt order)
// ---------------------------------------------------------------------------

export const SKILLS: Skill[] = [
  {
    id: "ui-ux-pro-max",
    name: "UI/UX Pro Max",
    nameKey: "p18SkUiuxName",
    descKey: "p18SkUiuxDesc",
    detailKeys: ["p18SkUiuxD1", "p18SkUiuxD2", "p18SkUiuxD3", "p18SkUiuxD4"],
    category: "design",
    icon: "layout-template",
    color: "#5B50F0",
    defaultOn: true,
    triggers: [
      strong(
        "ui", "ux", "ui/ux", "ui-kit", "interfeys*", "интерфейс*", "landing page", "landing", "лендинг*",
        "figma", "tailwind", "shadcn", "responsive", "adaptiv*", "адаптив*", "вёрстк*", "верстк*", "wireframe*",
        "mockup*", "макет*", "navbar", "sidebar", "a11y", "accessibility", "доступност*",
      ),
      weak(
        "design*", "dizayn*", "дизайн*", "layout", "page", "sahifa*", "страниц*", "button*", "tugma*", "кнопк*",
        "form", "forms", "forma*", "форм", "формы", "форму", "modal*", "модал*", "card*", "karta*", "карточк*",
        "component*", "komponent*", "компонент*", "color*", "colour*", "rang*", "цвет*", "font*", "shrift*",
        "шрифт*", "mobil*", "мобил*", "animation*", "animatsiya*", "анимац*", "css", "screen*", "ekran*",
        "экран*", "dashboard*", "дашборд*", "style*", "uslub*", "стил*", "dark mode", "tema*",
      ),
    ],
    prompt: UI_UX_PROMPT,
    source: { url: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", license: "MIT" },
  },
  {
    id: "apple-design",
    name: "Apple Liquid Glass",
    nameKey: "p18SkAppleName",
    descKey: "p18SkAppleDesc",
    detailKeys: ["p18SkAppleD1", "p18SkAppleD2", "p18SkAppleD3", "p18SkAppleD4"],
    category: "design",
    icon: "layers",
    color: "#0A84FF",
    aliases: ["apple-liquid-glass", "liquid-glass"],
    triggers: [
      strong(
        "liquid glass", "glassmorphism", "apple style", "apple-style", "apple design", "apple uslub*",
        "стиль apple", "в стиле apple", "apple.com", "human interface guidelines", "hig", "cupertino",
      ),
      weak(
        "apple", "ios", "iphone", "ipad", "macos", "swiftui", "visionos", "glass", "frosted", "blur",
        "стекл*", "shisha*", "minimal*", "минимал*", "premium", "премиум*", "elegant", "элегант*", "nafis*",
        "ui", "ux", "design*", "dizayn*", "дизайн*", "interfeys*", "интерфейс*",
      ),
    ],
    prompt: APPLE_PROMPT,
    source: { url: "https://github.com/naplesblue/apple-liquid-glass", license: "MIT" },
  },
  {
    id: "clean-code",
    name: "Clean Code",
    nameKey: "p18SkCleanName",
    descKey: "p18SkCleanDesc",
    detailKeys: ["p18SkCleanD1", "p18SkCleanD2", "p18SkCleanD3", "p18SkCleanD4"],
    category: "code",
    icon: "braces",
    color: "#10D4A0",
    defaultOn: true,
    triggers: [
      { source: "```", flags: "", weight: 2 },
      strong(
        "refactor*", "refaktor*", "рефактор*", "code review", "код-ревью", "ревью кода", "clean code", "toza kod",
        "чистый код", "typescript", "javascript", "python", "golang", "kotlin", "swift", "rust", "php",
        "c++", "c#", "java", "sql", "regex", "unit test*", "stack trace", "traceback", "eslint",
        "tsconfig", "package.json", "npm", "pnpm", "segfault", "nullpointer*", "typeerror", "syntaxerror",
      ),
      weak(
        "code", "coding", "kod*", "код", "кода", "коде", "коду", "кодом", "function*", "funksiya*", "функци*",
        "bug*", "баг*", "xato*", "ошибк*", "error*", "debug*", "дебаг*", "отлад*", "api", "react", "next.js",
        "nextjs", "node", "node.js", "class*", "klass*", "класс*", "method*", "метод*", "variable*",
        "o'zgaruvchi*", "перемен*", "algorithm*", "algoritm*", "алгоритм*", "script*", "skript*", "скрипт*",
        "program*", "dastur*", "программ*", "test*", "тест*", "implement*", "реализ*", "compile*",
        "database", "endpoint*", "backend", "frontend", "бэкенд*", "фронтенд*",
      ),
    ],
    prompt: CLEAN_CODE_PROMPT,
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity Pro",
    nameKey: "p18SkSecName",
    descKey: "p18SkSecDesc",
    detailKeys: ["p18SkSecD1", "p18SkSecD2", "p18SkSecD3", "p18SkSecD4"],
    category: "security",
    icon: "shield-check",
    color: "#EF4444",
    triggers: [
      strong(
        "security", "cybersecurity", "xavfsizlik*", "безопасност*", "кибербез*", "vulnerab*", "уязвим*",
        "zaiflik*", "owasp", "cwe", "cve", "xss", "csrf", "ssrf", "xxe", "idor", "rce", "sql injection",
        "sql injeksiya*", "sql-инъекц*", "command injection", "prompt injection", "pentest*", "пентест*", "penetration test*", "exploit*",
        "эксплойт*", "эксплоит*", "malware", "вредонос*", "phishing", "фишинг*", "threat model*",
        "privilege escalation", "hardening", "secure coding", "sast", "dast", "zero trust", "zero-trust",
      ),
      weak(
        "auth", "authn", "authz", "authentication", "authorization", "autentifikatsiya*", "avtorizatsiya*",
        "аутентиф*", "авториз*", "jwt", "oauth", "saml", "token*", "токен*", "password*", "parol*", "пароль*",
        "парол*", "secret*", "секрет*", "encrypt*", "shifrla*", "шифр*", "hash*", "хеш*", "хэш*", "bcrypt",
        "argon2", "tls", "https", "cors", "csp", "rls", "rbac", "api key*", "api kalit*", "cookie*", "куки",
        "session*", "sessiya*", "сесси*", "sanitiz*", "escap*", "validat*", "валидац*", "audit*", "аудит*",
        "firewall", "rate limit*", "hack*", "хак*", "взлом*", "secure", "himoya*", "защит*", "leak*", "утечк*",
      ),
    ],
    prompt: SECURITY_PROMPT,
    source: { url: "https://github.com/mukul975/anthropic-cybersecurity-skills", license: "MIT" },
  },
  {
    id: "no-ai-slop",
    name: "No AI Slop",
    nameKey: "p18SkSlopName",
    descKey: "p18SkSlopDesc",
    detailKeys: ["p18SkSlopD1", "p18SkSlopD2", "p18SkSlopD3", "p18SkSlopD4"],
    category: "writing",
    icon: "pen-line",
    color: "#F59E0B",
    // "pro-writing" — the previous writing skill; it is now part of No AI Slop.
    aliases: ["pro-writing"],
    triggers: [
      strong(
        "ai slop", "sounds like ai", "sounds robotic", "ai-generated", "humanize*", "proofread*", "copyedit*",
        "copywriting", "копирайт*", "rewrite this", "rewrite my", "tone of voice", "matnni tahrir*",
        "tahrir qil*", "matnni qayta yoz*", "отредактир*", "редактур*", "перепиши*", "blog post", "cover letter",
        "press release", "newsletter", "maqola yoz*", "пост для", "статью для", "sounds like chatgpt",
      ),
      weak(
        "matn*", "текст*", "text", "maqola*", "стать*", "article*", "essay", "esse*", "эссе", "email*",
        "e-mail", "xat", "xatni", "письм*", "post", "posts", "пост", "поста", "blog*", "блог*", "draft*",
        "qoralama*", "черновик*", "edit*", "tahrir*", "редакт*", "rewrite*", "перепис*", "tone", "ohang*",
        "headline*", "sarlavha*", "заголов*", "slogan*", "слоган*", "reklama*", "реклам*", "caption*",
        "copy", "linkedin", "telegram kanal*",
      ),
      // Code requests that mention "text"/"email" are not writing tasks.
      kw(-2, "code", "kod*", "код", "function*", "funksiya*", "функци*", "regex", "validation", "validatsiya*",
        "валидац*", "component*", "komponent*", "компонент*", "api", "sql", "css", "html"),
    ],
    prompt: NO_AI_SLOP_PROMPT,
    source: { url: "https://github.com/petergyang/no-ai-slop", license: "MIT" },
  },
  {
    id: "data-viz",
    name: "Data Viz",
    nameKey: "p18SkVizName",
    descKey: "p18SkVizDesc",
    detailKeys: ["p18SkVizD1", "p18SkVizD2", "p18SkVizD3", "p18SkVizD4"],
    category: "data",
    icon: "chart-column",
    color: "#20D4E8",
    triggers: [
      strong(
        "chart*", "grafik*", "diagramma*", "диаграмм*", "visualiz*", "visualis*", "vizualizatsiya*", "визуализ*",
        "matplotlib", "plotly", "recharts", "chart.js", "d3", "d3.js", "seaborn", "ggplot*", "histogram*",
        "gistogramma*", "гистограм*", "scatter plot", "heatmap*", "sparkline*", "infographic*", "infografika*",
        "инфограф*",
      ),
      weak(
        "jadval*", "table*", "таблиц*", "dashboard*", "дашборд*", "analytics", "analitika*", "аналитик*",
        "statist*", "статист*", "data", "dataset*", "ma'lumot*", "данны*", "kpi", "metric*", "метрик*",
        "trend*", "тренд*", "график*", "plot", "graph*", "diagram*", "axis", "legend", "excel", "csv",
      ),
    ],
    prompt: DATA_VIZ_PROMPT,
  },
  {
    id: "focus-mode",
    name: "Focus mode",
    nameKey: "p18SkFocusName",
    descKey: "p18SkFocusDesc",
    detailKeys: ["p18SkFocusD1", "p18SkFocusD2", "p18SkFocusD3", "p18SkFocusD4"],
    category: "style",
    icon: "focus",
    color: "#F97316",
    aliases: ["i-have-adhd", "adhd"],
    triggers: [], // manual toggle only
    prompt: FOCUS_PROMPT,
    source: { url: "https://github.com/ayghri/i-have-adhd", license: "MIT" },
  },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** alias → canonical id (every canonical id maps to itself). */
export const SKILL_ALIASES: Record<string, string> = Object.fromEntries(
  SKILLS.flatMap((s) => [[s.id, s.id] as const, ...(s.aliases ?? []).map((a) => [a, s.id] as const)]),
);

/** Every id accepted from clients / storage (canonical ids + aliases). */
export const KNOWN_SKILL_IDS: string[] = Object.keys(SKILL_ALIASES);

export const SKILL_CATEGORIES: SkillCategory[] = ["design", "code", "security", "writing", "data", "style"];

export const DEFAULT_ENABLED_SKILLS = SKILLS.filter((s) => s.defaultOn).map((s) => s.id);

/** Canonical id for a stored/typed id ("pro-writing" → "no-ai-slop"); null if unknown. */
export function canonicalSkillId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const key = id.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SKILL_ALIASES, key) ? SKILL_ALIASES[key] : null;
}

/** Canonical, known, de-duplicated ids (input order kept). Unknown / custom ids are dropped. */
export function normalizeSkillIds(ids: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    const c = canonicalSkillId(id);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const RE_CACHE = new Map<string, RegExp>();
function compiled(t: SkillTrigger): RegExp {
  const key = `${t.flags}/${t.source}`;
  let re = RE_CACHE.get(key);
  if (!re) {
    // Always global: scoring counts distinct matched words.
    re = new RegExp(t.source, t.flags.includes("g") ? t.flags : t.flags + "g");
    RE_CACHE.set(key, re);
  }
  return re;
}

/** Only the start of long messages matters for intent; keeps regex work bounded. */
const SCAN_CHARS = 6000;

function prepare(text: string): string {
  // Uzbek apostrophe variants (ʻ ʼ ’ ‘ ´) → ' so "ma'lumot" matches however it is typed.
  // (Backticks are left alone — ``` is a trigger.)
  return String(text ?? "").slice(0, SCAN_CHARS).replace(/[ʻʼ’‘´]/g, "'");
}

const SMALL_TALK =
  /^(?:hi|hey|hello|yo|sup|thanks|thank you|thx|ty|ok|okay|k|yes|no|yep|nope|sure|cool|nice|great|good|salom|assalomu alaykum|rahmat|raxmat|katta rahmat|ha|yo'q|xo'p|mayli|zo'r|yaxshi|tushunarli|qalaysan|qalaysiz|привет|здравствуй(?:те)?|спасибо|да|нет|ок|хорошо|понятно|понял|ясно|как дела|салом|раҳмат|ҳа|йўқ|хўп|яхши)[\s!.?,)]*$/iu;

/** Greeting / thanks / one-word messages never auto-activate skills. */
export function isTrivialMessage(text: string): boolean {
  const s = prepare(text).trim();
  if (!s) return true;
  if (s.includes("```")) return false;
  if (SMALL_TALK.test(s)) return true;
  return s.split(/\s+/).filter(Boolean).length < 2;
}

/**
 * Trigger score of one skill for a message (0 for manual-only skills). Each trigger contributes
 * weight × (distinct matched words, capped at 2) — so two different weak words ("button" + "color")
 * reach the threshold, while one word repeated does not.
 */
export function scoreSkill(skill: Skill, text: string): number {
  if (!skill.triggers.length) return 0;
  const s = prepare(text);
  let score = 0;
  for (const t of skill.triggers) {
    const hits = new Set<string>();
    for (const m of s.matchAll(compiled(t))) {
      hits.add(m[0].toLowerCase());
      if (hits.size >= 2) break;
    }
    score += t.weight * hits.size;
  }
  return score;
}

/** Skills whose triggers match the text (score ≥ threshold), best match first. Trivial text → []. */
export function detectSkills(text: string): string[] {
  if (isTrivialMessage(text)) return [];
  return SKILLS.map((s, i) => ({ id: s.id, i, score: scoreSkill(s, text) }))
    .filter((x) => x.score >= TRIGGER_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Skills active for one request: user-enabled ones (aliases resolved; if more than
 * MAX_ACTIVE_SKILLS are enabled, the most relevant to this message win) plus up to
 * MAX_AUTO_SKILLS auto-detected ones, never more than MAX_ACTIVE_SKILLS in total.
 * Returned in catalog order (stable prompt → better provider-side caching).
 */
export function resolveActiveSkills(enabled: readonly unknown[] | null | undefined, text: string): Skill[] {
  const trivial = isTrivialMessage(text);
  // Token tejash: yoqilgan (trigger'li) skill faqat xabar mavzusiga aloqador bo'lsa qo'shiladi
  // (score ≥ 1) — "salom" yoki kodga aloqasiz savolga ~600 token qo'llanma yuborilmaydi.
  // Trigger'siz (uslub) skill'lar — mas. focus-mode — yoqilgan bo'lsa doim qo'llanadi.
  let pinned = normalizeSkillIds(enabled).filter((id) => {
    const s = SKILL_BY_ID[id];
    return !s?.triggers.length || (!trivial && scoreSkill(s, text) >= 1);
  });
  if (pinned.length > MAX_ACTIVE_SKILLS) {
    const idx = (id: string) => SKILLS.findIndex((s) => s.id === id);
    const score = (id: string) => (trivial ? 0 : scoreSkill(SKILL_BY_ID[id], text));
    pinned = [...pinned].sort((a, b) => score(b) - score(a) || idx(a) - idx(b)).slice(0, MAX_ACTIVE_SKILLS);
  }
  const room = Math.min(MAX_AUTO_SKILLS, MAX_ACTIVE_SKILLS - pinned.length);
  const auto = room > 0 ? detectSkills(text).filter((id) => !pinned.includes(id)).slice(0, room) : [];
  const ids = new Set([...pinned, ...auto]);
  return SKILLS.filter((s) => ids.has(s.id));
}

const SKILLS_HEADER =
  "SOVEREIGN SKILLS — active for this request. Apply them where relevant. They never override safety rules, " +
  "the instructions above or an explicit user request. They are written in English; answer in the language " +
  "the user or the instructions above require.";

/** Combined guidance block for the active skills ("" when none). */
export function skillsPrompt(skills: readonly Skill[]): string {
  if (!skills.length) return "";
  return `${SKILLS_HEADER}\n\n${skills.map((s) => s.prompt).join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Server-side injection helpers (/api/cli/chat) — pure, unit-tested
// ---------------------------------------------------------------------------

/** Plain text of an OpenAI-style message content (string or [{type:"text",text}] parts). */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && (p as { type?: unknown }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

/** Text of the last `role: "user"` message ("" if none). */
export function lastUserText(messages: readonly { role: string; content?: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return contentText(messages[i].content);
  }
  return "";
}

/**
 * The single system message a server adds for skills: ids (for the client's chips) and content.
 * null when no skill is active.
 */
export function skillSystemMessage(
  enabled: readonly unknown[] | null | undefined,
  text: string,
): { ids: string[]; content: string } | null {
  const active = resolveActiveSkills(enabled, text);
  if (!active.length) return null;
  return { ids: active.map((s) => s.id), content: skillsPrompt(active) };
}

/**
 * Inserts the skills message right after the leading block of system messages (so the client's
 * own identity/safety prompt stays first and all system messages stay contiguous at the top —
 * some providers reject system messages after the first user turn). Returns a new array.
 */
export function withSkillMessage<M extends { role: string }>(messages: readonly M[], content: string): (M | { role: "system"; content: string })[] {
  let at = 0;
  while (at < messages.length && messages[at].role === "system") at++;
  return [...messages.slice(0, at), { role: "system", content }, ...messages.slice(at)];
}
