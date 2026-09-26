/**
 * Google connectorni ulash belgisi: connectGoogle (server action) qo'yadi, OAuth
 * callback o'qiydi. Qiymat — "<user_id>:<connector_id>". httpOnly, faqat
 * /auth/callback yo'liga, 15 daqiqa.
 */
export const CONNECT_COOKIE = "sov-connect";

export function parseConnectCookie(v: string | undefined | null): { userId: string; connectorId: string } | null {
  if (!v) return null;
  const i = v.indexOf(":");
  if (i <= 0) return null;
  return { userId: v.slice(0, i), connectorId: v.slice(i + 1) };
}
