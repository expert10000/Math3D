import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";
import type { VectorField3DDocument } from "./vectorField3DDocument";

export type VerifiedVectorFieldTransfer = Readonly<{
  manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes;
}>;

/** Interpolate only values in a freshly checked, bounded transfer lattice. */
export function verifiedVectorFieldSampler(document: VectorField3DDocument,
  transfer: VerifiedVectorFieldTransfer) {
  const volumes = verifyVectorField3DVolumes(document, transfer.manifestJson,
    transfer.fingerprint, transfer.volumes);
  const field = document.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific vector source.");
  if (new Set(field.componentUnits).size !== 1)
    throw new TypeError("Vector magnitude requires identical component units.");
  const shape = volumes[0].sampleShape;
  const axes = field.references[0].axes.map((axis, index) =>
    Array.from({ length: shape[index] }, (_, sample) => {
      const sourceIndex = Math.round(sample * (volumes[0].sourceShape[index]! - 1) /
        (shape[index]! - 1));
      return axis.origin + sourceIndex * axis.spacing;
    }));
  const sample = (point: readonly [number, number, number]): readonly [number, number, number] | null => {
    if (point.some((value, axis) => !Number.isFinite(value) ||
      value < axes[axis]![0]! || value > axes[axis]!.at(-1)!)) return null;
    const corners = axes.map((coordinates, axis) => {
      const upper = coordinates.findIndex(value => value >= point[axis]!);
      if (upper < 0) return null;
      const lower = Math.max(0, upper - 1);
      const fraction = upper === lower ? 0 : (point[axis]! - coordinates[lower]!) /
        (coordinates[upper]! - coordinates[lower]!);
      return { lower, upper, fraction };
    });
    if (corners.some(value => value === null)) return null;
    const valueAt = (component: number) => {
      let value = 0;
      for (let mask = 0; mask < 8; mask++) {
        let weight = 1;
        const indices = corners.map((corner, axis) => {
          const high = (mask >> axis) & 1;
          weight *= high ? corner!.fraction : 1 - corner!.fraction;
          return high ? corner!.upper : corner!.lower;
        });
        if (weight === 0) continue;
        const offset = (indices[0]! * shape[1]! + indices[1]!) * shape[2]! + indices[2]!;
        const sample = volumes[component].values[offset];
        if (!Number.isFinite(sample)) return null;
        value += weight * sample!;
      }
      return Number.isFinite(value) ? value : null;
    };
    const vector = [valueAt(0), valueAt(1), valueAt(2)];
    return vector.every(value => value !== null) ? vector as [number, number, number] : null;
  };
  return { sample, shape, unit: field.componentUnits[0] };
}
