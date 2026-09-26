"use client";

import { AppWindow, Check, Copy, Download as DownloadIcon, ExternalLink, Info, Laptop, Monitor, Package, SquareTerminal, Terminal } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";
import { fmt, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";
import { DOCS_URL, SITE_HOST } from "./company";
import { SectionHeading } from "./SectionHeading";

const ORIGIN = `https://${SITE_HOST}`;
const RELEASES_URL = "https://github.com/isa704480/Sovereign/releases";
const CMD_PS = `irm ${ORIGIN}/install.ps1 | iex`;
const CMD_SH = `curl -fsSL ${ORIGIN}/install.sh | sh`;
const CMD_NPM = "npm install -g @islombekrrr/sov-cli";

type Tab = "desktop" | "cli";
type Os = "win" | "mac" | "linux";

const dl = (product: Tab, os: Os, arch?: "arm64" | "x64") =>
  `/api/download/${product}?os=${os}${arch ? `&arch=${arch}` : ""}`;

// ---- Tashrif buyuruvchining OS'i (faqat klientda; SSR'da null) ----------
function detectOs(): Os | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  const ua = nav.userAgent;
  if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)) return null;
  const p = (nav.userAgentData?.platform || nav.platform || "").toLowerCase();
  if (p.includes("win") || /Windows/i.test(ua)) return "win";
  if (p.includes("mac") || /Mac OS X|Macintosh/i.test(ua)) {
    // iPadOS o'zini "Macintosh" deb tanishtiradi — sensorli ekran bilan ajratamiz.
    return nav.maxTouchPoints > 1 ? null : "mac";
  }
  if (p.includes("linux") || /Linux|X11|CrOS/i.test(ua)) return "linux";
  return null;
}
const noopSubscribe = () => () => {};
export const useVisitorOs = () => useSyncExternalStore(noopSubscribe, detectOs, () => null);

// ---- Kichik bo'laklar ----------------------------------------------------
function CopyLine({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-[#0a0d24] py-1.5 pl-3.5 pr-1.5">
      {/* Uzun buyruq tor kartada o'raladi (gorizontal skroll yo'q); nusxa har doim aniq matn. */}
      <code className="min-w-0 flex-1 whitespace-pre-wrap py-1 font-mono text-[12.5px] leading-relaxed text-text-primary [overflow-wrap:anywhere]">
        <span aria-hidden="true" className="select-none text-text-muted">
          ${" "}
        </span>
        {text}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => undefined,
          );
        }}
        aria-label={copied ? t("copied") : `${t("dlCopyCmd")}: ${label}`}
        title={copied ? t("copied") : t("copy")}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
      >
        {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}

function OptionCard({
  icon: Icon,
  title,
  meta,
  recommended,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  meta: string;
  recommended: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border p-5 transition-colors duration-300",
        recommended
          ? "border-primary/60 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(91,80,240,0.25),0_12px_40px_-16px_rgba(91,80,240,0.55)]"
          : "border-border bg-white/[0.015] hover:border-white/15",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-bg-elevated shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="size-[18px] text-primary-soft" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs text-text-muted">{meta}</p>
        </div>
      </div>
      {recommended && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-glow">
          {t("dlRecommended")}
        </span>
      )}
      <div className="mt-4 flex min-w-0 flex-1 flex-col gap-2.5">{children}</div>
    </li>
  );
}

function DownloadButton({ href, label, children, primary = true }: { href: string; label: string; children: ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      rel="nofollow"
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
        primary
          ? "bg-text-primary text-bg-base hover:bg-white/85"
          : "border border-border bg-white/[0.03] text-text-primary hover:border-white/25 hover:bg-white/[0.06]",
      )}
    >
      <DownloadIcon className="size-4" aria-hidden="true" />
      {children}
    </a>
  );
}

function SmallLink({ href, label, children }: { href: string; label?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      rel="nofollow"
      className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary-soft underline-offset-4 hover:text-text-primary hover:underline"
    >
      <DownloadIcon className="size-3.5" aria-hidden="true" />
      {children}
    </a>
  );
}

