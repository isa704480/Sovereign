import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Eski asosiy manzil — yangi domen ulangach sahifalar shu yerdan ko'chiriladi. */
const LEGACY_HOST = "sovhq.vercel.app";

/**
 * Subdomainlar (bitta Vercel loyihasi, host bo'yicha yo'naltirish):
 *   soveregn.xyz         — landing, narxlar, huquqiy sahifalar, /share
 *   app.soveregn.xyz     — chat, login/register, onboarding, parol tiklash, CLI ulash, admin
 *   api.soveregn.xyz     — faqat /api/* (CLI, desktop). Webhooklar har hostda ishlayveradi.
 *   docs.soveregn.xyz    → /docs,  status.soveregn.xyz → /status (rewrite)
 * Apex → app yo'naltirishi faqat SUBDOMAINS=on bo'lganda (DNS/Vercel domenlari va
 * Supabase/Firebase ruxsatlari tayyor bo'lmaguncha sayt hozirgidek ishlaydi).
 */
const APP_PREFIXES = ["/app", "/login", "/register", "/onboarding", "/reset-password", "/auth", "/cli", "/admin", "/dev"];
/** Har hostda o'zi xizmat qiladigan ildiz fayllar (yo'naltirilmaydi / rewrite qilinmaydi). */
const ROOT_FILES = new Set(["/robots.txt", "/sitemap.xml", "/site.webmanifest", "/favicon.ico", "/opengraph-image"]);

const hasPrefix = (p: string, prefixes: string[]) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));

function requestHost(request: NextRequest): string {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host)
    .split(":")[0]
    .toLowerCase();
}

function canonicalOrigin(): URL | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  } catch {
    return null;
  }
}

const redirect = (origin: string, path: string, search: string) => NextResponse.redirect(new URL(path + search, origin), 308);

/**
 * Eski manzildagi sahifa so'rovlarini asosiy domenga 308 bilan yo'naltiradi.
 * Faqat NEXT_PUBLIC_SITE_URL boshqa domenga qo'yilganda yoqiladi.
 * /api tegilmaydi — Dodo/RollyPay webhooklari va eski CLI versiyalari ishlayveradi.
 */
function legacyRedirect(request: NextRequest, host: string, canonical: URL | null): NextResponse | null {
  if (host !== LEGACY_HOST || !canonical || canonical.hostname === LEGACY_HOST) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) return null;
  // Subdomainlar yoqilgan bo'lsa ilova sahifalari to'g'ridan-to'g'ri app.'ga (ikki marta sakramasin).
  const origin =
    process.env.SUBDOMAINS === "on" && hasPrefix(pathname, APP_PREFIXES)
      ? `${canonical.protocol}//app.${canonical.host}`
      : canonical.origin;
  return redirect(origin, pathname, search);
}

/** Host bo'yicha yo'naltirish / rewrite. null — o'zgarishsiz davom etadi. */
function subdomainRouting(request: NextRequest, host: string, canonical: URL | null): NextResponse | null {
  if (!canonical) return null;
  const apex = canonical.hostname.replace(/^www\./, "");
  const proto = canonical.protocol;
  const port = canonical.port ? `:${canonical.port}` : "";
  const origin = (sub: string) => `${proto}//${sub ? `${sub}.` : ""}${apex}${port}`;
  const { pathname, search } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";

  // API har hostda (webhooklar, app'ning o'z so'rovlari, CLI).
  if (pathname.startsWith("/api/")) return null;

  // docs./status. — o'z bo'limiga rewrite (URL o'zgarmaydi).
  for (const [sub, section] of [["docs", "/docs"], ["status", "/status"]] as const) {
    if (host !== `${sub}.${apex}`) continue;
    if (pathname.startsWith("/_next") || ROOT_FILES.has(pathname)) return null;
    if (pathname === section || pathname.startsWith(`${section}/`)) return null;
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? section : `${section}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // api. — faqat /api/*; boshqa sahifalar landingga.
  if (host === `api.${apex}`) {
    return isRead && !ROOT_FILES.has(pathname) ? redirect(origin(""), pathname, search) : null;
  }

  if (process.env.SUBDOMAINS !== "on" || !isRead || ROOT_FILES.has(pathname)) return null;

  if (host === apex || host === `www.${apex}`) {
    if (hasPrefix(pathname, APP_PREFIXES)) return redirect(origin("app"), pathname, search);
    if (hasPrefix(pathname, ["/docs"])) return redirect(origin("docs"), pathname.slice(5) || "/", search);
    if (hasPrefix(pathname, ["/status"])) return redirect(origin("status"), pathname.slice(7) || "/", search);
    return null;
  }

  if (host === `app.${apex}`) {
    if (pathname === "/") return redirect(origin("app"), "/app", search);
    // Landing / narxlar / huquqiy / share — asosiy domenda.
    if (!hasPrefix(pathname, APP_PREFIXES)) return redirect(origin(""), pathname, search);
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const host = requestHost(request);
  const canonical = canonicalOrigin();
  const routed = legacyRedirect(request, host, canonical) ?? subdomainRouting(request, host, canonical);
  if (routed) return routed;

  const response = await updateSession(request);
  // Ilova va API qidiruv natijalariga chiqmasin (landing/docs/status indekslanadi).
  if (canonical && (host.startsWith("app.") || host.startsWith("api."))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images so the
     * session refresh runs once per navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|sh|ps1)$).*)",
  ],
};
