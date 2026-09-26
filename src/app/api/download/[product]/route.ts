import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/download/desktop?os=win|mac|linux[&arch=arm64|x64]
 * GET /api/download/cli?os=win|mac|linux[&arch=arm64|x64]
 *
 * GitHub Releases (isa704480/Sovereign) ro'yxatidan mos mahsulot tegi (desktop-v* / cli-v*)
 * bo'yicha eng yangi, draft/prerelease bo'lmagan va KERAKLI FAYLI BOR relizni topib,
 * o'sha faylga 302 bilan yo'naltiradi. Hech narsa topilmasa — umumiy relizlar sahifasi.
 * Faqat API qaytargan github.com/<repo>/releases/download/... (yoki
 * objects.githubusercontent.com) manzillariga yo'naltiriladi — ochiq redirect yo'q.
 */
export const dynamic = "force-dynamic";

const REPO = "isa704480/Sovereign";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const DOWNLOAD_PATH_PREFIX = `/${REPO}/releases/download/`;
const CACHE_MS = 10 * 60 * 1000;
const LIMIT_PER_MINUTE = 30;

type Os = "win" | "mac" | "linux";
type Arch = "x64" | "arm64";
type Product = "desktop" | "cli";

const OSES: readonly Os[] = ["win", "mac", "linux"];
const ARCHES: readonly Arch[] = ["x64", "arm64"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** electron-builder nomlaridagi versiya: 0.5.1, 1.0.0-beta.2 ... */
const VER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;

/** Mahsulot → teg prefiksi va (os, arch) uchun kerakli fayl nomi andozasi. */
const PRODUCTS: Record<Product, { tagPrefix: string; asset: (os: Os, arch: Arch) => RegExp | null }> = {
  desktop: {
    tagPrefix: "desktop-v",
    asset(os, arch) {
      if (os === "win") return new RegExp(`^SOVEREIGN-Cowork-Setup-${VER}\\.exe$`);
      if (os === "mac") return new RegExp(`^SOVEREIGN-Cowork-${VER}-${esc(arch)}\\.dmg$`);
      // AppImage hozircha faqat x86_64.
      return arch === "x64" ? new RegExp(`^SOVEREIGN-Cowork-${VER}-x86_64\\.AppImage$`) : null;
    },
  },
  cli: {
    tagPrefix: "cli-v",
    asset(os, arch) {
      // Windows arm64 x64 binarini emulyatsiyada ishlatadi — bitta fayl.
      if (os === "win") return /^sov-win-x64\.exe$/;
      if (os === "mac") return new RegExp(`^sov-macos-${esc(arch)}$`);
      return new RegExp(`^sov-linux-${esc(arch)}$`);
    },
  },
};

/** OS bo'yicha standart arxitektura (arch berilmasa). */
const DEFAULT_ARCH: Record<Os, Arch> = { win: "x64", mac: "arm64", linux: "x64" };

type Asset = { name: string; url: string };
type Release = { tag: string; publishedAt: number; assets: Asset[] };

let cache: { at: number; releases: Release[] } | null = null;
let inflight: Promise<Release[]> | null = null;

function parseReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  const out: Release[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const rel = r as Record<string, unknown>;
    if (rel.draft !== false || rel.prerelease !== false || typeof rel.tag_name !== "string") continue;
    const assets: Asset[] = [];
    if (Array.isArray(rel.assets)) {
      for (const a of rel.assets) {
        const asset = a as Record<string, unknown> | null;
        if (asset && typeof asset.name === "string" && typeof asset.browser_download_url === "string") {
          assets.push({ name: asset.name, url: asset.browser_download_url });
        }
      }
    }
    const publishedAt = typeof rel.published_at === "string" ? Date.parse(rel.published_at) : NaN;
    out.push({ tag: rel.tag_name, publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0, assets });
  }
  // Eng yangisi birinchi.
  return out.sort((a, b) => b.publishedAt - a.publishedAt);
}

async function fetchReleases(): Promise<Release[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sovereign-download-redirect",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(RELEASES_API, {
    headers,
    // Next data cache (instansiyalar orasida umumiy) — faqat 200 javoblar saqlanadi.
    next: { revalidate: CACHE_MS / 1000 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return parseReleases(await res.json());
}

/** Reliz ro'yxati: 10 daqiqa xotirada; GitHub xato bersa — eski (stale) nusxa. */
async function getReleases(): Promise<Release[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.releases;
  inflight ??= fetchReleases()
    .then((releases) => {
      cache = { at: Date.now(), releases };
      return releases;
    })
    .finally(() => {
      inflight = null;
    });
  try {
    return await inflight;
  } catch (e) {
    console.error("[download] GitHub releases:", e instanceof Error ? e.message : e);
    return cache?.releases ?? [];
  }
}

/** Faqat shu repo relizlari fayllari (github.com) yoki GitHub'ning fayl CDN'i. */
function safeDownloadUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (u.hostname === "github.com" && u.pathname.startsWith(DOWNLOAD_PATH_PREFIX)) return u.toString();
  if (u.hostname === "objects.githubusercontent.com") return u.toString();
  return null;
}

function redirect(url: string, cacheControl: string) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": cacheControl } });
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (product !== "desktop" && product !== "cli") return bad("unknown_product", 404);

  const rl = await rateLimit(`download:${clientIp(req)}`, LIMIT_PER_MINUTE, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)), "Cache-Control": "no-store" },
      },
    );
  }

  const sp = new URL(req.url).searchParams;
  const osParam = sp.get("os");
  const archParam = sp.get("arch");
  if (!osParam || !(OSES as readonly string[]).includes(osParam)) return bad("invalid_os");
  if (archParam !== null && !(ARCHES as readonly string[]).includes(archParam)) return bad("invalid_arch");
  const os = osParam as Os;
  const arch = (archParam as Arch | null) ?? DEFAULT_ARCH[os];

  const { tagPrefix, asset } = PRODUCTS[product];
  const pattern = asset(os, arch);
  if (pattern) {
    for (const rel of await getReleases()) {
      if (!rel.tag.startsWith(tagPrefix)) continue;
      const hit = rel.assets.find((a) => pattern.test(a.name));
      const url = hit && safeDownloadUrl(hit.url);
      if (url) return redirect(url, "public, max-age=60, s-maxage=300");
    }
  }
  // Mos fayl yo'q (reliz hali chiqmagan / GitHub javob bermadi) — barcha relizlar sahifasi.
  return redirect(RELEASES_PAGE, "no-store");
}
