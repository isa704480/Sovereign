"use client";

import { Check, Copy, PanelRightOpen } from "lucide-react";
import { memo, useMemo, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isRenderable, useArtifact } from "./artifact-context";
import { GenerativeUI, parseGenUi } from "./GenerativeUI";

/** Blocks the model uses to draw a component instead of printing JSON. */
const GEN_UI_LANGS = new Set(["sovereign-ui", "sov-ui", "genui"]);

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
        if (isBlock) return <CodeBlock className={className}>{raw}</CodeBlock>;
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
