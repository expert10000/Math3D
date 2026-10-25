import { searchVectorField3DEquilibria, type VectorField3DDocument,
  type VectorField3DVolumes } from "@math3d/core";

type Request = { document: VectorField3DDocument;
  scientific?: { manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes } };
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    self.postMessage({ ok: true, result: searchVectorField3DEquilibria(event.data.document,
      event.data.scientific) });
  } catch (cause) {
    self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
