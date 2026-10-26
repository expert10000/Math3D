import { searchVectorField3DEquilibria, searchVectorField3DVerifiedTileEquilibria,
  VectorField3DEquilibriumNeedsTiles, VectorField3DVerifiedTileCache,
  type VectorField3DEquilibriumContinuation,
  type VectorField3DDocument, type VectorField3DVerifiedTile,
  type VectorField3DVolumes } from "@math3d/core";

type Request = { document: VectorField3DDocument;
  scientific?: { manifestJson: string; fingerprint: string; volumes?: VectorField3DVolumes;
    tileMode?: boolean } } | { tilesResponse: VectorField3DVerifiedTile[] };
let tileCache: VectorField3DVerifiedTileCache | null = null;
let tileRun: (() => void) | null = null;
let continuation: VectorField3DEquilibriumContinuation | undefined;
let tileBatchRequests = 0, completedSeedsKept = 0;
let prefetchQueue: (readonly [number, number, number])[] | null = null;
let prefetchedTiles = 0;
const requestPrefetch = () => {
  if (!prefetchQueue) return;
  if (!prefetchQueue.length) { prefetchQueue = null; tileRun?.(); return; }
  self.postMessage({ tileRequests: { indices: prefetchQueue.splice(0, 32) } });
};
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    if ("tilesResponse" in event.data) {
      if (!tileCache || !tileRun) throw new Error("Unexpected verified tile response.");
      event.data.tilesResponse.forEach(tile => tileCache!.add(tile));
      tileBatchRequests++;
      if (prefetchQueue) {
        prefetchedTiles += event.data.tilesResponse.length;
        requestPrefetch();
      } else tileRun();
      return;
    }
    const document = event.data.document;
    if (event.data.scientific?.tileMode) {
      tileCache = new VectorField3DVerifiedTileCache(document,
        event.data.scientific.manifestJson, event.data.scientific.fingerprint);
      tileRun = () => {
        try {
          const result = searchVectorField3DVerifiedTileEquilibria(document, tileCache!, {}, continuation);
          self.postMessage({ ok: true, result: { ...result, verifiedTiles: tileCache!.provenance,
            residentTileBytes: tileCache!.residentBytes, tileBatchRequests,
            completedSeedsKept, prefetchedTiles } });
        } catch (cause) {
          if (cause instanceof VectorField3DEquilibriumNeedsTiles) {
            continuation = cause.continuation;
            completedSeedsKept = Math.max(completedSeedsKept, continuation.nextSeedIndex);
            self.postMessage({ tileRequests: { indices: cause.indicesBatch } });
          }
          else throw cause;
        }
      };
      const plan = tileCache.equilibriumPrefetchPlan(document);
      if (plan) { prefetchQueue = [...plan]; requestPrefetch(); }
      else tileRun();
      return;
    }
    self.postMessage({ ok: true, result: searchVectorField3DEquilibria(event.data.document,
      event.data.scientific?.volumes ? { ...event.data.scientific,
        volumes: event.data.scientific.volumes } : undefined) });
  } catch (cause) {
    self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
