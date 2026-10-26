import { integrateVectorField3DTrajectories, integrateVectorField3DScientificTrajectories,
  integrateVectorField3DVerifiedTileTrajectories, VectorField3DNeededTile,
  VectorField3DVerifiedTileCache, type VectorField3DVerifiedTile,
  type VectorField3DDocument, type VectorField3DVolumes } from "@math3d/core";

type Request = { document: VectorField3DDocument; direction: "forward" | "backward";
  scientific?: { manifestJson: string; fingerprint: string; volumes?: VectorField3DVolumes;
    tileMode?: boolean } } | { tileResponse: VectorField3DVerifiedTile };

let tileRun: (() => void) | null = null;
let tileCache: VectorField3DVerifiedTileCache | null = null;

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    if ("tileResponse" in event.data) {
      if (!tileCache || !tileRun) throw new Error("Unexpected verified tile response.");
      tileCache.add(event.data.tileResponse); tileRun(); return;
    }
    const { document, direction, scientific } = event.data;
    const onProgress = (completed: number, total: number,
      trajectory: { seedId: string; stopReason: string }) =>
      self.postMessage({ progress: { completed, total, seedId: trajectory.seedId,
        stopReason: trajectory.stopReason } });
    if (scientific?.tileMode) {
      tileCache = new VectorField3DVerifiedTileCache(document, scientific.manifestJson,
        scientific.fingerprint);
      tileRun = () => {
        try {
          const result = integrateVectorField3DVerifiedTileTrajectories(document,
            tileCache!, { direction });
          self.postMessage({ ok: true, result: { ...result, sourceHash: tileCache!.sourceHash,
            verifiedTiles: tileCache!.provenance, residentTileBytes: tileCache!.residentBytes } });
        } catch (cause) {
          if (cause instanceof VectorField3DNeededTile)
            self.postMessage({ tileRequest: { indices: cause.indices } });
          else throw cause;
        }
      };
      tileRun(); return;
    }
    const result = scientific?.volumes ? integrateVectorField3DScientificTrajectories(document,
      scientific.manifestJson, scientific.fingerprint, scientific.volumes, { direction, onProgress }) :
      integrateVectorField3DTrajectories(document, { direction, onProgress });
    self.postMessage({ ok: true, result });
  } catch (cause) {
    self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
