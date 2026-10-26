import { structuralHash } from "./documentIdentity";

export type ScientificDerivedCacheBinding = Readonly<{
  documentId: string; revision: number; documentHash: string; sourceHash: string;
}>;

/** Bounded, session-only results. Callers must verify source bytes before looking up a result. */
export class ScientificDerivedResultCache {
  private readonly entries = new Map<string, { documentId: string; value: unknown }>();
  private readonly generations = new Map<string, string>();
  private readonly maxEntries: number;

  constructor(maxEntries = 32) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 256)
      throw new RangeError("Scientific derived cache capacity must be between 1 and 256.");
    this.maxEntries = maxEntries;
  }

  get size(): number { return this.entries.size; }

  invalidateDocument(documentId: string): void {
    for (const [key, entry] of this.entries)
      if (entry.documentId === documentId) this.entries.delete(key);
    this.generations.delete(documentId);
  }

  getOrCompute<T>(binding: ScientificDerivedCacheBinding, recipe: unknown,
    verifiedTransferHash: string, compute: () => T): T {
    if (!binding.documentId || !Number.isSafeInteger(binding.revision) ||
      !/^sha256:[a-f0-9]{64}$/.test(binding.documentHash) ||
      !/^sha256:[a-f0-9]{64}$/.test(binding.sourceHash) ||
      !/^sha256:[a-f0-9]{64}$/.test(verifiedTransferHash))
      throw new TypeError("Scientific cache needs a current document and verified transfer identity.");
    const generation = structuralHash(binding);
    if (this.generations.get(binding.documentId) !== generation) {
      this.invalidateDocument(binding.documentId);
      this.generations.set(binding.documentId, generation);
    }
    const key = structuralHash({ binding, recipe, verifiedTransferHash });
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value as T;
    }
    const value = compute();
    this.entries.set(key, { documentId: binding.documentId, value });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value!;
      const oldest = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      if (![...this.entries.values()].some(entry => entry.documentId === oldest.documentId))
        this.generations.delete(oldest.documentId);
    }
    return value;
  }
}
