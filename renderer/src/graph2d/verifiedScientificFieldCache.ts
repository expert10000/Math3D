import { ScientificDerivedResultCache, scientificFieldResultBinding,
  type ScientificFieldDocument } from "@math3d/core";

const cache = new ScientificDerivedResultCache(48);

export function invalidateVerifiedScientificFieldResults(documentId: string): void {
  cache.invalidateDocument(documentId);
}

/** The caller must verify the transferred bytes before entering this cache. */
export function cacheVerifiedScientificFieldResult<T>(document: ScientificFieldDocument,
  recipe: unknown, verifiedTransferHash: string, compute: () => T): T {
  const field = scientificFieldResultBinding(document);
  return cache.getOrCompute({ documentId: field.id, revision: field.revision,
    documentHash: field.structuralHash, sourceHash: field.sourceHash },
  recipe, verifiedTransferHash, compute);
}
