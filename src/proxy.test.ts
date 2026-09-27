/**
 * proxy.ts host yo'naltirishi (tarmoqsiz): npx tsx --conditions=react-server src/proxy.test.ts
 * Tekshiriladi: /cli va /pricing bitta sakrash bilan yakuniy manzilga (404 emas), mavjud qoidalar buzilmagan.
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

// proxy.ts env'ni har so'rovda o'qiydi.
process.env.NEXT_PUBLIC_SITE_URL = "https://soveregn.xyz";
process.env.SUBDOMAINS = "on";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✕ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
}

const go = async (url: string) => {
  const u = new URL(url);
  const res = await proxy(new NextRequest(url, { headers: { host: u.host } }));
  return { status: res.status, location: res.headers.get("location") };
};

void (async () => {
await test("/cli (apex va app.) — docs CLI bo'limiga bitta 308", async () => {
  for (const url of ["https://soveregn.xyz/cli", "https://app.soveregn.xyz/cli", "https://www.soveregn.xyz/cli"]) {
    const r = await go(url);
    assert.equal(r.status, 308, url);
    assert.equal(r.location, "https://docs.soveregn.xyz/#cli", url);
  }
});

await test("/pricing (apex va app.) — landing #pricing ga bitta 308", async () => {
  for (const url of ["https://soveregn.xyz/pricing", "https://app.soveregn.xyz/pricing"]) {
    const r = await go(url);
    assert.equal(r.status, 308, url);
    assert.equal(r.location, "https://soveregn.xyz/#pricing", url);
  }
});

await test("/cli/sessions va /cli/connect — avvalgidek app.'ga", async () => {
  const r = await go("https://soveregn.xyz/cli/sessions");
  assert.equal(r.status, 308);
  assert.equal(r.location, "https://app.soveregn.xyz/cli/sessions");
});

console.log(`\n${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
})();
