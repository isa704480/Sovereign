/**
 * Context trimming — sliding window + rolling summarisation.
 *
 * Problem: long conversation histories balloon input tokens and latency.
 * Strategy:
 *  1. Keep the most recent `WINDOW` message pairs intact (user+assistant).
 *  2. If the total history exceeds `MAX_CHARS`, summarise the oldest pairs
 *     outside the window using a cheap model and replace them with a single
 *     system-level "SUMMARY" message.
 *  3. The summary itself is capped at `SUMMARY_MAX_CHARS` so it doesn't
 *     snowball over successive turns.
 *
 * Configuration (env vars):
 *   CONTEXT_WINDOW_PAIRS     — pairs to keep verbatim (default 6)
 *   CONTEXT_MAX_CHARS        — total chars before trimming kicks in (default 12 000)
 *   CONTEXT_SUMMARY_MAX_CHARS — max chars in the rolling summary injection (default 1 200)
 *
 * This module is PURE with respect to network: the summarisation call is
 * injected via a `summarise` callback so the caller controls which model/key
 * to use.  If summarisation fails the function returns the original messages
 * unchanged (fail-open — never breaks the chat).
 */

export interface TrimMessage {
  role: "user" | "assistant" | "system";
  content: string | unknown[];
}

function textOf(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return (content as { type?: string; text?: string }[])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ");
}

function envInt(key: string, def: number): number {
  const v = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function windowPairs(): number {
  return envInt("CONTEXT_WINDOW_PAIRS", 6);
}
function maxChars(): number {
  return envInt("CONTEXT_MAX_CHARS", 12_000);
}
function summaryMaxChars(): number {
  return envInt("CONTEXT_SUMMARY_MAX_CHARS", 1_200);
}

/**
 * Total character count of a message list.
 * Images count as 6 000 chars each (≈1 500 tokens, same heuristic as chat route).
 */
function totalChars(msgs: TrimMessage[]): number {
  return msgs.reduce((n, m) => {
    if (typeof m.content === "string") return n + m.content.length;
    const parts = m.content as { type?: string }[];
    const textLen = parts.filter((p) => p.type === "text").reduce((s, p) => s + ((p as { text?: string }).text?.length ?? 0), 0);
    const images = parts.filter((p) => p.type === "image_url").length;
    return n + textLen + images * 6_000;
  }, 0);
}

export interface TrimResult {
  messages: TrimMessage[];
  /** true when messages were actually shortened */
  trimmed: boolean;
  /** number of message pairs that were summarised and removed */
  summarisedPairs: number;
}

/**
 * Trim `messages` to fit within the configured limits.
 *
 * @param messages   Full conversation history (role:system messages are passed through unchanged).
 * @param summarise  Optional async callback that summarises a block of text; return null to skip.
 */
export async function trimContext(
  messages: TrimMessage[],
  summarise?: (text: string) => Promise<string | null>,
): Promise<TrimResult> {
  // Strip injected system messages — they are rebuilt each request.
  const history = messages.filter((m) => m.role !== "system");
  const systemMsgs = messages.filter((m) => m.role === "system");

  if (totalChars(history) <= maxChars()) {
    return { messages, trimmed: false, summarisedPairs: 0 };
  }

  const window = windowPairs();

  // Pair up user+assistant exchanges (oldest first).
  const pairs: TrimMessage[][] = [];
  const unpaired: TrimMessage[] = [];
  let i = 0;
  while (i < history.length) {
    if (history[i].role === "user" && i + 1 < history.length && history[i + 1].role === "assistant") {
      pairs.push([history[i], history[i + 1]]);
      i += 2;
    } else {
      unpaired.push(history[i]);
      i++;
    }
  }

  // Keep the most recent `window` pairs verbatim.
  const keepPairs = pairs.slice(-window);
  const oldPairs = pairs.slice(0, pairs.length - window);

  if (oldPairs.length === 0) {
    // Nothing to summarise yet — just rebuild as-is.
    return { messages, trimmed: false, summarisedPairs: 0 };
  }

  // Build text to summarise from old pairs.
  const oldText = oldPairs
    .map((p) => `User: ${textOf(p[0].content)}\nAssistant: ${textOf(p[1].content)}`)
    .join("\n\n");

  let summaryText: string | null = null;
  try {
    if (summarise) {
      summaryText = await summarise(oldText.slice(0, 8_000));
    }
  } catch {
    // Summarisation failed — fall back to no trim.
    return { messages, trimmed: false, summarisedPairs: 0 };
  }

  const summaryMsg: TrimMessage | null = summaryText
    ? {
        role: "system" as const,
        content: `[CONVERSATION SUMMARY — ${oldPairs.length} earlier exchanges]\n${summaryText.slice(0, summaryMaxChars())}`,
      }
    : null;

  const trimmed: TrimMessage[] = [
    ...systemMsgs,
    ...(summaryMsg ? [summaryMsg] : []),
    ...keepPairs.flat(),
    ...unpaired,
  ];

  return { messages: trimmed, trimmed: true, summarisedPairs: oldPairs.length };
}

/**
 * Convenience: build the summarisation prompt and call a cheap completion endpoint.
 * Returns a summarise() callback suitable for trimContext().
 *
 * @param callCheapModel  Function that sends a prompt to a cheap model and returns the text.
 */
export function makeSummariser(callCheapModel: (prompt: string) => Promise<string | null>) {
  return async (text: string): Promise<string | null> => {
    const prompt = [
      "Summarise the following conversation excerpt in 3-5 concise sentences.",
      "Preserve key facts, decisions, and context the user mentioned.",
      "Write in third person. Be terse.\n\n",
      text,
    ].join("");
    return callCheapModel(prompt);
  };
}
