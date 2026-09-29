/**
 * In-flight request deduplication.
 *
 * When two identical requests arrive within the same serverless instance
 * (e.g. React StrictMode double-invoke, network retry, tab duplicate) the
 * second waits for the first to complete and receives the same streamed
 * response rather than firing a second upstream call.
 *
 * Key = SHA-256 of (userId + normalised last-user-message + modelId).
 * Scope = single Node.js process (serverless instance).  Redis-backed
 * cross-instance dedup is NOT done here because SSE streams cannot be
 * replayed from a store — each instance handles its own in-flight set.
 *
 * TTL = 30 s.  After that the entry is evicted whether or not it resolved,
 * preventing memory leaks on stuck connections.
 */

import { createHash } from "node:crypto";

const TTL_MS = 30_000;

interface InflightEntry {
  promise: Promise<string>;
  expiresAt: number;
}

// Module-level map — lives for the lifetime of the serverless instance.
const inflight = new Map<string, InflightEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of inflight) {
    if (v.expiresAt <= now) inflight.delete(k);
  }
}

/**
 * Build a dedup key from the request's stable identity.
 */
export function dedupKey(userId: string, lastUserText: string, modelId: string): string {
  return createHash("sha256")
    .update(`${userId}\x00${lastUserText.trim().toLowerCase().slice(0, 500)}\x00${modelId}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Attempt to join an existing in-flight request.
 *
 * @returns  The existing promise if one exists (caller should stream that
 *           result to the new request), or null if this is a fresh request.
 */
export function joinIfInflight(key: string): Promise<string> | null {
  evictExpired();
  const entry = inflight.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.promise;
  return null;
}

/**
 * Register a new in-flight request.
 *
 * @param key      Dedup key from `dedupKey()`.
 * @param execute  Async function that performs the actual work and returns
 *                 the complete response text (for caching purposes).
 *                 For streaming routes this is the full accumulated answer.
 * @returns        The same promise, so the first caller can also await it.
 */
export function registerInflight(key: string, execute: () => Promise<string>): Promise<string> {
  evictExpired();
  const promise = execute().finally(() => {
    // Clean up as soon as the work resolves/rejects.
    inflight.delete(key);
  });
  inflight.set(key, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

/**
 * Returns the number of currently active in-flight entries.
 * Useful for health-check / metrics.
 */
export function inflightCount(): number {
  evictExpired();
  return inflight.size;
}
