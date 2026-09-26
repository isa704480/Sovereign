"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyCodeProps {
  /** Text copied to the clipboard (and shown). */
  code: string;
  /** Short caption above the block, e.g. "PowerShell". */
  label?: string;
  /** Show a "$" prompt before single-line shell commands. */
  prompt?: boolean;
}

/** Docs code block with a copy-to-clipboard button. */
export function CopyCode({ code, label, prompt = false }: CopyCodeProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done, () => undefined);
    }
  }

  return (
    <figure className="my-3 min-w-0">
      {label && <figcaption className="mb-1.5 text-xs font-medium text-text-secondary">{label}</figcaption>}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-[#0a0d24] py-2 pl-4 pr-1.5">
        <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] leading-relaxed text-text-primary">
          <code>
            {prompt && (
              <span aria-hidden className="select-none text-text-muted">
                ${" "}
              </span>
            )}
            {code}
          </code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : label ? `Copy ${label} command` : "Copy to clipboard"}
          title={copied ? "Copied" : "Copy"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied to clipboard" : ""}
        </span>
      </div>
    </figure>
  );
}
