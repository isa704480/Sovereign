"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup, type Auth } from "firebase/auth";

// Firebase web config is public by design (guarded by Firebase security rules).
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

let app: FirebaseApp | null = null;
function getFirebase(): Auth {
  if (!app) app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Opens the Google popup via Firebase and returns the Google ID token +
 * random nonce. Supabase `signInWithIdToken` bilan nonce paketda bo'lishi
 * ID token replay hujumini bekor qiladi.
 *
 * Nonce naqshi (Supabase docs): mijoz `SHA256(nonce)` ni provider'ga uzatadi,
 * keyin toza `nonce` ni Supabase'ga beradi. Supabase ID token ichidagi
 * `nonce` claim'ni sha256(bizniki) ga solishtiradi.
 */
export async function googleIdTokenViaFirebase(): Promise<{ idToken: string; accessToken?: string; nonce: string }> {
  const auth = getFirebase();
  auth.useDeviceLanguage();
  const provider = new GoogleAuthProvider();
  const nonce = crypto.randomUUID();
  const hashed = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)));
  provider.setCustomParameters({ prompt: "select_account", nonce: hashed });
  const result = await signInWithPopup(auth, provider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.idToken) throw new Error("Google tokeni olinmadi");
  return { idToken: cred.idToken, accessToken: cred.accessToken, nonce };
}
