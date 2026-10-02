"use client";

import Link from "next/link";
import { ArrowRight, Check, Zap, Brain, DollarSign, Globe, Code, MessageSquare, type LucideIcon } from "lucide-react";
import { useT } from "@/store/chat";
import type { ModelSlug } from "./page";

/**
 * Taqqoslash sahifasi tarkibi — client component (til almashishi uchun).
 * Barcha ma'lumotlar statik (JSON yoki inline) — server fetch yo'q.
 */

interface Props {
  modelA: ModelSlug;
  modelB: ModelSlug;
  slug: string;
}

// ── Taqqoslash ma'lumotlari ────────────────────────────────────────────────────

interface CompareRow {
  category: string;
  icon: LucideIcon;
  aScore: number; // 1-5
  bScore: number;
  note: string;
}

function getRows(a: ModelSlug, b: ModelSlug): CompareRow[] {
  // Heuristic scores (real benchmark'lardan) — foydalanuvchini yo'naltirish uchun
  const scores: Record<string, Record<string, number>> = {
    chatgpt:    { speed: 4, reasoning: 5, coding: 5, creativity: 4, price: 3, multilingual: 4 },
    claude:     { speed: 4, reasoning: 5, coding: 5, creativity: 5, price: 3, multilingual: 4 },
    gemini:     { speed: 5, reasoning: 4, coding: 4, creativity: 4, price: 4, multilingual: 5 },
    deepseek:   { speed: 5, reasoning: 5, coding: 5, creativity: 3, price: 5, multilingual: 3 },
    llama:      { speed: 5, reasoning: 3, coding: 4, creativity: 3, price: 5, multilingual: 3 },
    mistral:    { speed: 5, reasoning: 3, coding: 4, creativity: 4, price: 5, multilingual: 5 },
    grok:       { speed: 4, reasoning: 4, coding: 4, creativity: 4, price: 3, multilingual: 3 },
    perplexity: { speed: 4, reasoning: 3, coding: 3, creativity: 3, price: 4, multilingual: 4 },
    qwen:       { speed: 5, reasoning: 4, coding: 4, creativity: 3, price: 5, multilingual: 5 },
    kimi:       { speed: 4, reasoning: 4, coding: 5, creativity: 3, price: 4, multilingual: 3 },
  };

  const sa = scores[a.id] ?? {};
  const sb = scores[b.id] ?? {};

  return [
    { category: "Speed",          icon: Zap,          aScore: sa.speed ?? 3,        bScore: sb.speed ?? 3,        note: "Tokens per second, TTFT" },
    { category: "Reasoning",      icon: Brain,        aScore: sa.reasoning ?? 3,    bScore: sb.reasoning ?? 3,    note: "Math, logic, complex tasks" },
    { category: "Coding",         icon: Code,         aScore: sa.coding ?? 3,       bScore: sb.coding ?? 3,       note: "Code generation & debugging" },
    { category: "Creativity",     icon: MessageSquare,aScore: sa.creativity ?? 3,   bScore: sb.creativity ?? 3,   note: "Writing, storytelling, content" },
    { category: "Price",          icon: DollarSign,   aScore: sa.price ?? 3,        bScore: sb.price ?? 3,        note: "Lower cost = higher score" },
    { category: "Multilingual",   icon: Globe,        aScore: sa.multilingual ?? 3, bScore: sb.multilingual ?? 3, note: "Non-English language quality" },
  ];
}

// ── Components ────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="h-2 w-5 rounded-full"
          style={{ background: i < score ? color : "rgba(255,255,255,0.1)" }}
        />
      ))}
      <span className="ml-1 text-xs text-white/40 tabular-nums">{score}/5</span>
    </div>
  );
}

