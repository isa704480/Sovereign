import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MODEL_BY_ID } from "@/config/models";
import { MODEL_THEMES, themeVars } from "@/config/model-themes";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerLang } from "@/lib/i18n-server";
import { translate, type TKey } from "@/lib/i18n";
import { convTitle, localeOf } from "@/lib/locales/chat-data";
import { SharedMessages } from "./SharedMessages";

interface SharedRow {
  id: string;
  title: string;
  model_id: string | null;
  messages: { role: "user" | "assistant"; content: string; modelId?: string | null; createdAt: string }[];
  created_at: string;
  views: number;
}

async function load(id: string): Promise<SharedRow | null> {
  if (!/^[A-Za-z0-9]{16}$/.test(id) || !isSupabaseConfigured()) return null;
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("shared_conversations")
    .select("id, title, model_id, messages, created_at, views")
    .eq("id", id)
    .maybeSingle();
  if (data) void supabase.rpc("shared_conversation_view", { p_id: id });
  return (data as SharedRow | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await load(id);
  const lang = await getServerLang();
  const t = (k: TKey) => translate(lang, k);
  return {
    title: row ? `${convTitle(row.title, t)} · SOVEREIGN` : `${t("chShareNotFound")} · SOVEREIGN`,
    description: row ? t("chShareDesc") : undefined,
    robots: { index: false },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await load(id);
  if (!row) notFound();
  const lang = await getServerLang();
  const t = (k: TKey) => translate(lang, k);

  const model = row.model_id ? MODEL_BY_ID[row.model_id] : undefined;
  const date = new Date(row.created_at).toLocaleDateString(localeOf(lang), { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="theme-root min-h-svh" style={{ ...themeVars(MODEL_THEMES.sovereign), background: "#060812", color: "#F0F2FF" }}>
      <header className="sticky top-0 z-10 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(6,8,18,0.85)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold tracking-[0.12em]">⬡ SOVEREIGN</Link>
          <Link
            href="/register"
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
            style={{ background: "#5B50F0" }}
          >
            {t("chShareTry")}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <h1 className="t-display text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{convTitle(row.title, t)}</h1>
        <p className="mt-1 text-xs" style={{ color: "#9BA3CC" }}>
          {date}
          {model ? ` · ${model.name}` : ""} · {t("chShareNote")}
        </p>
        <div className="mt-8">
          <SharedMessages messages={row.messages} />
        </div>
      </div>
    </main>
  );
}
