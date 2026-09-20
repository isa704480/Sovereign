"use client";

import { Check, Code2, Copy, Download, Eye, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Markdown } from "./Markdown";
import { isRenderable, type ArtifactPayload } from "./artifact-context";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ArtifactPanelProps {
  artifact: ArtifactPayload;
  onClose: () => void;
}

// Live edit lets the user tweak the artifact and re-render immediately.
const HTML_TABS = ["preview", "code"] as const;

function toHtmlDoc(code: string, lang: string): string {
  const l = lang.toLowerCase();
  const isFullDoc = /<!doctype html|<html[\s>]/i.test(code);
  if (l === "svg") {
    return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style>${code}`;
  }
  if (l === "jsx" || l === "tsx" || l === "react") {
    // JSX/TSX runs inside a sandboxed iframe with React, Babel and Tailwind
    // preloaded. The user's code either exports (default) or defines a
    // component named App / Component.
    // Case-insensitive </script> escape — LLM `</SCRIPT>` yozsa ham break bo'lmasin.
    const escaped = code.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#1d1d1f}#root{min-height:100vh}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="typescript,react">
try {
${escaped}
  const target = (typeof App !== "undefined" && App) || (typeof Component !== "undefined" && Component) || (typeof Page !== "undefined" && Page);
  if (!target) throw new Error("Komponent topilmadi (App yoki Component nomi bilan e'lon qiling)");
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(React.createElement(target));
} catch (e) {
  document.body.innerHTML = "<pre style='color:#b00020;padding:16px;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace'>" + String(e.message || e) + "</pre>";
}
</script>
</body>
</html>`;
  }
  if (isFullDoc) return code;
  // Wrap an HTML fragment in a minimal, readable document.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px;color:#1d1d1f;background:#fff}</style></head><body>${code}</body></html>`;
}

function extOf(lang: string): string {
  const map: Record<string, string> = {
    html: "html",
    svg: "svg",
    markdown: "md",
    md: "md",
    xml: "xml",
    css: "css",
    js: "js",
    javascript: "js",
    ts: "ts",
    typescript: "ts",
    jsx: "jsx",
    tsx: "tsx",
    python: "py",
    py: "py",
    json: "json",
    sql: "sql",
    bash: "sh",
    sh: "sh",
  };
  return map[lang.toLowerCase()] ?? "txt";
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const { lang, title } = artifact;
  const l = lang.toLowerCase();
  const isMarkdown = l === "markdown" || l === "md";
  // CSS/JS/Python kabi tillarni jonli ko_rsatib bo_lmaydi - faqat kod ko_rinadi.
  const canPreview = !isMarkdown && isRenderable(lang);
  // Panel is keyed by content in the parent, so state resets on a new artifact.
  const [code, setCode] = useState(artifact.code);
  const [tab, setTab] = useState<(typeof HTML_TABS)[number]>(isRenderable(lang) ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const srcDoc = useMemo(() => (isMarkdown ? "" : toHtmlDoc(code, lang)), [code, lang, isMarkdown]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function download() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (title?.replace(/\s+/g, "-").toLowerCase() || "artifact") + "." + extOf(lang);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <motion.aside
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      // Kichik ekranda to'liq ekran qatlami, kattasida yon panel — aks holda
      // "Ochish" bosilganda hech narsa ko'rinmay qolardi.
      className="tt fixed inset-0 z-50 flex w-full flex-col border-l lg:relative lg:z-auto lg:w-[46%] lg:max-w-[720px] lg:shrink-0"
      style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--t-border)" }}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md" style={{ background: "color-mix(in srgb, var(--t-primary) 18%, transparent)", color: "var(--t-primary)" }}>
            {isMarkdown ? "📄" : l === "svg" ? "✦" : "◎"}
          </span>
          <span className="truncate text-sm font-medium" style={{ color: "var(--t-text)" }}>
            {title || (isMarkdown ? "Hujjat" : l === "svg" ? "SVG rasm" : "Sayt")}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {canPreview && (
            <div className="mr-1 flex rounded-lg p-0.5" style={{ background: "color-mix(in srgb, var(--t-text) 8%, transparent)" }}>
              {HTML_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors")}
                  style={{
                    background: tab === t ? "var(--t-surface)" : "transparent",
                    color: tab === t ? "var(--t-text)" : "var(--t-text-muted)",
                    boxShadow: tab === t ? "0 1px 2px rgba(0,0,0,0.2)" : undefined,
                  }}
                >
                  {t === "preview" ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
                  {t === "preview" ? "Ko'rinish" : "Tahrir"}
                </button>
              ))}
            </div>
          )}
          {canPreview && tab === "preview" && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="rounded-lg p-1.5 hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Yangilash">
              <RefreshCw className="size-4" />
            </button>
          )}
          <button type="button" onClick={copy} className="rounded-lg p-1.5 hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Nusxa olish">
            {copied ? <Check className="size-4" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-4" />}
          </button>
          <button type="button" onClick={download} className="rounded-lg p-1.5 hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Yuklab olish">
            <Download className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} aria-label="Yopish">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {isMarkdown ? (
          <div className="h-full overflow-y-auto px-6 py-6">
            <Markdown content={code} />
          </div>
        ) : canPreview && tab === "preview" ? (
          <iframe
            key={reloadKey}
            title="Artifact preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full flex-col">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none"
              style={{ color: "var(--t-text)" }}
            />
            <div
              className="flex items-center justify-between border-t px-3 py-1.5 text-[11px]"
              style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
            >
              <span>Tahrir qilinganda Ko&apos;rinish o&apos;z-o&apos;zidan yangilanadi</span>
              <span>{code.length} belgi</span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
