import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { CopyCode } from "@/components/docs/CopyCode";
import { DocsMobileNav, DocsSidebar, type DocsNavItem } from "@/components/docs/DocsNav";
import { isModelVisible, MODELS } from "@/config/models";
import { formatPrice, formatRub, PLANS, planPrice, planPriceRub, TIER_ORDER, type ModelTier } from "@/config/plans";

/*
 * docs.soveregn.xyz — static English documentation (src/proxy.ts rewrites the
 * docs host to /docs). Must stay STATIC: no cookies / headers / searchParams.
 * Prices, limits and model lists come from src/config so they never drift.
 */

const SITE = "https://soveregn.xyz";
const APP = "https://app.soveregn.xyz/app";
const STATUS = "https://status.soveregn.xyz";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "SOVEREIGN AI documentation: getting started, models and plans, features, the sov CLI, the desktop app, billing, privacy and FAQ.",
  alternates: { canonical: "https://docs.soveregn.xyz" },
  openGraph: {
    title: "SOVEREIGN AI Documentation",
    description: "Guides for the SOVEREIGN multi-model AI chat, CLI and desktop app.",
    url: "https://docs.soveregn.xyz",
    siteName: "SOVEREIGN",
    type: "website",
  },
};

/** Daily image limits — mirrors IMAGES_PER_DAY in src/app/api/image/route.ts. */
const IMAGES_PER_DAY: Record<string, number> = { free: 3, starter: 15, pro: 60, ultra: 200 };
/** Relative monthly allowance (plans.ts: 150k / 450k / 1.5M / 3M tokens). */
const ALLOWANCE: Record<string, string> = { free: "1×", starter: "3×", pro: "10×", ultra: "20×" };

const NAV: DocsNavItem[] = [
  {
    id: "getting-started",
    label: "Getting started",
    children: [
      { id: "sign-up", label: "Sign up" },
      { id: "first-chat", label: "Your first chat" },
      { id: "auto-routing", label: "Auto model routing" },
    ],
  },
  { id: "models-plans", label: "Models & plans" },
  {
    id: "features",
    label: "Features",
    children: [
      { id: "image-generation", label: "Image generation" },
      { id: "research", label: "Research mode" },
      { id: "memory", label: "Memory" },
      { id: "knowledge-base", label: "Knowledge base" },
      { id: "connectors", label: "Connectors" },
      { id: "skills", label: "Skills & agent modes" },
      { id: "cowork", label: "Cowork" },
      { id: "blind-prompting", label: "Blind Prompting" },
      { id: "voice", label: "Voice input" },
    ],
  },
  {
    id: "cli",
    label: "CLI",
    children: [
      { id: "cli-install", label: "Install" },
      { id: "cli-usage", label: "Usage" },
      { id: "cli-commands", label: "Interactive commands" },
      { id: "cli-safety", label: "Safety model" },
    ],
  },
  { id: "desktop", label: "Desktop app" },
  { id: "billing", label: "Payments & billing" },
  { id: "privacy", label: "Privacy & security" },
  { id: "faq", label: "FAQ" },
  { id: "support", label: "Support" },
];

/* ─────────────────────────── small building blocks ─────────────────────────── */

function Section({ id, title, eyebrow, children }: { id: string; title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-border pt-12 first:border-t-0 first:pt-0 lg:scroll-mt-20">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-soft">{eyebrow}</p>}
      <h2 id={`${id}-h`} className="font-display mt-2 text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28 pt-4 lg:scroll-mt-20">
      <h3 className="font-display text-lg font-bold text-text-primary">
        <a href={`#${id}`} className="hover:text-primary-soft">
          {title}
        </a>
      </h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-text-secondary">{children}</div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-primary-soft underline decoration-primary-soft/40 underline-offset-[3px] hover:text-text-primary">
      {children}
    </a>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-text-muted">{children}</ul>;
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text-primary">{children}</strong>;
}

/* ─────────────────────────── derived data ─────────────────────────── */

