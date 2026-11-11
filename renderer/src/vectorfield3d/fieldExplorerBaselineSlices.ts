import { defaultVectorField3DWorkspace, sampleVectorField3DSlice,
  sampleVectorField3DDerivedSlice, type VectorField3DComparisonTransfers, type VectorField3DDocument } from "@math3d/core";

/** Native slices require matching physical lattices and freshly verified bundle transfers. */
export function fieldExplorerBaselineSlices(document: VectorField3DDocument,
  baseline: VectorField3DDocument, transfers: VectorField3DComparisonTransfers = {}) {
  if (document.source.field.kind !== baseline.source.field.kind)
    throw new TypeError("Linked A/B views require matching source kinds and sample lattices.");
  const units = (source: VectorField3DDocument) => source.source.field.kind === "expressions" ?
    source.source.field.components.map(component => component.unit) : source.source.field.componentUnits;
  if (new Set(units(document)).size !== 1 ||
      document.source.axes.some((axis, i) => axis.min !== baseline.source.axes[i]!.min ||
      axis.max !== baseline.source.axes[i]!.max || axis.unit !== baseline.source.axes[i]!.unit ||
      axis.label !== baseline.source.axes[i]!.label) ||
      units(document).some((unit, i) => unit !== units(baseline)[i]))
    throw new TypeError("Linked A/B views require identical Cartesian domains and homogeneous component units.");
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const normal = view.selectedLayer === "xz" ? 1 : view.selectedLayer === "yz" ? 0 : 2;
  const coordinate = view.sliceCoordinates[normal];
  const colorBy = document.source.display.colorBy;
  const sample = (source: VectorField3DDocument, transfer: VectorField3DComparisonTransfers["a"]) => {
    if (view.sliceChannel !== "component")
      return sampleVectorField3DDerivedSlice(source, normal, coordinate, view.sliceChannel, transfer);
    const base = sampleVectorField3DSlice(source, normal, coordinate, transfer);
    // Both maps display A's requested channel. Reuse the native plane vectors without
    // modifying B's source or forging a revised document identity for display changes.
    if (!base.vectors) throw new TypeError("The sampled plane has no vector values.");
    const component = ["p", "q", "r"].indexOf(colorBy);
    const values = base.vectors.map(vector => vector === null ? null :
      colorBy === "speed" ? Math.hypot(...vector) : vector[component]!);
    const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return { ...base, values, channel: colorBy === "speed" ? "magnitude" as const : colorBy,
      min: Math.min(...finite), max: Math.max(...finite) };
  };
  const a = sample(document, transfers.a), b = sample(baseline, transfers.b);
  if (JSON.stringify(a.coordinates) !== JSON.stringify(b.coordinates))
    throw new TypeError("Linked A/B views require matching sample lattices. Use physical overlap comparison for cross-grid metrics.");
  if (!Number.isFinite(a.min + a.max + b.min + b.max))
    throw new TypeError("This plane has no finite samples to compare.");
  return { a, b, range: { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) } };
}
