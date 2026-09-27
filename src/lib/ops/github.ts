/**
 * GitHub (faqat O'QISH): yangi relizlar (desktop-v* / cli-v*) va main'dagi yangi commitlar
 * (Vercel production deploy main'dan). GITHUB_TOKEN — read-only contents; token logga chiqmaydi.
 * Repo: GITHUB_REPO (standart "isa704480/Sovereign"). fetch tashqaridan (testda soxta).
 */
import type { CommitRow, ReleaseRow } from "./feed";

const API = "https://api.github.com";

export function githubRepo(env: Record<string, string | undefined> = process.env): string {
  const r = env.GITHUB_REPO?.trim() || "isa704480/Sovereign";
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : "isa704480/Sovereign";
}

function headers(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "sovereign-ops-bot",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getJson(fetchImpl: typeof fetch, url: string, token: string | undefined): Promise<unknown> {
  const res = await fetchImpl(url, { headers: headers(token), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`github HTTP ${res.status}`);
  return res.json();
}

/** `since` dan keyin nashr etilgan relizlar (qoralama emas). Faqat desktop-v* / cli-v* teglari. */
export async function fetchReleases(
  fetchImpl: typeof fetch,
  since: number,
  env: Record<string, string | undefined> = process.env,
): Promise<ReleaseRow[]> {
  const data = await getJson(fetchImpl, `${API}/repos/${githubRepo(env)}/releases?per_page=15`, env.GITHUB_TOKEN?.trim());
  if (!Array.isArray(data)) return [];
  const out: ReleaseRow[] = [];
  for (const r of data as Record<string, unknown>[]) {
    if (r.draft === true) continue;
    const tag = typeof r.tag_name === "string" ? r.tag_name : "";
    if (!/^(desktop|cli)-v/i.test(tag)) continue;
    const at = Date.parse(String(r.published_at ?? r.created_at ?? ""));
    if (!Number.isFinite(at) || at <= since) continue;
    out.push({ tag, name: typeof r.name === "string" ? r.name : null, publishedAt: at, url: typeof r.html_url === "string" ? r.html_url : null });
  }
  return out.sort((a, b) => a.publishedAt - b.publishedAt);
}

/**
 * Fast-forward merge'da commit sanasi push vaqtidan ancha oldin bo'lishi mumkin — shuning uchun
 * `since` dan shuncha oldingi commitlar ham olinadi; takrorlanmasligini dedupe (deploy:<sha>) kafolatlaydi.
 */
export const COMMIT_GRACE_MS = 6 * 3_600_000;

/** main'dagi oxirgi commitlar (sanasi > since − 6 soat), eskisidan yangisiga, faqat sarlavha qatori. */
export async function fetchCommits(
  fetchImpl: typeof fetch,
  since: number,
  env: Record<string, string | undefined> = process.env,
): Promise<CommitRow[]> {
  const branch = (env.GITHUB_DEPLOY_BRANCH?.trim() || "main").replace(/[^\w./-]/g, "");
  const url = `${API}/repos/${githubRepo(env)}/commits?sha=${encodeURIComponent(branch)}&per_page=30`;
  const data = await getJson(fetchImpl, url, env.GITHUB_TOKEN?.trim());
  if (!Array.isArray(data)) return [];
  const out: CommitRow[] = [];
  for (const c of data as { sha?: unknown; commit?: { message?: unknown; committer?: { date?: unknown } } }[]) {
    const sha = typeof c.sha === "string" ? c.sha : "";
    const msg = typeof c.commit?.message === "string" ? c.commit.message : "";
    const at = Date.parse(String(c.commit?.committer?.date ?? ""));
    if (!sha || !Number.isFinite(at) || at <= since - COMMIT_GRACE_MS) continue;
    out.push({ sha, subject: msg.split("\n")[0].slice(0, 200), at });
  }
  return out.sort((a, b) => a.at - b.at);
}
