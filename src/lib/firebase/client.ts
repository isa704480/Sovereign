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

/**
 * Opens the Google popup via Firebase and returns the Google ID token.
 * We hand that token to Supabase (signInWithIdToken) so the rest of the
 * app keeps running on the Supabase session (RLS, profiles, chat).
 */
export async function googleIdTokenViaFirebase(): Promise<{ idToken: string; accessToken?: string }> {
  const auth = getFirebase();
  auth.useDeviceLanguage();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.idToken) throw new Error("Google tokeni olinmadi");
  return { idToken: cred.idToken, accessToken: cred.accessToken };
}
