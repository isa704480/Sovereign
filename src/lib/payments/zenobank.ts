import "server-only";
import { ZenoBankClient } from "@zenobank/sdk";

export function isZenoConfigured(): boolean {
  return Boolean(process.env.ZENOBANK_API_KEY);
}

let client: ZenoBankClient | null = null;
export function zeno(): ZenoBankClient {
  if (!process.env.ZENOBANK_API_KEY) throw new Error("ZENOBANK_API_KEY sozlanmagan");
  if (!client) client = new ZenoBankClient({ apiKey: process.env.ZENOBANK_API_KEY });
  return client;
}

export const ZENO_WEBHOOK_SECRET = process.env.ZENOBANK_WEBHOOK_SECRET ?? "";
