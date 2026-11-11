import { defaultVectorField3DWorkspace, sampleVectorField3DSlice,
  sampleVectorField3DDerivedSlice, type VectorField3DDocument } from "@math3d/core";

/** Direct analytic slices only. Bundle comparisons keep the native verified-transfer path. */
export function fieldExplorerBaselineSlices(document: VectorField3DDocument,
  baseline: VectorField3DDocument) {
  if (document.source.field.kind !== "expressions" || baseline.source.field.kind !== "expressions")
    throw new TypeError("Linked A/B slice views currently require analytic fields. Use verified field comparison for scientific bundles.");
  if (new Set(document.source.field.components.map(component => component.unit)).size !== 1 ||
      document.source.axes.some((axis, i) => axis.min !== baseline.source.axes[i]!.min ||
      axis.max !== baseline.source.axes[i]!.max || axis.unit !== baseline.source.axes[i]!.unit ||
      axis.label !== baseline.source.axes[i]!.label) ||
      document.source.field.components.some((component, i) =>
        component.unit !== (baseline.source.field as typeof document.source.field).components[i]!.unit))
    throw new TypeError("Linked A/B views require identical Cartesian domains and homogeneous component units.");
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const normal = view.selectedLayer === "xz" ? 1 : view.selectedLayer === "yz" ? 0 : 2;
  const coordinate = view.sliceCoordinates[normal];
  const colorBy = document.source.display.colorBy;
  const sample = (source: VectorField3DDocument) => {
    if (view.sliceChannel !== "component")
      return sampleVectorField3DDerivedSlice(source, normal, coordinate, view.sliceChannel);
    const base = sampleVectorField3DSlice(source, normal, coordinate);
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
  const a = sample(document), b = sample(baseline);
  if (!Number.isFinite(a.min + a.max + b.min + b.max))
    throw new TypeError("This plane has no finite samples to compare.");
  return { a, b, range: { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) } };
}
