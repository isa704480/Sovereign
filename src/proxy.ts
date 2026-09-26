import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Eski asosiy manzil — yangi domen ulangach sahifalar shu yerdan ko'chiriladi. */
const LEGACY_HOST = "sovhq.vercel.app";

/**
 * Eski manzildagi sahifa so'rovlarini asosiy domenga 308 bilan yo'naltiradi.
 * Faqat NEXT_PUBLIC_SITE_URL boshqa domenga qo'yilganda yoqiladi (Supabase/Google
 * login yangi domenga sozlanmaguncha foydalanuvchi eski manzilda qola oladi).
 * /api tegilmaydi — Dodo/RollyPay webhooklari va eski CLI versiyalari ishlayveradi.
 */
function legacyRedirect(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(":")[0];
  if (host !== LEGACY_HOST) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.nextUrl.pathname.startsWith("/api/")) return null;
  let canonical: URL;
  try {
    canonical = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  } catch {
    return null;
  }
  if (canonical.hostname === LEGACY_HOST) return null;
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical.origin);
  return NextResponse.redirect(target, 308);
}

export async function proxy(request: NextRequest) {
  return legacyRedirect(request) ?? updateSession(request);
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
