"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";
import { useT } from "@/store/chat";
import { cn } from "@/lib/utils";

type Os = "powershell" | "cmd" | "mac" | "linux";
const TABS: { id: Os; label: string }[] = [
  { id: "powershell", label: "PowerShell" },
  { id: "cmd", label: "CMD" },
  { id: "mac", label: "macOS" },
  { id: "linux", label: "Linux" },
];

const NPM = "npm install -g @islombekrrr/sov-cli";

/** Foydalanuvchi OS'iga mos tab bilan ochiladi (faqat bosilgandan keyin render bo'ladi). */
function guessOs(): Os {
  if (typeof navigator === "undefined") return "powershell";
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "powershell";
}

function command(os: Os, origin: string): string {
  if (os === "powershell") return `irm ${origin}/install.ps1 | iex`;
  if (os === "cmd") return `powershell -c "irm ${origin}/install.ps1 | iex"`;
  return `curl -fsSL ${origin}/install.sh | sh`;
}

function CopyLine({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex items-center gap-2 rounded-xl border py-2 pl-3.5 pr-1.5"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, #000 35%, transparent)" }}
    >
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]" style={{ color: "var(--t-text)" }}>
        <span aria-hidden style={{ color: "var(--t-text-muted)" }}>$ </span>
        {text}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/10"
        aria-label={copied ? t("copied") : t("copy")}
        title={copied ? t("copied") : t("copy")}
        style={{ color: copied ? "#22C55E" : "var(--t-text-muted)" }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** SOVEREIGN CLI o'rnatish kartasi — Windows (PowerShell / CMD), macOS, Linux. */
export function CliInstall() {
  const t = useT();
  const [os, setOs] = useState<Os>(guessOs);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://sovhq.vercel.app";

  return (
    <div
      className="tt w-full max-w-2xl rounded-[18px] border p-5 text-left"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-text) 3%, transparent)" }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, var(--t-primary) 18%, transparent)", color: "var(--t-primary)" }}>
          <Terminal className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: "var(--t-text)" }}>{t("cliTitle")}</p>
          <p className="text-xs" style={{ color: "var(--t-text-muted)" }}>{t("cliSub")}</p>
        </div>
      </div>

      <div role="tablist" aria-label={t("cliTitle")} className="mt-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={os === tab.id}
            onClick={() => setOs(tab.id)}
            className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", os !== tab.id && "hover:bg-white/5")}
            style={
              os === tab.id
                ? { background: "color-mix(in srgb, var(--t-primary) 20%, transparent)", color: "var(--t-text)" }
                : { color: "var(--t-text-muted)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-3 space-y-3">
        <CopyLine text={command(os, origin)} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <div>
            <p className="mb-1.5 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("cliThenRun")}</p>
            <CopyLine text="sov" />
          </div>
          <div>
            <p className="mb-1.5 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("cliOrNpm")}</p>
            <CopyLine text={NPM} />
          </div>
        </div>
      </div>
    </div>
  );
}
