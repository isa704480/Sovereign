"use client";

import { useSyncExternalStore } from "react";

/** @supabase/ssr sessiya cookie'si: sb-<ref>-auth-token (katta bo'lsa .0/.1 bo'laklarga bo'linadi). */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

const subscribe = () => () => {};
const hasSessionCookie = () => SESSION_COOKIE.test(document.cookie);
const onServer = () => false;

/**
 * Ommaviy sahifalar (landing, huquqiy, yangiliklar) STATIK — serverda getUser() chaqirilmaydi,
 * CDN keshi saqlanadi. Kirgan foydalanuvchini brauzerda sessiya cookie'si borligidan bilamiz
 * (tarmoq so'rovisiz, Supabase SDK'siz). Bu faqat tugma matni/havolasi uchun ishora: sessiya
 * eskirgan bo'lsa /app baribir /login'ga yo'naltiradi. SSR va hidratsiyada — false.
 */
export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, hasSessionCookie, onServer);
}
