/**
 * Bitta ops hodisasining bir qatorli tavsifi (Telegram lentasi — HTML, admin kartasi — oddiy matn).
 * PURE, client'da ham ishlaydi. Faqat OpsEvent.d dagi ruxsat etilgan maydonlar ishlatiladi.
 */
import { fmt, translate, type Lang, type TKey } from "@/lib/i18n";
import { countryCode, duration, escapeHtml, money, providerLabel, safeId, safeModel, tashkentTime } from "./format";
import type { OpsEvent, OpsEventType } from "./store";

export const TYPE_LABEL: Record<OpsEventType, TKey> = {
  signup: "p22oTypeSignup",
  payment: "p22oTypePayment",
  renewal: "p22oTypeRenewal",
  refund: "p22oTypeRefund",
  chargeback: "p22oTypeChargeback",
  breaker: "p22oTypeBreaker",
  failover: "p22oTypeFailover",
  budget: "p22oTypeBudget",
  release: "p22oTypeRelease",
  deploy: "p22oTypeDeploy",
  device_login: "p22oTypeDeviceLogin",
  device_revoke: "p22oTypeDeviceRevoke",
};

const ORDER_KEY: Partial<Record<OpsEventType, TKey>> = {
  payment: "p22oFeedPayment",
  renewal: "p22oFeedRenewal",
  refund: "p22oFeedRefund",
  chargeback: "p22oFeedChargeback",
};

const str = (v: unknown, fallback = "—") => (typeof v === "string" && v ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const PLAN_NAME: Record<string, string> = { starter: "Starter", pro: "Pro", ultra: "Ultra", free: "Free" };
const PAY_PROVIDER: Record<string, string> = { dodo: "Dodo", rollypay: "RollyPay", zenobank: "ZenoBank" };

export function planLabel(v: unknown): string {
  const k = safeId(v);
  return PLAN_NAME[k] ?? k;
}
export function payProviderLabel(v: unknown): string {
  const k = safeId(v);
  return PAY_PROVIDER[k] ?? k;
}

function scopeText(lang: Lang, scope: unknown): string {
  if (scope === "$paid") return translate(lang, "p22oScopePaid");
  if (scope === "$free") return translate(lang, "p22oScopeFree");
  return "";
}

/** Shablon + qiymatlar; html=true — ikkalasi ham escape qilinadi. */
function render(lang: Lang, key: TKey, vars: Record<string, string | number>, html: boolean): string {
  if (!html) return fmt(translate(lang, key), vars);
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) safe[k] = escapeHtml(String(v));
  return fmt(escapeHtml(translate(lang, key)), safe);
}

export function orderVars(d: OpsEvent["d"], lang: Lang): Record<string, string> {
  return {
    plan: planLabel(d.plan),
    period: translate(lang, d.period === "year" ? "p22oPeriodYear" : "p22oPeriodMonth"),
    amount: money(num(d.amount), str(d.currency, "USD")),
    provider: payProviderLabel(d.provider),
    email: str(d.email, "***"),
  };
}

export function breakerLine(d: OpsEvent["d"], lang: Lang, html: boolean): string {
  const provider = str(d.label, providerLabel(str(d.provider)));
  const scope = scopeText(lang, d.scope);
  if (d.to === "open") {
    const until = num(d.until);
    return render(lang, "p22oFeedBreakerOpen", { provider, scope, reason: str(d.reason, "other"), until: until ? tashkentTime(until) : "—" }, html);
  }
  if (d.to === "half_open") return render(lang, "p22oFeedBreakerHalf", { provider, scope }, html);
  const downMs = num(d.downMs);
  const down = downMs ? render(lang, "p22oFeedBreakerDown", { dur: duration(downMs, lang) }, html) : "";
  // `down` allaqachon (kerak bo'lsa) escape qilingan — ikkinchi marta escape qilinmasin.
  return render(lang, "p22oFeedBreakerClosed", { provider, scope, down: "\u0000" }, html).replace("\u0000", down);
}

/** Admin kartasi va lenta uchun bitta qator. */
export function eventLine(ev: OpsEvent, lang: Lang, html = false): string {
  const d = ev.d;
  const orderKey = ORDER_KEY[ev.type];
  if (orderKey) return render(lang, orderKey, orderVars(d, lang), html);
  switch (ev.type) {
    case "signup": {
      const purposes = str(d.purposes, "");
      const purpose = purposes ? render(lang, "p22oFeedPurpose", { list: purposes }, html) : "";
      return render(lang, "p22oFeedSignup", { email: str(d.email, "***"), country: countryCode(d.country), method: str(d.method), purpose: "\u0000" }, html).replace("\u0000", purpose);
    }
    case "breaker":
      return breakerLine(d, lang, html);
    case "failover":
      return render(
        lang,
        "p22oFeedFailoverLine",
        {
          from: providerLabel(str(d.from)),
          reason: str(d.reason, "other"),
          to: providerLabel(str(d.to)),
          model: safeModel(d.model),
          n: num(d.n) ?? 0,
        },
        html,
      );
    case "release":
      return render(lang, "p22oFeedRelease", { name: str(d.name) }, html);
    case "deploy":
      return render(lang, "p22oDeployLine", { subject: str(d.subject), sha: str(d.sha) }, html);
    case "device_login":
      return render(lang, "p22oFeedDeviceLine", { app: str(d.app), os: str(d.os), country: countryCode(d.country), email: str(d.email, "***") }, html);
    case "device_revoke":
      return render(lang, "p22oFeedRevokes", { n: 1, list: `${str(d.app)} · ${str(d.os)} · ${str(d.email, "***")}` }, html);
    case "budget": {
      const label = translate(lang, TYPE_LABEL.budget);
      const text = `${label}: ${safeId(d.alert)}`;
      return html ? escapeHtml(text) : text;
    }
    default:
      return html ? escapeHtml(ev.type) : ev.type;
  }
}
