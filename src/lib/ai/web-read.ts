import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

/** Private, loopback, link-local and carrier-grade NAT space — never fetched. */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — validate the embedded address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  if (url.username || url.password) throw new Error("credentials");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("private");
    return url;
  }
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host");
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("private");
  return url;
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
  let current = raw;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let url: URL;
    try {
      url = await assertPublicUrl(current);
    } catch {
      return null;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          // Identify honestly; many sites block unknown clients.
          "User-Agent": "SovereignBot/1.0 (+https://sovhq.vercel.app)",
          Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
          "Accept-Language": "uz,en;q=0.8,ru;q=0.6",
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, url).toString(); // re-validated on the next loop
      continue;
    }
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/(json|xhtml)/i.test(type)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared && declared > MAX_BYTES) return null;

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
  return null;
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
