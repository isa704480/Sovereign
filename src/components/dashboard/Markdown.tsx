"use client";

import { Check, Copy } from "lucide-react";
import { memo, useMemo, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";

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
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case tracking-normal transition-colors hover:bg-white/10"
        >
          {copied ? <Check className="size-3.5" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-3.5" />}
          {copied ? "Nusxalandi" : "Nusxa olish"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className={className}>{children}</code>
      </pre>
    </div>
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
