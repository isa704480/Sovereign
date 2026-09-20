"use client";

import { Check, Copy, FileCode2, PanelRightOpen } from "lucide-react";
import { memo, useMemo, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isRenderable, useArtifact } from "./artifact-context";
import { GenerativeUI, parseGenUi } from "./GenerativeUI";

/** Blocks the model uses to draw a component instead of printing JSON. */
const GEN_UI_LANGS = new Set(["sovereign-ui", "sov-ui", "genui"]);

/** Uzun kod chatni bosib ketmasin — bir qatorli fayl kartasi ko'rinadi. */
const FILE_CARD_CHARS = 900;
const FILE_CARD_LINES = 22;

const DEFAULT_NAME: Record<string, string> = {
  html: "index.html",
  css: "styles.css",
  js: "app.js",
  javascript: "app.js",
  ts: "app.ts",
  typescript: "app.ts",
  jsx: "App.jsx",
  tsx: "App.tsx",
  react: "App.jsx",
  python: "main.py",
  py: "main.py",
  json: "data.json",
  sql: "query.sql",
  svg: "image.svg",
  md: "README.md",
  markdown: "README.md",
  bash: "script.sh",
  sh: "script.sh",
};

// Modelning o'zi yozgan fayl nomini oladi: "// index.html", "<!-- a.html -->",
// yoki CSS izohi ichidagi nom. Topilmasa — til bo'yicha standart nom.
function fileNameOf(code: string, lang: string): string {
  const head = code.slice(0, 200);
  const named =
    /(?:^|\n)\s*(?:\/\/|#|<!--|\/\*)\s*([\w.-]+\.[a-z]{2,4})\b/i.exec(head)?.[1] ??
    /(?:^|\n)\s*([\w-]+\.(?:html|css|js|ts|tsx|jsx|py|json|sql|md|sh))\s*(?:-->|\*\/)?\s*(?:\n|$)/i.exec(head)?.[1];
  return named ?? DEFAULT_NAME[lang.toLowerCase()] ?? `kod.${lang.toLowerCase() || "txt"}`;
}

function FileCard({ code, lang }: { code: string; lang: string }) {
  const artifact = useArtifact();
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n").length;
  const name = fileNameOf(code, lang);
  const canPreview = isRenderable(lang);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      className="tt my-3 flex items-center gap-3 rounded-[14px] border p-3 transition-colors hover:bg-white/5"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-text) 3%, transparent)" }}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{ background: "color-mix(in srgb, var(--warning, #F59E0B) 18%, transparent)", color: "var(--warning, #F59E0B)" }}
      >
        <FileCode2 className="size-5" />
      </span>
      <button type="button" onClick={() => artifact.open({ code, lang, title: name })} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium" style={{ color: "var(--t-text)" }}>{name}</span>
        <span className="nums block text-xs" style={{ color: "var(--t-text-muted)" }}>
          {lines} qator · {(code.length / 1024).toFixed(1)} KB
        </span>
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded-lg p-2 transition-colors hover:bg-white/10"
        style={{ color: "var(--t-text-muted)" }}
        title="Nusxa olish"
        aria-label="Nusxa olish"
      >
        {copied ? <Check className="size-4" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => artifact.open({ code, lang, title: name })}
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
        style={{ background: "var(--t-primary)" }}
      >
        {canPreview ? "Ochish" : "Kodni ko'rish"}
      </button>
    </div>
  );
}

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const artifact = useArtifact();
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";
  const canOpen = isRenderable(lang);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      className="tt overflow-hidden rounded-[10px] border"
      style={{ background: "#0A0E1A", borderColor: "var(--t-border)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
        style={{ color: "var(--t-text-muted)", borderBottom: "1px solid var(--t-border)" }}
      >
        <span>{lang}</span>
        <div className="flex items-center gap-1">
          {canOpen && (
            <button
              type="button"
              onClick={() => artifact.open({ code: children, lang })}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case tracking-normal transition-colors hover:bg-white/10"
              style={{ color: "var(--t-accent)" }}
              title="Yonda ochib ko'rish"
            >
              <PanelRightOpen className="size-3.5" />
              Ochish
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case tracking-normal transition-colors hover:bg-white/10"
          >
            {copied ? <Check className="size-3.5" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-3.5" />}
            {copied ? "Nusxalandi" : "Nusxa olish"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function GenUiPlaceholder() {
  return (
    <div
      className="tt my-3 h-24 animate-pulse rounded-2xl border"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-text) 4%, transparent)" }}
      aria-label="Ko'rinish tayyorlanmoqda"
    />
  );
}

function withCitationLinks(content: string, citations?: string[]): string {
  if (!citations?.length) return content;
  // "[1]" → "[1](#cite-1)" so react-markdown turns it into a link we can style.
  return content.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => {
    const i = Number(n);
    return i >= 1 && i <= citations.length ? `[${n}](#cite-${n})` : m;
  });
}

interface MarkdownProps {
  content: string;
  citations?: string[];
}

export const Markdown = memo(function Markdown({ content, citations }: MarkdownProps) {
  const text = useMemo(() => withCitationLinks(content, citations), [content, citations]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children, ...rest }: ComponentProps<"a">) {
        if (href?.startsWith("#cite-") && citations) {
          const n = Number(href.slice(6));
          const url = citations[n - 1];
          return (
            <a href={url} target="_blank" rel="noreferrer" className="cite" title={url}>
              {n}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...rest}>
            {children}
          </a>
        );
      },
      pre({ children }) {
        return <>{children}</>;
      },
      code({ className, children, ...rest }: ComponentProps<"code">) {
        const raw = String(children ?? "").replace(/\n$/, "");
        const isBlock = /language-/.test(className ?? "") || raw.includes("\n");
        const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
        if (lang && GEN_UI_LANGS.has(lang)) {
          const spec = parseGenUi(raw);
          // Still streaming (or invalid) → show a placeholder, never raw JSON.
          if (!spec) return <GenUiPlaceholder />;
          return <GenerativeUI spec={spec} />;
        }
        if (isBlock) {
          // Katta fayl chat oqimini bosib ketmasin: karta ko'rsatamiz, kod yon panelda.
          const long = raw.length > FILE_CARD_CHARS || raw.split("\n").length > FILE_CARD_LINES;
          if (long) return <FileCard code={raw} lang={lang ?? "text"} />;
          return <CodeBlock className={className}>{raw}</CodeBlock>;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      table({ children }) {
        return (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        );
      },
      img({ src, alt }: ComponentProps<"img">) {
        if (typeof src !== "string") return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt ?? ""}
            className="my-3 max-h-[560px] w-auto max-w-full rounded-xl"
            style={{ border: "1px solid var(--t-border)" }}
          />
        );
      },
    }),
    [citations],
  );

  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
