"use client";

import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { CopyCode } from "@/components/docs/CopyCode";
import { DocsMobileNav, DocsSidebar, type DocsNavItem } from "@/components/docs/DocsNav";
import { LangSwitcher } from "@/components/LangSwitcher";
import { rich } from "@/components/docs/rich";
import { fmt, type TKey } from "@/lib/i18n";
import { useT } from "@/store/chat";

/*
 * docs.soveregn.xyz matni — client komponent, til store'dan (useT) olinadi, shuning
 * uchun /docs statik (○) bo'lib qoladi: serverda cookie/header o'qilmaydi.
 * Narx, limit va modellar src/config'dan build paytida hisoblanib, props sifatida keladi.
 */

export interface DocsPlan {
  id: string;
  name: string;
  color: string;
  paid: boolean;
  monthly: string;
  yearly: string;
  sbpMonthly: string;
  allowance: string;
  messagesPerDay: string;
  maxTokensK: number;
  imagesPerDay: number;
  fullCode: boolean;
  research: boolean;
  deepResearch: boolean;
  priority: boolean;
}

export interface DocsData {
  /** Ko'rinadigan modellar soni, o'nlikka yaxlitlangan ("{n}+"). */
  modelCountRounded: number;
  plans: DocsPlan[];
  tiers: { tier: string; name: string; models: string[] }[];
  freeModelCount: number;
}

const SITE = "https://soveregn.xyz";
const APP = "https://app.soveregn.xyz/app";
const STATUS = "https://status.soveregn.xyz";
/** Tarjimalardagi havola o'rinbosarlari (langarlar ham — matnda lotin slug bo'lmasin). */
const LINK_VARS = {
  site: SITE,
  app: APP,
  status: STATUS,
  aPrivacy: "#privacy",
  aDesktop: "#desktop",
  aCli: "#cli",
  aBlind: "#blind-prompting",
  aPlanChanges: "#plan-changes",
};

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

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-text-muted">{children}</ul>;
}

/* ─────────────────────────── static structure ─────────────────────────── */

type PlanCell = (p: DocsPlan) => ReactNode;

const CLI_COMMANDS: readonly [string, TKey][] = [
  ["/model, /models", "p7bDCmdModel"],
  ["/attach <path>, /detach", "p7bDCmdAttach"],
  ["/cwd <path>", "p7bDCmdCwd"],
  ["/vibe", "p7bDCmdVibe"],
  ["/auto", "p7bDCmdAuto"],
  ["/swarm <n> <task>", "p7bDCmdSwarm"],
  ["/audit", "p7bDCmdAudit"],
  ["/sessions, /resume <id>", "p7bDCmdSessions"],
  ["/rewind [n], /fork", "p7bDCmdRewind"],
  ["/memory, /remember, /forget", "p7bDCmdMemory"],
  ["/project, /project-remember <fact>", "p7bDCmdProject"],
  ["/skills, /skill <id>", "p7bDCmdSkills"],
  ["/login, /logout, /whoami", "p7bDCmdLogin"],
  ["/register, /upgrade", "p7bDCmdRegister"],
  ["/clear, /help, /exit", "p7bDCmdClear"],
];

/** Kod bloklari tarjima qilinmaydi. */
const CLI_USAGE = [
  "sov                               # interactive mode (chat + agent)",
  'sov "build a React todo app"      # one task, then exit',
  'sov "..." -f diagram.png -f a.pdf # attach files (--file)',
  'sov --yes "..."                   # auto-confirm safe actions (-y)',
  'sov --full-auto "..."             # Full auto: nothing asked (push/deploy refused)',
  "sov login                         # connect your account in the browser",
  "sov logout                        # sign out",
  "sov whoami                        # connection status",
  "sov key sk-or-v1-...              # use your own OpenRouter key",
  "sov init --ai                     # SOVEREIGN.md: shared project memory for the team",
  "sov audit [--json]                # pre-deploy security audit (offline)",
  "sov models                        # list models",
  "sov help                          # help",
].join("\n");

const FAQ: readonly { id: string; q: TKey; a: TKey }[] = [
  { id: "free", q: "p7bDFaqQ1", a: "p7bDFaqA1" },
  { id: "model", q: "p7bDFaqQ2", a: "p7bDFaqA2" },
  { id: "limit", q: "p7bDFaqQ3", a: "p7bDFaqA3" },
  { id: "pii", q: "p7bDFaqQ4", a: "p7bDFaqA4" },
  { id: "cli", q: "p7bDFaqQ5", a: "p7bDFaqA5" },
  { id: "switch", q: "p7bDFaqQ6", a: "p7bDFaqA6" },
];

