import { structuralHash, type VectorField3DArrowArtifact,
  type VectorField3DAxis } from "@math3d/core";

export type VectorField3DPreviewDetail = "overview" | "full";
const OVERVIEW_GLYPH_BUDGET = 192;

/** A display-only selection from an already evaluated and, for bundles, verified artifact. */
export function selectVectorField3DPreview(artifact: VectorField3DArrowArtifact,
  axes: readonly VectorField3DAxis[], requested: VectorField3DPreviewDetail) {
  const full = requested === "full" || artifact.arrows.length <= OVERVIEW_GLYPH_BUDGET;
  const indices: number[] = [];
  if (full) {
    for (let index = 0; index < artifact.arrows.length; index++) indices.push(index);
  } else {
    const shape = [...artifact.density];
    while (shape[0]! * shape[1]! * shape[2]! > OVERVIEW_GLYPH_BUDGET) {
      const axis = shape.indexOf(Math.max(...shape));
      shape[axis] = shape[axis]! - 1;
    }
    const cells = new Map<number, { index: number; distance: number }>();
    artifact.arrows.forEach((arrow, index) => {
      const location = arrow.position.map((value, axis) => Math.max(0, Math.min(1,
        (value - axes[axis]!.min) / (axes[axis]!.max - axes[axis]!.min))));
      const cell = location.map((value, axis) => Math.min(shape[axis]! - 1,
        Math.floor(value * shape[axis]!)));
      const key = (cell[0]! * shape[1]! + cell[1]!) * shape[2]! + cell[2]!;
      const distance = location.reduce((sum, value, axis) => sum +
        (value - (cell[axis]! + 0.5) / shape[axis]!) ** 2, 0);
      const previous = cells.get(key);
      if (!previous || distance < previous.distance) cells.set(key, { index, distance });
    });
    indices.push(...[...cells.values()].map(item => item.index).sort((a, b) => a - b));
  }
  const detail = full ? "full" : "overview";
  return { detail, arrows: indices.map(index => artifact.arrows[index]!),
    count: indices.length, selectionHash: structuralHash({
      source: artifact.source, verifiedSamples: artifact.verifiedSamples,
      density: artifact.density, detail, indices,
    }) } as const;
}
