import { canonicalJsonStringify } from "./documentIdentity";
import type { ValidationResult } from "./validation";

/**
 * Reuse successful validation only for identical canonical content, never identity/hash claims.
 * Strings are immutable; each hit returns a fresh value, so neither input nor returned-object
 * mutation can poison later reads. The caller's pure normalizer remains the authority on misses.
 * Raw resource bytes and provenance checks are deliberately outside this cache.
 */
export function createCanonicalNormalizationCache<T>(
  normalize: (value: unknown) => ValidationResult<T>,
  maxRetainedChars = 4 * 1024 * 1024,
  maxEntries = 4,
): (value: unknown) => ValidationResult<T> {
  const snapshots = new Map<string, string>();
  let retainedChars = 0;
  return (value) => {
    let key: string;
    try { key = canonicalJsonStringify(value); }
    catch { return normalize(value); }
    const hit = snapshots.get(key);
    if (hit !== undefined) {
      snapshots.delete(key);
      snapshots.set(key, hit);
      return { ok: true, value: JSON.parse(hit) as T };
    }
    const result = normalize(value);
    if (!result.ok) return result;
    // Cache only self-contained canonical successes; never change validation behavior.
    let snapshot: string;
    try { snapshot = canonicalJsonStringify(result.value); }
    catch { return result; }
    const cost = key.length + snapshot.length;
    if (cost > maxRetainedChars || maxEntries < 1) return result;
    while (snapshots.size && (snapshots.size >= maxEntries || retainedChars + cost > maxRetainedChars)) {
      const oldest = snapshots.keys().next().value!;
      retainedChars -= oldest.length + snapshots.get(oldest)!.length;
      snapshots.delete(oldest);
    }
    snapshots.set(key, snapshot);
    retainedChars += cost;
    return result;
  };
}
