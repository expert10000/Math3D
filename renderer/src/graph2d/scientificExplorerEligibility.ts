import type { ScientificSceneDataset, ScientificSceneManifest } from "@math3d/core";

/** Explain exactly which manifest datasets can become 3D Field Explorer sources. */
export function scientificExplorerEligibility(manifest: ScientificSceneManifest,
  dataset: ScientificSceneDataset): { ready: boolean; reason: string; timeUnit: string | null } {
  if (dataset.shape.length !== 3)
    return { ready: false, reason: "Requires three spatial axes.", timeUnit: null };
  if (dataset.semanticType !== "vector-field" || dataset.components?.length !== 3)
    return { ready: false, reason: "Explorer requires three vector components.", timeUnit: null };
  if (dataset.shape.some(size => size < 2))
    return { ready: false, reason: "Each grid axis needs at least two samples.", timeUnit: null };
  const coordinate = manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
  if (!coordinate || coordinate.kind !== "cartesian" || coordinate.axes.length !== 3)
    return { ready: false, reason: "Explorer requires a regular 3D Cartesian grid.", timeUnit: null };
  const timeUnits = coordinate.axes.map(axis => dataset.quantity.unit.startsWith(`${axis.unit}/`) ?
    dataset.quantity.unit.slice(axis.unit.length + 1) : "");
  if (!timeUnits[0] || new Set(timeUnits).size !== 1)
    return { ready: false, reason: "Velocity units must match all spatial axes and one time unit.", timeUnit: null };
  return { ready: true, reason: "Ready for Field Explorer", timeUnit: timeUnits[0] };
}