const VISIBLE_MODELS = MODELS.filter(isModelVisible);
const MODELS_BY_TIER: Record<ModelTier, string[]> = Object.fromEntries(
  TIER_ORDER.map((tier) => [tier, VISIBLE_MODELS.filter((m) => m.tier === tier).map((m) => m.name)]),
) as Record<ModelTier, string[]>;
const TIER_NAME: Record<ModelTier, string> = { free: "Free", starter: "Basic", pro: "Pro", ultra: "Ultra" };

const yes = <span className="text-success">Yes</span>;
const no = <span className="text-text-muted">—</span>;

/* ─────────────────────────── page ─────────────────────────── */

export default function DocsPage() {
  const paid = PLANS.filter((p) => p.price > 0);

  return (
    <div id="top" className="flex min-h-full flex-1 flex-col bg-bg-base text-text-primary">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg-base/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <a href={SITE} className="flex min-w-0 items-center gap-2 rounded-lg sm:gap-2.5">
            <LogoMark size={26} />
            <span className="font-display truncate text-sm sm:text-[15px] font-extrabold tracking-tight text-text-primary">SOVEREIGN</span>
            <span className="rounded-md border border-border shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:text-[11px] text-text-secondary">
              Docs
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <a
              href={SITE}
              className="hidden rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary sm:inline-flex"
            >
              soveregn.xyz
            </a>
            <a
              href={APP}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 sm:px-3 text-sm font-medium text-white shadow-glow transition-colors hover:bg-primary-dark"
            >
              Open app <ArrowUpRight className="hidden size-3.5 sm:inline" aria-hidden />
            </a>
          </div>
        </div>
        <div className="border-t border-border lg:hidden">
          <div className="mx-auto max-w-6xl">
            <DocsMobileNav items={NAV} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 pt-10 md:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:pt-12">
        <aside className="hidden lg:block">
          <DocsSidebar items={NAV} />
        </aside>

        <main id="content" tabIndex={-1} className="min-w-0 max-w-[760px] pb-24 text-[15px] leading-relaxed text-text-secondary outline-none">
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Documentation</p>
            <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">
              SOVEREIGN AI <span className="text-gradient-brand">docs</span>
            </h1>
            <p className="mt-4 text-base text-text-secondary">
              Everything you need to use SOVEREIGN: the web app, plans and limits, the <Code>sov</Code> command-line
              agent, the desktop app and billing.
            </p>
          </div>

          <div className="space-y-14">
            {/* ─────────────── 1. Getting started ─────────────── */}
            <Section id="getting-started" eyebrow="01" title="Getting started">
              <p>
                SOVEREIGN AI is a <B>multi-model AI chat</B>: {Math.floor(VISIBLE_MODELS.length / 10) * 10}+ models from Anthropic, OpenAI,
                Google, Mistral, Meta, DeepSeek, Qwen, xAI, Z.ai, NVIDIA and Perplexity in one place, with one
                subscription. It is built <B>privacy-first</B> — Blind Prompting can mask personal data before a
                request leaves your browser, and memory is stored encrypted.
              </p>

              <Sub id="sign-up" title="Sign up">
                <p>
                  Create an account at <Ext href={`${SITE}/register`}>soveregn.xyz/register</Ext> with your email, or
                  continue with <B>Google</B> or <B>GitHub</B>. New accounts start on the <B>Free</B> plan — no card
                  required. A short onboarding runs once after sign-up, then you land in the app.
                </p>
              </Sub>

              <Sub id="first-chat" title="Your first chat">
                <List>
                  <li>
                    Open the app at <Ext href={APP}>app.soveregn.xyz</Ext> and type a message. <Code>Enter</Code> sends;
                    use the paperclip to attach images, PDFs, text or code.
                  </li>
                  <li>Pick a model from the model switcher, or leave it on Auto (the default).</li>
                  <li>Your conversations are saved in the sidebar so you can come back to them.</li>
                  <li>
                    The <B>+</B> menu next to the input holds extra tools: attach a file, your Knowledge base, Memory,
                    Create image and the Cowork folder.
                  </li>
                </List>
              </Sub>

              <Sub id="auto-routing" title="Auto model routing">
                <p>
                  The default model is <B>SOVEREIGN Auto</B>. Instead of you choosing a model, the server looks at the
                  request first and routes it to the model best suited for the task — or to a chain such as research →
                  code — within what your plan allows. You can always override it by choosing a specific model in the
                  switcher. Models your plan does not include are shown with the plan that unlocks them.
                </p>
              </Sub>
            </Section>

            {/* ─────────────── 2. Models & plans ─────────────── */}
            <Section id="models-plans" eyebrow="02" title="Models & plans">
              <p>
                There are four plans. Each paid plan includes every model from the plans below it. Yearly billing costs
                10× the monthly price — two months free.
              </p>

              <div
                role="region"
                aria-label="Plan comparison (scrolls horizontally)"
                tabIndex={0}
                className="overflow-x-auto rounded-xl border border-border"
              >
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <caption className="sr-only">SOVEREIGN plans, prices and limits</caption>
                  <thead className="bg-bg-elevated text-xs uppercase tracking-wider text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        &nbsp;
                      </th>
                      {PLANS.map((p) => (
                        <th key={p.id} scope="col" className="px-3 py-2.5 font-semibold" style={{ color: p.color }}>
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="nums divide-y divide-border">
                    {(
                      [
                        ["Monthly", (p) => (p.price ? `$${formatPrice(planPrice(p, "month"))}` : "$0")],
                        ["Yearly", (p) => (p.price ? `$${formatPrice(planPrice(p, "year"))}` : "—")],
                        ["SBP (₽ / month)", (p) => (planPriceRub(p, "month") ? formatRub(planPriceRub(p, "month")) : "—")],
                        ["Monthly usage allowance", (p) => ALLOWANCE[p.id]],
                        ["Messages per day", (p) => p.limits.messagesPerDay.toLocaleString("en-US")],
                        ["Max answer length", (p) => `${Math.round(p.limits.maxTokens / 1024)}K tokens`],
                        ["Images per day", (p) => String(IMAGES_PER_DAY[p.id])],
                        ["Full code generation", (p) => (p.limits.fullCode ? yes : no)],
                        ["Research (with sources)", (p) => (p.limits.research ? yes : no)],
                        ["Deep research", (p) => (p.limits.deepResearch ? yes : no)],
                        ["Priority queue", (p) => (p.limits.priority ? yes : no)],
                      ] as [string, (p: (typeof PLANS)[number]) => ReactNode][]
                    ).map(([label, cell]) => (
                      <tr key={label}>
                        <th scope="row" className="px-3 py-2.5 font-normal text-text-secondary">
                          {label}
                        </th>
                        {PLANS.map((p) => (
                          <td key={p.id} className="px-3 py-2.5 text-text-primary">
                            {cell(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-text-muted">
                The app shows remaining usage as a level (plenty / medium / low) rather than exact token counts. The
                allowance column shows how plans compare to Free. Plan prices are in USD; card payments may have VAT
                added at checkout.
              </p>

              <h3 className="font-display pt-2 text-lg font-bold text-text-primary">Which models each plan unlocks</h3>
              <div className="space-y-3">
                {TIER_ORDER.map((tier) => {
                  const names = MODELS_BY_TIER[tier];
                  return (
                    <div key={tier} className="rounded-xl border border-border bg-bg-elevated/60 px-4 py-3">
                      <p className="text-sm font-semibold text-text-primary">
                        {TIER_NAME[tier]} models <span className="font-normal text-text-muted">· {names.length}</span>
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">{names.join(", ")}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ─────────────── 3. Features ─────────────── */}
            <Section id="features" eyebrow="03" title="Features">
              <Sub id="image-generation" title="Image generation">
                <p>
                  Open the <B>+</B> menu and choose <B>Create image</B>, then describe the picture. Generation takes about
                  30 seconds. Daily limits by plan:{" "}
                  {PLANS.map((p, i) => (
                    <span key={p.id}>
                      {p.name} {IMAGES_PER_DAY[p.id]}
                      {i < PLANS.length - 1 ? ", " : "."}
                    </span>
                  ))}{" "}
                  The counter resets every 24 hours. If Blind Prompting is on, the image prompt is masked too.
                </p>
              </Sub>

              <Sub id="research" title="Research mode">
                <p>
                  Toggle <B>Research mode</B> under the input to answer with live web research via Perplexity, with
                  numbered citations and a sources panel. Research is available on <B>Pro</B> and <B>Ultra</B>;{" "}
                  <B>deep research</B> (Perplexity Sonar Pro) is Ultra-only. The Researcher and Business analysis agent
                  modes turn research on automatically.
                </p>
              </Sub>

              <Sub id="memory" title="Memory">
                <p>
                  SOVEREIGN remembers key facts — your name, projects and preferred style — across chats. Open{" "}
                  <B>Memory</B> from the + menu to see what it knows, delete single items or clear everything. Memory is
                  stored encrypted (see <a href="#privacy" className="text-primary-soft hover:text-text-primary">Privacy</a>).
                </p>
              </Sub>

              <Sub id="knowledge-base" title="Knowledge base (documents)">
                <p>
                  Upload your own documents — PDF, text, Markdown, JSON, CSV or code — in <B>Knowledge base</B>. They are
                  indexed so the AI can answer from them. Reference a document in a message by typing <Code>@</Code> and
                  its name; relevant passages are also retrieved automatically.
                </p>
              </Sub>

              <Sub id="connectors" title="Connectors">
                <p>
                  The <B>Connectors</B> panel lets you link outside services so the AI can work with them:
                </p>
                <List>
                  <li>
                    <B>Google</B> — Gmail, Drive, Sheets, Slides, Docs and Calendar (Google sign-in).
                  </li>
                  <li>
                    <B>Design &amp; dev</B> — Figma, GitHub, or any <B>MCP server</B> (URL plus optional token).
                  </li>
                  <li>
                    <B>Built-in</B> — CLI terminal (runs commands through <Code>sov</Code> on your computer, with a risk
                    check), Browser preview, and keyless public APIs (weather, currency, countries, crypto, time,
                    dictionary).
                  </li>
                </List>
                <p>Each connector can be switched on or off at any time.</p>
              </Sub>

              <Sub id="skills" title="Skills & agent modes">
                <p>
                  <B>SOVEREIGN Skills</B> are expert playbooks added to the model&apos;s instructions — for example UI/UX
                  Pro Max, Apple Design, Clean Code, Cybersecurity Pro, Pro Writing and Data Viz. A skill switches on
                  automatically when your message matches it, or you can toggle it yourself.
                </p>
                <p>
                  <B>Agent mode</B> sets the overall behaviour: General, Developer, Researcher, Business analysis or
                  Writer.
                </p>
              </Sub>

              <Sub id="cowork" title="Cowork">
                <p>
                  Switch the input from <B>Chat</B> to <B>Cowork</B> and choose a folder on your computer. SOVEREIGN can
                  then read files from it directly — pick files with <Code>@</Code> instead of uploading them. The folder
                  itself is never uploaded: only the files that are actually opened are sent, and your browser enforces
                  the permission you granted. For a full desktop agent that writes files, see{" "}
                  <a href="#desktop" className="text-primary-soft hover:text-text-primary">Desktop app</a> and{" "}
                  <a href="#cli" className="text-primary-soft hover:text-text-primary">CLI</a>.
                </p>
              </Sub>

              <Sub id="blind-prompting" title="Blind Prompting (PII masking)">
                <p>
                  Turn on <B>Private mode</B> under the input. Before your message is sent, personal data is replaced in
                  your browser with placeholders such as <Code>[PERSON_A]</Code> or <Code>[EMAIL_A]</Code>; the model
                  only ever sees the placeholders, and the real values are put back into the answer on your device. The
                  same value always gets the same placeholder within a conversation. Masked categories:
                </p>
                <List>
                  <li>Names of people (Latin, Cyrillic and other scripts) and company names (LLC, Inc, MChJ, GmbH…)</li>
                  <li>Email addresses, phone numbers and URLs</li>
                  <li>Card numbers, IBANs, amounts of money and crypto wallet addresses (BTC, ETH, SOL, TRX)</li>
                  <li>IP addresses and ID numbers (passport, SSN, TIN formats)</li>
                </List>
                <p className="text-sm text-text-muted">
                  Masking is pattern-based, so it can miss unusual formats — avoid pasting secrets you would not share.
                </p>
              </Sub>

              <Sub id="voice" title="Voice input">
                <p>
                  Click the microphone in the input to dictate. Speech is recognised by your browser in your interface
                  language; the button only appears in browsers that support speech recognition (for example Chrome and
                  Edge). Transcribing attached audio files is available on Pro and above.
                </p>
              </Sub>
            </Section>

            {/* ─────────────── 4. CLI ─────────────── */}
            <Section id="cli" eyebrow="04" title="CLI — sov">
              <p>
                <Code>sov</Code> is an AI coding agent in your terminal. It can create, read and edit files in your
                project folder, run commands and write code — using your SOVEREIGN account.
              </p>

              <Sub id="cli-install" title="Install">
                <p>Requires Node.js 20+ with npm. Pick your shell:</p>
                <CopyCode label="Windows — PowerShell" code="irm https://soveregn.xyz/install.ps1 | iex" prompt />
                <CopyCode label="Windows — CMD" code={'powershell -c "irm https://soveregn.xyz/install.ps1 | iex"'} prompt />
                <CopyCode label="macOS / Linux" code="curl -fsSL https://soveregn.xyz/install.sh | sh" prompt />
                <CopyCode label="Or with npm" code="npm install -g @islombekrrr/sov-cli" prompt />
                <p>Then start it:</p>
                <CopyCode label="Run" code="sov" prompt />
                <p className="text-sm text-text-muted">
                  The installers check your Node.js version and run the npm install for you (on Linux they retry with{" "}
                  <Code>sudo</Code> if the global folder needs admin rights). Both <Code>sov</Code> and{" "}
                  <Code>sovereign</Code> are installed. Uninstall with <Code>npm uninstall -g @islombekrrr/sov-cli</Code>.
                </p>
              </Sub>

              <Sub id="cli-usage" title="Usage">
                <p>
                  On first run, choose how to connect: your <B>SOVEREIGN account</B> (recommended — a browser window
                  opens, you click Allow, and your plan applies) or your own <B>OpenRouter key</B>.
                </p>
                <CopyCode
                  label="Commands"
                  code={[
                    "sov                               # interactive mode (chat + agent)",
                    'sov "build a React todo app"      # one task, then exit',
                    'sov "..." -f diagram.png -f a.pdf # attach files (--file)',
                    'sov --yes "..."                   # auto-confirm safe actions (-y)',
                    "sov login                         # connect your account in the browser",
                    "sov logout                        # sign out",
                    "sov whoami                        # connection status",
                    "sov key sk-or-v1-...              # use your own OpenRouter key",
                    "sov models                        # list models",
                    "sov help                          # help",
                  ].join("\n")}
                />
                <p>
                  Attachments: images (<Code>.png .jpg .webp .gif</Code>, up to 900 KB), PDF (up to 20 MB) and text/code
                  files (up to 2 MB). Credentials are stored only on your machine in <Code>~/.sovereign/config.json</Code>
                  ; you can also set <Code>SOVEREIGN_TOKEN</Code> or <Code>OPENROUTER_API_KEY</Code>.
                </p>
                <p>
                  On Free and Basic the CLI uses Auto routing; choosing a specific model with <Code>/model</Code> needs
                  Pro or higher. The CLI has its own daily step limit based on your plan.
                </p>
              </Sub>

              <Sub id="cli-commands" title="Interactive commands">
                <p>
                  Type <Code>/</Code> in interactive mode to open the menu.
                </p>
                <div role="region" aria-label="CLI commands (scrolls horizontally)" tabIndex={0} className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <caption className="sr-only">Interactive slash commands</caption>
                    <thead className="bg-bg-elevated text-xs uppercase tracking-wider text-text-secondary">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Command</th>
                        <th scope="col" className="px-3 py-2 font-medium">What it does</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(
                        [
                          ["/model, /models", "Pick a model (arrow-key menu, /model <id>, /model auto) or search models"],
                          ["/attach <path>, /detach", "Attach a file to the next message (or @path) / clear attachments"],
                          ["/cwd <path>", "Change the working folder"],
                          ["/vibe", "Toggle vibe mode (see Safety model)"],
                          ["/swarm <n> <task>", "Run parallel workers that draft a plan, then the agent carries it out"],
                          ["/sessions, /resume <id>", "List saved conversations and continue one"],
                          ["/rewind [n], /fork", "Undo the last question(s) / branch off the current conversation"],
                          ["/memory, /remember, /forget", "View, add or delete what the CLI remembers about you"],
                          ["/skills, /skill <id>", "List SOVEREIGN Skills / toggle one"],
                          ["/login, /logout, /whoami", "Account connection"],
                          ["/register, /upgrade", "Open sign-up or plans in the browser"],
                          ["/clear, /help, /exit", "Clear the chat, show the menu, quit"],
                        ] as const
                      ).map(([cmd, desc]) => (
                        <tr key={cmd}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-text-primary">{cmd}</td>
                          <td className="px-3 py-2">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>

              <Sub id="cli-safety" title="Safety model">
                <List>
                  <li>
                    File actions are limited to the <B>folder where you started</B> the CLI.
                  </li>
                  <li>
                    Before writing a file, creating a folder or running a command, it <B>asks for confirmation</B>{" "}
                    (<Code>y</Code> / <Code>N</Code>, or <Code>a</Code> to allow in-folder actions for the rest of the
                    session).
                  </li>
                  <li>
                    <B>Vibe mode</B> is on when you start it as <Code>sov</Code> (or with <Code>--vibe</Code>; toggle with{" "}
                    <Code>/vibe</Code>): file changes inside the working folder and read-only commands run without
                    asking. Start it as <Code>sovereign</Code> to confirm every change.
                  </li>
                </List>
                <Note>
                  <B>Always asks, no matter what</B> — even with <Code>--yes</Code>, vibe mode or &ldquo;allow all&rdquo;:
                  any path <B>outside the working folder</B>, and any <B>risky command</B> — anything not on the
                  read-only allowlist (such as <Code>ls</Code>, <Code>cat</Code>, <Code>grep</Code>, or read-only{" "}
                  <Code>git status/diff/log</Code>), commands using shell chaining or redirection, and programs called by
                  path. That covers interpreters, package managers, network tools and anything that modifies files.
                </Note>
              </Sub>
            </Section>

            {/* ─────────────── 5. Desktop ─────────────── */}
            <Section id="desktop" eyebrow="05" title="Desktop app — SOVEREIGN Cowork">
              <p>
                <B>SOVEREIGN Cowork</B> is a desktop AI coding companion (Electron) for Windows, macOS and Linux. It uses
                the same agent core as the CLI, so it behaves the same way, and adds a graphical interface: a file tree,
                a file viewer, line-by-line diffs and a confirmation dialog before the AI writes a file or runs a
                command.
              </p>
              <List>
                <li>
                  Sign-in is shared with the CLI (<Code>~/.sovereign/config.json</Code>) — run <Code>sov login</Code> once
                  and the app uses the same account.
                </li>
                <li>Open the app, choose a project folder, and describe the task.</li>
                <li>
                  The same sandbox applies: paths outside the folder and risky commands always require confirmation.
                </li>
                <li>Vibe mode and shared memory work as in the CLI.</li>
              </List>
            </Section>

            {/* ─────────────── 6. Billing ─────────────── */}
            <Section id="billing" eyebrow="06" title="Payments & billing">
              <p>
                Upgrade from the plan dialog in the app (or <Code>/upgrade</Code> in the CLI). Choose monthly or yearly,
                then a payment method:
              </p>
              <List>
                <li>
                  <B>Card</B> — Visa, Mastercard, Apple Pay, Google Pay via Dodo Payments. A subscription that renews
                  automatically each period; cancel anytime.
                </li>
                <li>
                  <B>Crypto</B> — USDT via RollyPay. A one-time payment for the chosen period (priced in rubles at the
                  current rate, paid in crypto).
                </li>
                <li>
                  <B>SBP</B> — Russian Faster Payments: bank app, QR code or MIR cards via RollyPay. One-time payment for
                  the chosen period. Monthly prices:{" "}
                  {paid.map((p, i) => (
                    <span key={p.id}>
                      {p.name} {formatRub(planPriceRub(p, "month"))}
                      {i < paid.length - 1 ? ", " : ""}
                    </span>
                  ))}
                  ; yearly is 10×.
                </li>
              </List>

              <Sub id="promo-codes" title="Promo codes">
                <p>
                  Have a promo code? Enter it in the plan dialog — it works with every payment method. Each account can
                  use a given code once, and codes can have a limited number of uses.
                </p>
              </Sub>

              <Sub id="plan-changes" title="Upgrading, downgrading and remaining time">
                <p>
                  Every payment is treated as <B>value</B>. You always stay on the <B>highest active plan</B>, and time is
                  converted between plans by their monthly price ratio:
                </p>
                <List>
                  <li>
                    <B>Upgrading</B> — the time left on your current plan is converted to the new plan (e.g. 10 days of
                    Basic at $5.99 becomes about 2.7 days of Pro at $21.99), then the new period is added on top.
                  </li>
                  <li>
                    <B>Buying a lower plan</B> while a higher one is active is blocked — extend your current plan, or buy
                    the lower one after it ends.
                  </li>
                  <li>
                    <B>Card subscription active?</B> To change plans, cancel it first (link in your Dodo email) or pay by
                    crypto/SBP — your remaining time is converted automatically, so you are never charged twice.
                  </li>
                </List>
              </Sub>

              <Sub id="refunds" title="Cancellation & refunds">
                <List>
                  <li>
                    Cancel anytime — no further payment is taken and access continues until the end of the paid period.
                  </li>
                  <li>
                    <B>7-day refund</B> on the <B>first payment</B> of a paid plan if you have not used the service
                    significantly.
                  </li>
                  <li>
                    Not refundable: renewals after the 7-day window, periods with significant use, and accounts
                    suspended for breaking the terms. Used quota is not grounds for a partial refund.
                  </li>
                  <li>Crypto payments may be non-refundable due to the nature of blockchain; reviewed case by case.</li>
                  <li>Email support with your account email and payment date; requests are usually handled in 3–5 business days.</li>
                </List>
                <p>
                  Full policy: <Ext href={`${SITE}/refund`}>soveregn.xyz/refund</Ext>.
                </p>
              </Sub>
            </Section>

            {/* ─────────────── 7. Privacy ─────────────── */}
            <Section id="privacy" eyebrow="07" title="Privacy & security">
              <List>
                <li>
                  <B>Encrypted memory</B> — memory and personal content are encrypted with AES-256-GCM and stored on the
                  server only in encrypted form.
                </li>
                <li>
                  <B>Blind Prompting</B> — optional masking of names, contacts, financial data and IDs before a request
                  reaches an AI provider (<a href="#blind-prompting" className="text-primary-soft hover:text-text-primary">details</a>).
                </li>
                <li>
                  <B>No selling, no ads</B> — data is used only to run the service. Only essential cookies; no tracking
                  or advertising cookies.
                </li>
                <li>
                  <B>Payments</B> are handled by the payment providers; SOVEREIGN does not store your card details.
                </li>
                <li>
                  <B>Your rights</B> — access, correct, export or delete your data; memory can be exported and deleted at
                  any time.
                </li>
              </List>
              <p>
                Read the full <Ext href={`${SITE}/privacy`}>Privacy Policy</Ext> and{" "}
                <Ext href={`${SITE}/terms`}>Terms of Use</Ext>.
              </p>
            </Section>

            {/* ─────────────── 8. FAQ ─────────────── */}
            <Section id="faq" eyebrow="08" title="FAQ">
              <div className="space-y-2">
                {(
                  [
                    [
                      "Is there a free plan?",
                      <>
                        Yes. Free includes {MODELS_BY_TIER.free.length} free models, Auto routing, chat history, memory
                        and {IMAGES_PER_DAY.free} images a day. No card needed.
                      </>,
                    ],
                    [
                      "Which model should I use?",
                      <>
                        Start with <B>Auto</B> — it picks a suitable model for each request. Choose a specific model when
                        you want a particular style or provider.
                      </>,
                    ],
                    [
                      "What happens when I reach my limit?",
                      <>
                        The usage indicator shows when you are running low. When the monthly allowance or daily cap is
                        reached, wait for it to reset or upgrade your plan.
                      </>,
                    ],
                    [
                      "Do AI providers see my personal data?",
                      <>
                        With Private mode (Blind Prompting) on, detected personal data is replaced with placeholders in
                        your browser before sending, so providers see only the placeholders.
                      </>,
                    ],
                    [
                      "Does the CLI need an account?",
                      <>
                        No — you can use your own OpenRouter key with <Code>sov key</Code>. With a SOVEREIGN account
                        (<Code>sov login</Code>) your plan and models apply and no API key is needed.
                      </>,
                    ],
                    [
                      "Can I switch from monthly to yearly, or change plans?",
                      <>
                        Yes. Remaining time is converted automatically — see{" "}
                        <a href="#plan-changes" className="text-primary-soft hover:text-text-primary">plan changes</a>.
                      </>,
                    ],
                  ] as [string, ReactNode][]
                ).map(([q, a]) => (
                  <details key={q} className="group rounded-xl border border-border bg-bg-elevated/50 px-4 py-3 open:bg-bg-elevated">
                    <summary className="cursor-pointer list-none font-medium text-text-primary [&::-webkit-details-marker]:hidden">
                      <span className="mr-2 inline-block text-primary-soft transition-transform group-open:rotate-90" aria-hidden>
                        ›
                      </span>
                      {q}
                    </summary>
                    <p className="mt-2 pl-4">{a}</p>
                  </details>
                ))}
              </div>
            </Section>

            {/* ─────────────── 9. Support ─────────────── */}
            <Section id="support" eyebrow="09" title="Support">
              <List>
                <li>
                  <B>Send feedback</B> — use the feedback button in the app sidebar to send ideas, bugs or complaints. We
                  read every one.
                </li>
                <li>
                  <B>Service status</B> — check <Ext href={STATUS}>status.soveregn.xyz</Ext> if something seems down.
                </li>
                <li>
                  <B>Billing and refunds</B> — see the contact details in the{" "}
                  <Ext href={`${SITE}/refund`}>Refund Policy</Ext>.
                </li>
              </List>
            </Section>
          </div>

          <footer className="mt-20 flex flex-col gap-3 border-t border-border pt-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>SOVEREIGN AI · Your AI. Your Truth. Your Data. Forever.</span>
            <span className="flex flex-wrap gap-4">
              <a href={SITE} className="hover:text-text-primary">soveregn.xyz</a>
              <a href={`${SITE}/privacy`} className="hover:text-text-primary">Privacy</a>
              <a href={`${SITE}/terms`} className="hover:text-text-primary">Terms</a>
              <a href="#top" className="hover:text-text-primary">Back to top ↑</a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
