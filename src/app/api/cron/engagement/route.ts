import { bearerMatches, emailTokenSecret, unsubscribeUrl } from "@/lib/email/token";
import { buildTipEmail } from "@/lib/email/tip-email";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Bir ishga tushishda eng ko'p yuboriladigan email (GitHub Actions soatiga 1 marta chaqiradi). */
const BATCH_LIMIT = 50;
/** Faollikdan keyin va emaillar orasidagi minimal oraliq (soat). */
const GAP_HOURS = 30;
/** Foydalanuvchi qaytmasa, ketma-ket eng ko'p email. */
const MAX_IN_A_ROW = 8;
/** Yuborish sikli uchun vaqt chegarasi (maxDuration = 60s). */
const TIME_BUDGET_MS = 40_000;

interface DueRow {
  user_id: string;
  email: string;
  full_name: string | null;
  lang: string | null;
  tip_seq: number;
  last_tip_email_at: string | null;
  tip_email_count: number;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");
}

/**
 * GET /api/cron/engagement — opt-in foydalanuvchilarga qayta jalb qilish (tip) emaili.
 *   Himoya: Authorization: Bearer $CRON_SECRET
 *   ?dry=1 — faqat navbatdagilar sonini qaytaradi, hech narsa yubormaydi/yozmaydi.
 * Qoidalar SQL'da (0034): rozilik, tasdiqlangan email, 30 soat jimlik, 30 soatda ≤ 1,
 * qaytmaguncha ≤ 8. Har foydalanuvchi yuborishdan OLDIN band qilinadi (parallel cron
 * ikki marta yozmaydi); yuborish muvaffaqiyatsiz bo'lsa band qilish qaytariladi.
 */
export async function GET(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  if (!dry && !isResendConfigured()) {
    console.log("[engagement] RESEND_API_KEY not set — skipping tip emails");
    return Response.json({ ok: true, skipped: "RESEND_API_KEY not set" });
  }
  const secret = emailTokenSecret();
  if (!secret) {
    console.log("[engagement] EMAIL_TOKEN_SECRET/CRON_SECRET too short — cannot sign unsubscribe links, skipping");
    return Response.json({ ok: true, skipped: "no signing secret" });
  }

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return Response.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  const { data, error } = await db.rpc("engagement_due_recipients", {
    p_limit: BATCH_LIMIT,
    p_gap_hours: GAP_HOURS,
    p_max: MAX_IN_A_ROW,
  });
  if (error) {
    console.error("[engagement] due query failed:", error.message);
    return Response.json({ ok: false, error: "due query failed" }, { status: 500 });
  }
  const due = (data ?? []) as DueRow[];
  if (dry) return Response.json({ ok: true, dry: true, due: due.length });

  const site = siteUrl();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const started = Date.now();
  for (const r of due) {
    // maxDuration'dan oldin to'xtaymiz — qolganlari keyingi soatda.
    if (Date.now() - started > TIME_BUDGET_MS) break;
    // 1) Band qilish (claim). null — boshqa ishga tushish ulgurgan yoki holat o'zgargan.
    const { data: claimedAt, error: claimErr } = await db.rpc("engagement_mark_sent", {
      p_user: r.user_id,
      p_gap_hours: GAP_HOURS,
      p_max: MAX_IN_A_ROW,
    });
    if (claimErr || !claimedAt) {
      skipped++;
      continue;
    }

    // 2) Yuborish — foydalanuvchi tilida, bir bosishda bekor qilish havolasi bilan.
    const unsub = unsubscribeUrl(site, r.user_id, secret, r.lang ?? undefined);
    const mail = buildTipEmail({ lang: r.lang, fullName: r.full_name, seq: r.tip_seq, siteUrl: site, unsubscribeUrl: unsub });
    const res = await sendEmail({
      to: r.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `sov-tip-${r.user_id}-${r.tip_seq}`,
    });

    if (res.ok) {
      sent++;
      continue;
    }
    // 3) Yuborilmadi — band qilishni qaytaramiz (keyingi soatda qayta urinadi).
    failed++;
    console.error(`[engagement] send failed (status ${res.status}): ${res.error}`);
    await db.rpc("engagement_unmark", {
      p_user: r.user_id,
      p_claimed_at: claimedAt,
      p_prev_at: r.last_tip_email_at,
      p_prev_count: r.tip_email_count,
    });
    // Kalit/domen noto'g'ri yoki limit — qolganlarini ham buzmaslik uchun to'xtaymiz.
    if (res.status === 401 || res.status === 403 || res.status === 422 || res.status === 429) break;
  }

  console.log(`[engagement] due=${due.length} sent=${sent} failed=${failed} skipped=${skipped}`);
  return Response.json({ ok: true, due: due.length, sent, failed, skipped });
}