/* ─────────────────────────── page ─────────────────────────── */

export function DocsContent({ data }: { data: DocsData }) {
  const t = useT();
  /** Tarjima + {o'zgaruvchi} + belgilash → React tugunlari. */
  const r = (key: TKey, vars: Record<string, string | number> = {}) => rich(fmt(t(key), { ...LINK_VARS, ...vars }), key);

  const { plans, tiers } = data;
  const paid = plans.filter((p) => p.paid);
  const free = plans.find((p) => p.id === "free");

  const nav: DocsNavItem[] = [
    {
      id: "getting-started",
      label: t("p7bDGsTitle"),
      children: [
        { id: "sign-up", label: t("p7bDSignUpTitle") },
        { id: "first-chat", label: t("p7bDFirstChatTitle") },
        { id: "auto-routing", label: t("p7bDAutoTitle") },
      ],
    },
    { id: "models-plans", label: t("p7bDPlansTitle") },
    {
      id: "features",
      label: t("p7bDFeaturesTitle"),
      children: [
        { id: "image-generation", label: t("p7bDImgTitle") },
        { id: "research", label: t("p7bDResearchTitle") },
        { id: "memory", label: t("p7bDMemoryTitle") },
        { id: "knowledge-base", label: t("p7bDKbNav") },
        { id: "connectors", label: t("p7bDConnTitle") },
        { id: "skills", label: t("p7bDSkillsTitle") },
        { id: "cowork", label: "Cowork" },
        { id: "blind-prompting", label: "Blind Prompting" },
        { id: "voice", label: t("p7bDVoiceTitle") },
      ],
    },
    {
      id: "cli",
      label: "CLI",
      children: [
        { id: "cli-install", label: t("p7bDInstallTitle") },
        { id: "cli-usage", label: t("p7bDUsageTitle") },
        { id: "cli-commands", label: t("p7bDCmdsTitle") },
        { id: "cli-project", label: t("p7bDProjectTitle") },
        { id: "cli-audit", label: t("p7bDAuditTitle") },
        { id: "cli-safety", label: t("p7bDSafetyTitle") },
      ],
    },
    { id: "desktop", label: t("p7bDDesktopNav") },
    { id: "billing", label: t("p7bDBillingTitle") },
    { id: "privacy", label: t("p7bDPrivacyTitle") },
    { id: "faq", label: t("p7bDFaqTitle") },
    { id: "support", label: t("p7bDSupportTitle") },
  ];

  const yes = <span className="text-success">{t("p7bDYes")}</span>;
  const no = (
    <span className="text-text-muted" title={t("p7bDNotIncluded")}>
      —<span className="sr-only">{t("p7bDNotIncluded")}</span>
    </span>
  );
  const rows: [TKey, PlanCell][] = [
    ["p7bDRowMonthly", (p) => p.monthly],
    ["p7bDRowYearly", (p) => p.yearly],
    ["p7bDRowSbp", (p) => p.sbpMonthly],
    ["p7bDRowAllowance", (p) => p.allowance],
    ["p7bDRowMsgs", (p) => p.messagesPerDay],
    ["p7bDRowMaxLen", (p) => fmt(t("p7bDTokensK"), { n: p.maxTokensK })],
    ["p7bDRowImages", (p) => String(p.imagesPerDay)],
    ["p7bDRowFullCode", (p) => (p.fullCode ? yes : no)],
    ["p7bDRowResearch", (p) => (p.research ? yes : no)],
    ["p7bDRowDeep", (p) => (p.deepResearch ? yes : no)],
    ["p7bDRowPriority", (p) => (p.priority ? yes : no)],
  ];

  const imageLimits = plans.map((p) => `${p.name} ${p.imagesPerDay}`).join(", ");
  const sbpPrices = paid.map((p) => `${p.name} ${p.sbpMonthly}`).join(", ");
  const titleParts = t("p7bDTitle").split("{accent}");

  return (
    <div id="top" className="flex min-h-full flex-1 flex-col bg-bg-base text-text-primary">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {t("p7bDSkip")}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg-base/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <a href={SITE} className="flex min-w-0 items-center gap-2 rounded-lg sm:gap-2.5">
            <LogoMark size={26} />
            <span className="font-display truncate text-sm sm:text-[15px] font-extrabold tracking-tight text-text-primary">SOVEREIGN</span>
            <span className="rounded-md border border-border shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:text-[11px] text-text-secondary">
              {t("p4dNavDocs")}
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <a
              href={SITE}
              className="hidden rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary md:inline-flex"
            >
              soveregn.xyz
            </a>
            <LangSwitcher className="h-8 shrink-0 cursor-pointer px-1.5" />
            <a
              href={APP}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 sm:px-3 text-sm font-medium text-white shadow-glow transition-colors hover:bg-primary-dark"
            >
              {t("p7bDOpenApp")} <ArrowUpRight className="hidden size-3.5 sm:inline" aria-hidden />
            </a>
          </div>
        </div>
        <div className="border-t border-border lg:hidden">
          <div className="mx-auto max-w-6xl">
            <DocsMobileNav items={nav} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 pt-10 md:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:pt-12">
        <aside className="hidden lg:block">
          <DocsSidebar items={nav} />
        </aside>

        <main id="content" tabIndex={-1} className="min-w-0 max-w-[760px] pb-24 text-[15px] leading-relaxed text-text-secondary outline-none">
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("p7bDEyebrow")}</p>
            <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">
              {titleParts[0]}
              <span className="text-gradient-brand">{t("p7bDTitleAccent")}</span>
              {titleParts[1] ?? ""}
            </h1>
            <p className="mt-4 text-base text-text-secondary">{r("p7bDLead")}</p>
          </div>

          <div className="space-y-14">
            {/* ─────────────── 1. Getting started ─────────────── */}
            <Section id="getting-started" eyebrow="01" title={t("p7bDGsTitle")}>
              <p>{r("p7bDGsIntro", { n: data.modelCountRounded })}</p>

              <Sub id="sign-up" title={t("p7bDSignUpTitle")}>
                <p>{r("p7bDSignUpBody")}</p>
              </Sub>

              <Sub id="first-chat" title={t("p7bDFirstChatTitle")}>
                <List>
                  <li>{r("p7bDFirstChat1")}</li>
                  <li>{r("p7bDFirstChat2")}</li>
                  <li>{r("p7bDFirstChat3")}</li>
                  <li>{r("p7bDFirstChat4")}</li>
                </List>
              </Sub>

              <Sub id="auto-routing" title={t("p7bDAutoTitle")}>
                <p>{r("p7bDAutoBody")}</p>
              </Sub>
            </Section>

            {/* ─────────────── 2. Models & plans ─────────────── */}
            <Section id="models-plans" eyebrow="02" title={t("p7bDPlansTitle")}>
              <p>{r("p7bDPlansIntro")}</p>

              <div
                role="region"
                aria-label={t("p7bDPlansTableAria")}
                tabIndex={0}
                className="overflow-x-auto rounded-xl border border-border"
              >
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <caption className="sr-only">{t("p7bDPlansCaption")}</caption>
                  <thead className="bg-bg-elevated text-xs uppercase tracking-wider text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        &nbsp;
                      </th>
                      {plans.map((p) => (
                        <th key={p.id} scope="col" className="px-3 py-2.5 font-semibold" style={{ color: p.color }}>
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="nums divide-y divide-border">
                    {rows.map(([label, cell]) => (
                      <tr key={label}>
                        <th scope="row" className="px-3 py-2.5 font-normal text-text-secondary">
                          {t(label)}
                        </th>
                        {plans.map((p) => (
                          <td key={p.id} className="px-3 py-2.5 text-text-primary">
                            {cell(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-text-muted">{r("p7bDPlansNote")}</p>

              <h3 className="font-display pt-2 text-lg font-bold text-text-primary">{t("p7bDTierHeading")}</h3>
              <div className="space-y-3">
                {tiers.map(({ tier, name, models }) => (
                  <div key={tier} className="rounded-xl border border-border bg-bg-elevated/60 px-4 py-3">
                    <p className="text-sm font-semibold text-text-primary">
                      {fmt(t("p7bDTierModels"), { plan: name })}{" "}
                      <span className="font-normal text-text-muted">· {models.length}</span>
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{models.join(", ")}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─────────────── 3. Features ─────────────── */}
            <Section id="features" eyebrow="03" title={t("p7bDFeaturesTitle")}>
              <Sub id="image-generation" title={t("p7bDImgTitle")}>
                <p>{r("p7bDImgBody", { limits: imageLimits })}</p>
              </Sub>

              <Sub id="research" title={t("p7bDResearchTitle")}>
                <p>{r("p7bDResearchBody")}</p>
              </Sub>

              <Sub id="memory" title={t("p7bDMemoryTitle")}>
                <p>{r("p7bDMemoryBody")}</p>
              </Sub>

              <Sub id="knowledge-base" title={t("p7bDKbTitle")}>
                <p>{r("p7bDKbBody")}</p>
              </Sub>

              <Sub id="connectors" title={t("p7bDConnTitle")}>
                <p>{r("p7bDConnIntro")}</p>
                <List>
                  <li>{r("p7bDConnGoogle")}</li>
                  <li>{r("p7bDConnDesign")}</li>
                  <li>{r("p7bDConnBuiltin")}</li>
                </List>
                <p>{r("p7bDConnToggle")}</p>
              </Sub>

              <Sub id="skills" title={t("p7bDSkillsTitle")}>
                <p>{r("p7bDSkillsBody1")}</p>
                <p>{r("p7bDSkillsBody2")}</p>
              </Sub>

              <Sub id="cowork" title="Cowork">
                <p>{r("p7bDCoworkBody")}</p>
              </Sub>

              <Sub id="blind-prompting" title={t("p7bDBlindTitle")}>
                <p>{r("p7bDBlindBody")}</p>
                <List>
                  <li>{r("p7bDBlind1")}</li>
                  <li>{r("p7bDBlind2")}</li>
                  <li>{r("p7bDBlind3")}</li>
                  <li>{r("p7bDBlind4")}</li>
                </List>
                <p className="text-sm text-text-muted">{r("p7bDBlindNote")}</p>
              </Sub>

              <Sub id="voice" title={t("p7bDVoiceTitle")}>
                <p>{r("p7bDVoiceBody")}</p>
              </Sub>
            </Section>

            {/* ─────────────── 4. CLI ─────────────── */}
            <Section id="cli" eyebrow="04" title="CLI — sov">
              <p>{r("p7bDCliIntro")}</p>

              <Sub id="cli-install" title={t("p7bDInstallTitle")}>
                <p>{r("p7bDInstallReq")}</p>
                <CopyCode label="Windows — PowerShell" code="irm https://soveregn.xyz/install.ps1 | iex" prompt />
                <CopyCode label="Windows — CMD" code={'powershell -c "irm https://soveregn.xyz/install.ps1 | iex"'} prompt />
                <CopyCode label="macOS / Linux" code="curl -fsSL https://soveregn.xyz/install.sh | sh" prompt />
                <CopyCode label={t("p7bDOrNpm")} code="npm install -g @islombekrrr/sov-cli" prompt />
                <p>{r("p7bDThenStart")}</p>
                <CopyCode label={t("p7bDRun")} code="sov" prompt />
                <p className="text-sm text-text-muted">{r("p7bDInstallNote")}</p>
              </Sub>

              <Sub id="cli-usage" title={t("p7bDUsageTitle")}>
                <p>{r("p7bDUsage1")}</p>
                <CopyCode label={t("p7bDCommands")} code={CLI_USAGE} />
                <p>{r("p7bDUsage2")}</p>
                <p>{r("p7bDUsage3")}</p>
              </Sub>

              <Sub id="cli-commands" title={t("p7bDCmdsTitle")}>
                <p>{r("p7bDCmdsIntro")}</p>
                <div role="region" aria-label={t("p7bDCmdsAria")} tabIndex={0} className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <caption className="sr-only">{t("p7bDCmdsCaption")}</caption>
                    <thead className="bg-bg-elevated text-xs uppercase tracking-wider text-text-secondary">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t("p7bDCmdCol")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t("p7bDCmdWhat")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {CLI_COMMANDS.map(([cmd, desc]) => (
                        <tr key={cmd}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-text-primary">{cmd}</td>
                          <td className="px-3 py-2">{fmt(t(desc), { ex: "/model <id>, /model auto" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>

              <Sub id="cli-project" title={t("p7bDProjectTitle")}>
                <p>{r("p7bDProject1")}</p>
                <CopyCode label={t("p7bDCommands")} code={"sov init          # SOVEREIGN.md template\nsov init --ai     # let the agent fill it in\ngit add SOVEREIGN.md && git commit -m \"Project memory\""} />
                <p>{r("p7bDProject2")}</p>
                <p>{r("p7bDProject3")}</p>
                <Note>{r("p7bDProject4")}</Note>
              </Sub>

              <Sub id="cli-audit" title={t("p7bDAuditTitle")}>
                <p>{r("p7bDAuditIntro")}</p>
                <CopyCode label={t("p7bDRun")} code="sov audit" prompt />
                <CopyCode label="CI / JSON" code="sov audit --json > audit.json" prompt />
                <p>{r("p7bDAuditChecks")}</p>
                <Note>{r("p7bDAuditFix")}</Note>
              </Sub>

              <Sub id="cli-safety" title={t("p7bDSafetyTitle")}>
                <List>
                  <li>{r("p7bDSafety1")}</li>
                  <li>{r("p7bDSafety2")}</li>
                  <li>{r("p7bDSafety3")}</li>
                  <li>{r("p7bDSafetyAuto")}</li>
                </List>
                <Note>{r("p7bDSafetyNote")}</Note>
              </Sub>
            </Section>

            {/* ─────────────── 5. Desktop ─────────────── */}
            <Section id="desktop" eyebrow="05" title={t("p7bDDesktopTitle")}>
              <p>{r("p7bDDesktopIntro")}</p>
              <List>
                <li>{r("p7bDDesktop1")}</li>
                <li>{r("p7bDDesktop2")}</li>
                <li>{r("p7bDDesktop3")}</li>
                <li>{r("p7bDDesktop4")}</li>
              </List>
            </Section>

            {/* ─────────────── 6. Billing ─────────────── */}
            <Section id="billing" eyebrow="06" title={t("p7bDBillingTitle")}>
              <p>{r("p7bDBillingIntro")}</p>
              <List>
                <li>{r("p7bDBillCard")}</li>
                <li>{r("p7bDBillCrypto")}</li>
                <li>{r("p7bDBillSbp", { prices: sbpPrices })}</li>
              </List>

              <Sub id="promo-codes" title={t("p7bDPromoTitle")}>
                <p>{r("p7bDPromoBody")}</p>
              </Sub>

              <Sub id="plan-changes" title={t("p7bDChangesTitle")}>
                <p>{r("p7bDChangesIntro")}</p>
                <List>
                  <li>{r("p7bDChanges1")}</li>
                  <li>{r("p7bDChanges2")}</li>
                  <li>{r("p7bDChanges3")}</li>
                </List>
              </Sub>

              <Sub id="refunds" title={t("p7bDRefundsTitle")}>
                <List>
                  <li>{r("p7bDRefunds1")}</li>
                  <li>{r("p7bDRefunds2")}</li>
                  <li>{r("p7bDRefunds3")}</li>
                  <li>{r("p7bDRefunds4")}</li>
                  <li>{r("p7bDRefunds5")}</li>
                </List>
                <p>{r("p7bDRefundsFull")}</p>
              </Sub>
            </Section>

            {/* ─────────────── 7. Privacy ─────────────── */}
            <Section id="privacy" eyebrow="07" title={t("p7bDPrivacyTitle")}>
              <List>
                <li>{r("p7bDPriv1")}</li>
                <li>{r("p7bDPriv2")}</li>
                <li>{r("p7bDPriv3")}</li>
                <li>{r("p7bDPriv4")}</li>
                <li>{r("p7bDPriv5")}</li>
              </List>
              <p>{r("p7bDPrivFull")}</p>
            </Section>

            {/* ─────────────── 8. FAQ ─────────────── */}
            <Section id="faq" eyebrow="08" title={t("p7bDFaqTitle")}>
              <div className="space-y-2">
                {FAQ.map(({ id, q, a }) => (
                  <details key={id} className="group rounded-xl border border-border bg-bg-elevated/50 px-4 py-3 open:bg-bg-elevated">
                    <summary className="cursor-pointer list-none font-medium text-text-primary [&::-webkit-details-marker]:hidden">
                      <span className="mr-2 inline-block text-primary-soft transition-transform group-open:rotate-90" aria-hidden>
                        ›
                      </span>
                      {t(q)}
                    </summary>
                    <p className="mt-2 pl-4">
                      {r(a, { models: data.freeModelCount, images: free?.imagesPerDay ?? 0 })}
                    </p>
                  </details>
                ))}
              </div>
            </Section>

            {/* ─────────────── 9. Support ─────────────── */}
            <Section id="support" eyebrow="09" title={t("p7bDSupportTitle")}>
              <List>
                <li>{r("p7bDSupport1")}</li>
                <li>{r("p7bDSupport2")}</li>
                <li>{r("p7bDSupport3")}</li>
              </List>
            </Section>
          </div>

          <footer className="mt-20 flex flex-col gap-3 border-t border-border pt-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>SOVEREIGN AI · Your AI. Your Truth. Your Data. Forever.</span>
            <span className="flex flex-wrap gap-4">
              <a href={SITE} className="hover:text-text-primary">soveregn.xyz</a>
              <a href={`${SITE}/privacy`} className="hover:text-text-primary">{t("navPrivacy")}</a>
              <a href={`${SITE}/terms`} className="hover:text-text-primary">{t("ldTerms")}</a>
              <a href="#top" className="hover:text-text-primary">{t("p7bDBackTop")}</a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
