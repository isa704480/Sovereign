import "server-only";
import { lookup as dnsLookupCb, type LookupAddress } from "node:dns";
import { lookup as dnsLookupPromise } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * Reads a public web page so the model can explain it.
 *
 * SSRF is the whole risk here: a prompt (or a page's own redirect) must never
 * reach the platform's internal network or cloud metadata. Every hop is
 * re-validated: scheme, port, and the *resolved* IP of the host.
 */

const MAX_BYTES = 1_500_000;
const MAX_CHARS = 12_000;
const TIMEOUT_MS = 12_000;
const MAX_HOPS = 3;

export interface PageRead {
  url: string;
  title: string;
  text: string;
}

/* ------------------------------------------------------------------------- */
/*                               SSRF guard                                   */
/* ------------------------------------------------------------------------- */

/** IPv4 → 4 bayt (faqat kanonik "a.b.c.d"). */
function parseIPv4(ip: string): number[] | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const out: number[] = [];
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv6 → 16 bayt ("::", zona id va oxiridagi a.b.c.d bilan). */
function parseIPv6(raw: string): number[] | null {
  let s = raw.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".", lastColon)) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    s = s.slice(0, lastColon + 1) + "0:0"; // joy egallovchi — keyin almashtiriladi
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (h: string) => (h === "" ? [] : h.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function isPrivateV4(b: number[]): boolean {
  const [a, c] = b;
  if (a === 0 || a === 10 || a === 127) return true; // "this network", private, loopback
  if (a === 169 && c === 254) return true; // link-local + cloud metadata
  if (a === 172 && c >= 16 && c <= 31) return true;
  if (a === 192 && c === 168) return true;
  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT (+ Alibaba metadata)
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return true; // IETF / TEST-NET-1
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmark
  if (a === 198 && c === 51 && b[2] === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

function isPrivateV6(b: number[]): boolean {
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const v4 = (off: number) => b.slice(off, off + 4);
  // ::/96 (::, ::1, ::a.b.c.d), ::ffff:a.b.c.d va ::ffff:0:a.b.c.d — ichidagi IPv4 tekshiriladi.
  if (zero(0, 12)) return isPrivateV4(v4(12));
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateV4(v4(12));
  if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return isPrivateV4(v4(12));
  // NAT64 64:ff9b::/96 — ichidagi IPv4; 64:ff9b:1::/48 (lokal NAT64) — bloklanadi.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (zero(4, 12)) return isPrivateV4(v4(12));
    return true;
  }
  // 6to4 2002::/16 — 2..5 baytlar IPv4.
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateV4(v4(2));
  // Teredo 2001:0::/32 — IPv4 yashiringan (XOR), to'liq bloklaymiz.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;
  // Hujjatlar uchun 2001:db8::/32.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true;
  // Faqat global unicast 2000::/3 (fc00::/7 ULA, fe80::/10, fec0::/10, ff00::/8, 100::/64 — yo'q).
  return (b[0] & 0xe0) !== 0x20;
}

/** Private, loopback, link-local, CGNAT, metadata va boshqa maxsus manzillar — hech qachon so'ralmaydi. */
export function isPrivateAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "");
  const v = isIP(host.split("%")[0]);
  if (v === 4) {
    const b = parseIPv4(host);
    return b ? isPrivateV4(b) : true;
  }
  if (v === 6) {
    const b = parseIPv6(host);
    return b ? isPrivateV6(b) : true;
  }
  return true;
}

export interface PublicUrlOptions {
  /** Faqat https va 443-port (MCP kabi foydalanuvchi bergan endpointlar uchun). */
  httpsOnly?: boolean;
}

function dnsLookupAll(host: string): Promise<LookupAddress[]> {
  return dnsLookupPromise(host, { all: true, verbatim: true });
}

/**
 * URL'ni tekshiradi: sxema, port, login-parol yo'qligi, host va DNS orqali
 * aniqlangan BARCHA IP'lar ommaviy ekanligi. Mos kelmasa throw qiladi.
 * DNS rebinding: haqiqiy ulanishda `safeFetch` IP'ni yana tekshiradi.
 */
export async function assertPublicUrl(raw: string, opts: PublicUrlOptions = {}): Promise<URL> {
  const url = new URL(raw);
  if (opts.httpsOnly) {
    if (url.protocol !== "https:") throw new Error("scheme");
    if (url.port && url.port !== "443") throw new Error("port");
  } else {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
    if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  }
  if (url.username || url.password) throw new Error("credentials");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("private");
    return url;
  }
  if (
    !host.includes(".") ||
    host.endsWith(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new Error("host");
  }
  const addrs = await dnsLookupAll(host);
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("private");
  return url;
}

