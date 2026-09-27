import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { MODEL_BY_ID } from "@/config/models";
import { MODEL_THEMES, themeVars } from "@/config/model-themes";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerLang } from "@/lib/i18n-server";
import { translate, type TKey } from "@/lib/i18n";
import { convTitle, localeOf } from "@/lib/locales/chat-data";
import { rateLimit } from "@/lib/rate-limit";
import { ShareLangSwitcher } from "./ShareLangSwitcher";
import { SharedMessages } from "./SharedMessages";

type SharedMessage = { role: "user" | "assistant"; content: string; modelId?: string | null; createdAt?: string };

interface SharedRow {
  id: string;
  title: string;
  model_id: string | null;
  messages: SharedMessage[];
  created_at: string;
  views: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Foydalanuvchi ulashgan, SOVEREIGN tasdiqlamagan" ogohlantirishi. Ulashilgan nusxa mijoz yuborgan
 * matndan tuziladi (actions/share.ts) — rasmiy domen va model belgisi ostida soxta "AI javobi"
 * (fishing havolasi) bilan ishonch uyg'otmasin. Kalit hali lug'atda bo'lmasa — sahifa yiqilmaydi.
 */
function unverifiedNotice(t: (k: TKey) => string): string {
  try {
    return t("chShareUnverified" as TKey) ?? "";
  } catch {
    return "";
  }
}

/**
 * jsonb shaklini tekshiradi: `messages` massiv emas yoki `content` satr emas bo'lsa sahifa
 * 500 bilan yiqilmasin — yaroqsiz elementlar tashlab yuboriladi.
 */
function sanitizeMessages(raw: unknown): SharedMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m): SharedMessage[] => {
    if (!m || typeof m !== "object") return [];
    const { role, content, modelId, createdAt } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return [];
    return [
      {
        role,
        content,
        modelId: typeof modelId === "string" ? modelId : null,
        createdAt: typeof createdAt === "string" ? createdAt : undefined,
      },
    ];
  });
}

/** Ko'rishlar soni: bir IP bir havolani sutkada bir marta sanaydi (F5 bilan sun'iy oshirilmasin). */
async function countView(id: string, ip: string) {
  const { ok } = await rateLimit(`share:view:${id}:${ip}`, 1, DAY_MS);
  if (!ok) return;
  const { error } = await createAnonClient().rpc("shared_conversation_view", { p_id: id });
  if (error) console.error("[share] shared_conversation_view:", error.message);
}

// cache: generateMetadata va sahifa bitta so'rov ichida bir marta o'qiydi (views ikki marta sanalmaydi).
const load = cache(async (id: string): Promise<SharedRow | null> => {
  if (!/^[A-Za-z0-9]{16}$/.test(id) || !isSupabaseConfigured()) return null;
  const supabase = createAnonClient();
  // Jadvalni ommaga ochmaymiz (0028): faqat aniq id bo'yicha, user_id'siz RPC.
  const { data, error } = await supabase.rpc("get_shared_conversation", { p_id: id });
  if (error) {
    console.error("[share] get_shared_conversation:", error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as SharedRow | undefined;
  if (!row) return null;
  // Hisob javobdan keyin (after) — sahifa Upstash/RPC kutmaydi. headers() after() ichida
  // server komponentda taqiqlangan, shuning uchun IP oldindan o'qiladi.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  if (ip) after(() => countView(id, ip).catch(() => undefined));
  return {
    ...row,
    title: typeof row.title === "string" ? row.title : "",
    messages: sanitizeMessages(row.messages),
  };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await load(id);
  const lang = await getServerLang();
  const t = (k: TKey) => translate(lang, k);
  // Brend root shablonidan ("%s · SOVEREIGN AI") qo'shiladi — bu yerda takrorlanmaydi.
  // og:title / og:url ham shu title va /share/<id> dan (layout.tsx) to'ldiriladi.
  return {
    title: row ? convTitle(row.title, t) : t("chShareNotFound"),
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
  const notice = unverifiedNotice(t);
  const date = new Date(row.created_at).toLocaleDateString(localeOf(lang), { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="theme-root min-h-svh" style={{ ...themeVars(MODEL_THEMES.sovereign), background: "var(--t-bg)", color: "var(--t-text)" }}>
      {/* Yopishqoq navigatsiya — ostidan kontent o'tadi, shuning uchun shisha (glass) shu yerda o'rinli. */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{ borderColor: "var(--t-border)", background: "rgba(6,8,18,0.78)", backdropFilter: "saturate(180%) blur(20px)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2" aria-label={t("chLogoHomeAria")}>
            <LogoMark size={22} />
            <span className="font-display text-sm font-bold tracking-[0.12em]">SOVEREIGN</span>
          </Link>
          <div className="flex items-center gap-2">
            <ShareLangSwitcher serverLang={lang} />
            <Link
              href="/register"
              className="inline-flex min-h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-opacity hover:opacity-90 [@media(pointer:coarse)]:min-h-11"
              style={{ background: "var(--t-primary-fill)", color: "var(--t-on-primary)" }}
            >
              {t("chShareTry")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <h1 className="t-display text-balance text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{convTitle(row.title, t)}</h1>
        <p className="mt-1 text-xs" style={{ color: "var(--t-text-muted)" }}>
          {date}
          {model ? ` · ${model.name} · ${model.provider}` : ""} · {t("chShareNote")}
        </p>
        {notice && (
          <p
            role="note"
            className="mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed"
            style={{
              borderColor: "color-mix(in srgb, var(--t-warning) 35%, transparent)",
              background: "color-mix(in srgb, var(--t-warning) 8%, transparent)",
              color: "var(--t-text)",
            }}
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--t-warning)" }} aria-hidden />
            <span>{notice}</span>
          </p>
        )}
        <div className="mt-8">
          <SharedMessages messages={row.messages} />
        </div>
      </main>
    </div>
  );
}
