import { integrateVectorField3DTrajectories, integrateVectorField3DScientificTrajectories,
  type VectorField3DDocument, type VectorField3DVolumes } from "@math3d/core";

type Request = { document: VectorField3DDocument; direction: "forward" | "backward";
  scientific?: { manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes } };

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { document, direction, scientific } = event.data;
    const onProgress = (completed: number, total: number,
      trajectory: { seedId: string; stopReason: string }) =>
      self.postMessage({ progress: { completed, total, seedId: trajectory.seedId,
        stopReason: trajectory.stopReason } });
    const result = scientific ? integrateVectorField3DScientificTrajectories(document,
      scientific.manifestJson, scientific.fingerprint, scientific.volumes, { direction, onProgress }) :
      integrateVectorField3DTrajectories(document, { direction, onProgress });
    self.postMessage({ ok: true, result });
  } catch (cause) {
    self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