// ---- Panellar ------------------------------------------------------------
/** Cowork desktop: Windows / macOS / Linux — landing va chat bosh ekranida (Welcome) ishlatiladi. */
export function DesktopPanel({ os }: { os: Os | null }) {
  const t = useT();
  const what = "SOVEREIGN Cowork";
  return (
    <>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OptionCard icon={Monitor} title="Windows" meta={t("dlWinMeta")} recommended={os === "win"}>
          <DownloadButton href={dl("desktop", "win")} label={fmt(t("dlDownloadFor"), { what: `${what} (.exe)`, os: "Windows" })} primary={os === null || os === "win"}>
            {fmt(t("dlDownloadExt"), { ext: ".exe" })}
          </DownloadButton>
        </OptionCard>

        <OptionCard icon={Laptop} title="macOS" meta={t("dlMacMeta")} recommended={os === "mac"}>
          <div className="grid grid-cols-2 gap-2">
            <DownloadButton href={dl("desktop", "mac", "arm64")} label={fmt(t("dlDownloadFor"), { what: `${what} (.dmg)`, os: "macOS Apple Silicon" })} primary={os === null || os === "mac"}>
              Apple Silicon
            </DownloadButton>
            <DownloadButton href={dl("desktop", "mac", "x64")} label={fmt(t("dlDownloadFor"), { what: `${what} (.dmg)`, os: "macOS Intel" })} primary={false}>
              Intel
            </DownloadButton>
          </div>
          <p className="text-xs leading-relaxed text-text-muted">{t("dlMacHint")}</p>
        </OptionCard>

        <OptionCard icon={AppWindow} title="Linux" meta={t("dlLinuxMeta")} recommended={os === "linux"}>
          <DownloadButton href={dl("desktop", "linux")} label={fmt(t("dlDownloadFor"), { what: `${what} (.AppImage)`, os: "Linux" })} primary={os === null || os === "linux"}>
            {fmt(t("dlDownloadExt"), { ext: ".AppImage" })}
          </DownloadButton>
        </OptionCard>
      </ul>

      <div className="mt-5 flex gap-3 rounded-2xl border border-border bg-white/[0.015] p-4 text-sm text-text-secondary">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium text-text-primary">{t("dlUnsignedTitle")}</p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed">
            <li>{t("dlUnsignedWin")}</li>
            <li>{t("dlUnsignedMac")}</li>
            <li>{t("dlUnsignedLinux")}</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function CliPanel({ os }: { os: Os | null }) {
  const t = useT();
  return (
    <>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OptionCard icon={Monitor} title="Windows" meta={t("dlCliWinMeta")} recommended={os === "win"}>
          <CopyLine text={CMD_PS} label="PowerShell" />
          <SmallLink href={dl("cli", "win")} label={fmt(t("dlDownloadFor"), { what: "sov.exe", os: "Windows" })}>
            {t("dlOrExe")}
          </SmallLink>
        </OptionCard>

        <OptionCard icon={Terminal} title="macOS / Linux" meta={t("dlCliUnixMeta")} recommended={os === "mac" || os === "linux"}>
          <CopyLine text={CMD_SH} label="macOS / Linux" />
          <div>
            <p className="text-xs text-text-muted">{t("dlOrBinary")}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              <SmallLink href={dl("cli", "mac", "arm64")} label={fmt(t("dlDownloadFor"), { what: "sov", os: "macOS Apple Silicon" })}>
                macOS Apple Silicon
              </SmallLink>
              <SmallLink href={dl("cli", "mac", "x64")} label={fmt(t("dlDownloadFor"), { what: "sov", os: "macOS Intel" })}>
                macOS Intel
              </SmallLink>
              <SmallLink href={dl("cli", "linux")} label={fmt(t("dlDownloadFor"), { what: "sov", os: "Linux x64" })}>
                Linux x64
              </SmallLink>
            </div>
          </div>
        </OptionCard>

        <OptionCard icon={Package} title="npm" meta={t("dlNpmMeta")} recommended={false}>
          <CopyLine text={CMD_NPM} label="npm" />
        </OptionCard>
      </ul>

      <div className="mx-auto mt-5 max-w-md">
        <p className="mb-1.5 text-center text-xs text-text-muted">{t("cliThenRun")}</p>
        <CopyLine text="sov" label="sov" />
      </div>
    </>
  );
}

// ---- Bo'lim --------------------------------------------------------------
// Yonma-yon ikki tanlov: chapda "Cowork" (desktop ilova), o'ngda "CLI".
const TABS: { id: Tab; icon: typeof Monitor; title: TKey; name: TKey; desc: TKey }[] = [
  { id: "desktop", icon: Laptop, title: "p7cDlCoworkTitle", name: "p7cDlCoworkName", desc: "dlDesktopDesc" },
  { id: "cli", icon: SquareTerminal, title: "p7cDlCliTitle", name: "p7cDlCliName", desc: "dlCliDesc" },
];

export function Download() {
  const t = useT();
  const os = useVisitorOs();
  const [tab, setTab] = useState<Tab>("desktop");
  const uid = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ desktop: null, cli: null });
  const tabId = (id: Tab) => `${uid}-tab-${id}`;
  const panelId = (id: Tab) => `${uid}-panel-${id}`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((x) => x.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <section
      id="download"
      aria-labelledby="download-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading id="download-title" eyebrow={t("dlNav")} title={t("dlTitle")} sub={t("p7cDlSub")} />

      <FadeIn inView className="mt-12">
        <div
          role="tablist"
          aria-label={t("dlChoose")}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {TABS.map((x) => {
            const selected = tab === x.id;
            return (
              <button
                key={x.id}
                ref={(el) => {
                  tabRefs.current[x.id] = el;
                }}
                type="button"
                role="tab"
                id={tabId(x.id)}
                aria-selected={selected}
                aria-controls={panelId(x.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(x.id)}
                className={cn(
                  "group flex min-w-0 items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft",
                  selected
                    ? "border-primary/70 bg-primary/[0.09] shadow-[0_0_0_1px_rgba(91,80,240,0.3),0_16px_48px_-20px_rgba(91,80,240,0.7)]"
                    : "border-border bg-white/[0.015] hover:-translate-y-0.5 hover:border-white/20",
                )}
              >
                <span
                  className={cn(
                    "grid size-12 shrink-0 place-items-center rounded-2xl border transition-colors",
                    selected ? "border-primary/50 bg-primary text-white shadow-glow" : "border-white/10 bg-bg-elevated text-primary-soft",
                  )}
                >
                  <x.icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-display block text-lg font-bold text-text-primary">{t(x.title)}</span>
                  <span className="mt-0.5 block font-mono text-xs text-primary-soft">{t(x.name)}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-text-secondary">{t(x.desc)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </FadeIn>

      {TABS.map((x) => (
        <div
          key={x.id}
          role="tabpanel"
          id={panelId(x.id)}
          aria-labelledby={tabId(x.id)}
          hidden={tab !== x.id}
          className="mt-8"
        >
          {x.id === "desktop" ? <DesktopPanel os={os} /> : <CliPanel os={os} />}
        </div>
      ))}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <a
          href={`${DOCS_URL}#${tab}`}
          className="inline-flex items-center gap-1.5 text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          {t("dlDocs")}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          {t("dlAllReleases")}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