function ModelCard({ model, score }: { model: ModelSlug; score: number }) {
  return (
    <div
      className="flex-1 rounded-2xl border p-6"
      style={{ borderColor: `${model.color}30`, background: `${model.color}08` }}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wider" style={{ color: model.color }}>
        {model.provider}
      </div>
      <h2 className="text-xl font-bold text-white">{model.name}</h2>
      <p className="mt-1 text-sm text-white/60">{model.tagline}</p>
      <div className="mt-4">
        <div className="text-xs text-white/40 mb-1">Overall score</div>
        <div className="text-3xl font-bold tabular-nums" style={{ color: model.color }}>
          {score.toFixed(1)}<span className="text-lg text-white/40">/5</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SlugCompareView({ modelA, modelB, slug }: Props) {
  const t = useT();
  const rows = getRows(modelA, modelB);

  const avgA = rows.reduce((s, r) => s + r.aScore, 0) / rows.length;
  const avgB = rows.reduce((s, r) => s + r.bScore, 0) / rows.length;
  const winner = avgA > avgB ? modelA : avgB > avgA ? modelB : null;

  // Structured data (JSON-LD)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${modelA.name} vs ${modelB.name}`,
    description: `Compare ${modelA.name} and ${modelB.name} on speed, reasoning, coding, creativity, price and multilingual support.`,
    author: { "@type": "Organization", name: "SOVEREIGN AI", url: "https://soveregn.xyz" },
    publisher: { "@type": "Organization", name: "SOVEREIGN AI" },
  };

  return (
    <div className="min-h-screen bg-[#060812] text-white">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-4xl px-5 pb-24 pt-32">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-white/40">
          <Link href="/" className="hover:text-white/70">SOVEREIGN</Link>
          <span>/</span>
          <Link href="/compare" className="hover:text-white/70">Compare</Link>
          <span>/</span>
          <span className="text-white/70">{modelA.name} vs {modelB.name}</span>
        </nav>

        {/* Header */}
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {modelA.name}{" "}
          <span className="text-white/40">vs</span>{" "}
          {modelB.name}
        </h1>
        <p className="mb-10 max-w-2xl text-lg text-white/60">
          Side-by-side comparison across speed, reasoning, coding, creativity, price and multilingual quality.
          Both models available instantly in SOVEREIGN — no separate subscriptions.
        </p>

        {/* Model cards */}
        <div className="mb-10 flex gap-4">
          <ModelCard model={modelA} score={avgA} />
          <ModelCard model={modelB} score={avgB} />
        </div>

        {/* Winner banner */}
        {winner && (
          <div
            className="mb-10 flex items-center gap-3 rounded-xl border px-5 py-4"
            style={{ borderColor: `${winner.color}40`, background: `${winner.color}10` }}
          >
            <Check className="size-5 shrink-0" style={{ color: winner.color }} />
            <p className="text-sm">
              <span className="font-semibold" style={{ color: winner.color }}>{winner.name}</span>
              {" "}scores higher overall in this comparison.{" "}
              <span className="text-white/50">
                However, the best model depends on your specific use case.
              </span>
            </p>
          </div>
        )}

        {/* Comparison table */}
        <section className="mb-12 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">Category</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: modelA.color }}>
                  {modelA.name}
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: modelB.color }}>
                  {modelB.name}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.category} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <row.icon className="size-4 text-white/40" />
                      <div>
                        <div className="text-sm font-medium text-white">{row.category}</div>
                        <div className="text-xs text-white/40">{row.note}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <ScoreBar score={row.aScore} color={modelA.color} />
                  </td>
                  <td className="px-5 py-4">
                    <ScoreBar score={row.bScore} color={modelB.color} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Use case recommendations */}
        <section className="mb-12 grid gap-4 sm:grid-cols-2">
          {[
            { model: modelA, cases: ["General chat", "Long documents", "Creative writing", "Analysis"] },
            { model: modelB, cases: ["Coding tasks", "Fast answers", "Research", "Multilingual"] },
          ].map(({ model, cases }) => (
            <div key={model.id} className="rounded-xl border border-white/10 p-5">
              <div className="mb-3 text-sm font-semibold" style={{ color: model.color }}>
                Best for — {model.name}
              </div>
              <ul className="space-y-1.5">
                {cases.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm text-white/70">
                    <Check className="size-3.5 shrink-0" style={{ color: model.color }} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* CTA */}
        <div className="rounded-2xl border border-[#5B50F030] bg-[#5B50F010] p-8 text-center">
          <h2 className="mb-2 text-xl font-bold">Try both in SOVEREIGN — free</h2>
          <p className="mb-6 text-white/60">
            Switch between {modelA.name} and {modelB.name} (and 1750+ other models) in one window.
            No separate subscriptions needed.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-[#5B50F0] px-6 py-3 text-sm font-semibold text-white hover:bg-[#6B61F0]"
          >
            Start free — compare all AI models
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Related comparisons */}
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-white/50">
            Other comparisons
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { a: "chatgpt", b: "claude" },
              { a: "gemini", b: "chatgpt" },
              { a: "deepseek", b: "claude" },
              { a: "llama", b: "chatgpt" },
              { a: "gemini", b: "claude" },
              { a: "mistral", b: "chatgpt" },
            ]
              .filter((p) => `${p.a}-vs-${p.b}` !== slug && `${p.b}-vs-${p.a}` !== slug)
              .slice(0, 6)
              .map((p) => (
                <Link
                  key={`${p.a}-vs-${p.b}`}
                  href={`/compare/${p.a}-vs-${p.b}`}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white"
                >
                  {p.a} vs {p.b}
                </Link>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