/**
 * Ulanish paytidagi DNS lookup: har bir natijani tekshiradi. Shu tufayli
 * "tekshiruvda ommaviy IP, ulanishda 127.0.0.1" (DNS rebinding) ishlamaydi.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookupCb(hostname, { all: true, family: options.family, hints: options.hints }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`blocked address for ${hostname}`);
      e.code = "EBLOCKED";
      return callback(e, "", 0);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

export interface SafeFetchInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxHops?: number;
  httpsOnly?: boolean;
}

function decodeBody(buf: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const enc = (encoding ?? "").trim().toLowerCase();
  const opts = { maxOutputLength: maxBytes };
  if (enc === "gzip" || enc === "x-gzip") return gunzipSync(buf, opts);
  if (enc === "deflate") return inflateSync(buf, opts);
  if (enc === "br") return brotliDecompressSync(buf, opts);
  return buf;
}

/** Bitta HTTP(S) so'rov: IP ulanish paytida tekshiriladi, javob hajmi va vaqti cheklangan. */
function pinnedRequest(url: URL, init: SafeFetchInit): Promise<Response> {
  const maxBytes = init.maxBytes ?? MAX_BYTES;
  const timeoutMs = init.timeoutMs ?? TIMEOUT_MS;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method ?? "GET",
        headers: { "Accept-Encoding": "gzip, deflate, br", ...(init.headers ?? {}) },
        lookup: guardedLookup,
        timeout: timeoutMs,
      },
      (res) => {
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared && declared > maxBytes) {
          req.destroy(new Error("too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new Error("too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const status = res.statusCode ?? 502;
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (v === undefined || k === "content-encoding" || k === "content-length") continue;
              if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
              else headers.set(k, String(v));
            }
            const nullBody = status === 204 || status === 205 || status === 304;
            const body = nullBody
              ? null
              : new Uint8Array(decodeBody(Buffer.concat(chunks), res.headers["content-encoding"], maxBytes));
            resolve(new Response(body, { status: status < 200 || status > 599 ? 502 : status, headers }));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    const deadline = setTimeout(() => req.destroy(new Error("timeout")), timeoutMs);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/**
 * SSRF-xavfsiz fetch: har bir hop'da `assertPublicUrl`, redirect'lar qo'lda
 * ("manual") kuzatiladi va qayta tekshiriladi, IP esa ulanish paytida yana
 * tekshiriladi (DNS rebinding). GET bo'lmagan so'rov faqat 307/308 da davom etadi.
 */
export async function safeFetch(raw: string, init: SafeFetchInit = {}): Promise<{ res: Response; finalUrl: URL }> {
  const maxHops = init.maxHops ?? MAX_HOPS;
  const method = init.method ?? "GET";
  let current = raw;
  for (let hop = 0; hop <= maxHops; hop++) {
    const url = await assertPublicUrl(current, { httpsOnly: init.httpsOnly });
    const res = await pinnedRequest(url, init);
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const next = res.headers.get("location");
      if (!next) return { res, finalUrl: url };
      if (method !== "GET" && res.status !== 307 && res.status !== 308) return { res, finalUrl: url };
      current = new URL(next, url).toString(); // keyingi aylanishda qayta tekshiriladi
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error("too many redirects");
}

/** Very small HTML → text: drops scripts, styles and tags, keeps the title. */
function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { title: decodeEntities(title), text };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** URLs the user typed. Only the first two are read — cost and latency. */
export function extractUrls(text: string, limit = 2): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const clean = raw.replace(/[.,;:!?]+$/, "");
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

/** Fetches one page as plain text, following redirects manually and safely. */
export async function readPage(raw: string): Promise<PageRead | null> {
  let res: Response;
  let url: URL;
  try {
    ({ res, finalUrl: url } = await safeFetch(raw, {
      maxHops: MAX_HOPS,
      headers: {
        // Identify honestly; many sites block unknown clients.
        "User-Agent": "SovereignBot/1.0 (+https://soveregn.xyz)",
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
        "Accept-Language": "uz,en;q=0.8,ru;q=0.6",
      },
    }));
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/(json|xhtml)/i.test(type)) return null;

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return null;
  const body = new TextDecoder("utf-8").decode(buf);

  const { title, text } = /json/i.test(type) ? { title: "", text: body } : htmlToText(body);
  if (!text) return null;
  return {
    url: url.toString(),
    title: title || url.hostname,
    text: text.slice(0, MAX_CHARS),
  };
}

/** Reads the given URLs in parallel and builds the system-prompt block. */
export async function readPages(urls: string[]): Promise<{ pages: PageRead[]; prompt: string }> {
  const pages = (await Promise.all(urls.map((u) => readPage(u).catch(() => null)))).filter(
    (p): p is PageRead => !!p,
  );
  if (!pages.length) return { pages, prompt: "" };
  const blocks = pages.map(
    (p, i) => `[${i + 1}] ${p.title} — ${p.url}\n${p.text}`,
  );
  return {
    pages,
    prompt:
      "FOYDALANUVCHI YUBORGAN SAHIFALAR MATNI (o'zing o'qib chiqding — shu asosda javob ber, " +
      "har bir da'voni [1], [2] kabi manba raqami bilan belgila; sahifada yo'q narsani o'ylab topma):\n\n" +
      blocks.join("\n\n---\n\n"),
  };
}
