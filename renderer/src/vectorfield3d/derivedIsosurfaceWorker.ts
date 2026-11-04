import { extractProjectDerivedScalarIsosurface, parseMath3DProject,
  type VectorField3DClipBounds } from "@math3d/core";

self.onmessage = (event: MessageEvent<{ projectJson: string; derivedId: string;
  clipBounds: VectorField3DClipBounds; level: number;
  triangleBudget: number; timeBudgetMs: number }>) => {
  try {
    const input = event.data;
    const surface = extractProjectDerivedScalarIsosurface(
      parseMath3DProject(input.projectJson), input.derivedId, input.clipBounds,
      input.level, input.triangleBudget, input.timeBudgetMs);
    self.postMessage({ ok: true, surface },
      [surface.positions.buffer, surface.normals.buffer, surface.indices.buffer]);
  } catch (cause) {
    self.postMessage({ ok: false, error: String((cause as Error).message ?? cause) });
  }
};
