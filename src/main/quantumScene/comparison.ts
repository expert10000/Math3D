import type { ImportedQuantumScene } from "./importer";

export type QuantumComparison = Readonly<{
  status: "compatible" | "incompatible";
  reasons: string[];
  warnings: string[];
  metadataDiffs: { key: string; a: string | number | null; b: string | number | null }[];
  convergence: { quantity: "bulk gap"; gridA: [number, number]; gridB: [number, number];
    absoluteChange: number; status: "two-resolution-indicator" } | null;
  quantity: string | null;
  unit: string | null;
  samples: number;
  meanAbsolute: number | null;
  rootMeanSquare: number | null;
  maximumAbsolute: number | null;
  bulkGapDelta: number | null;
}>;

/** Both inputs must come from independently verified, fingerprint-pinned bundles. */
export function compareVerifiedQuantumScenes(a: ImportedQuantumScene, b: ImportedQuantumScene): QuantumComparison {
  const sa = a.source, sb = b.source;
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (sa.provenance.model !== sb.provenance.model) reasons.push("Model differs.");
  if (JSON.stringify(sa.coordinates) !== JSON.stringify(sb.coordinates)) reasons.push("Coordinate axes or units differ.");
  const pa = sa.provenance.parameters ?? {}, pb = sb.provenance.parameters ?? {};
  const metadataDiffs = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort()
    .filter(key => pa[key] !== pb[key]).map(key => ({ key, a: pa[key] ?? null, b: pb[key] ?? null }));
  if (metadataDiffs.length) warnings.push("Model parameters differ; residuals compare different parameterizations.");
  const convergence = sa.bands?.grid && sb.bands?.grid && sa.provenance.model === sb.provenance.model &&
    sa.bands.energyUnit === sb.bands.energyUnit && JSON.stringify(sa.coordinates) === JSON.stringify(sb.coordinates) &&
    JSON.stringify(sa.bands.grid) !== JSON.stringify(sb.bands.grid) ?
    { quantity: "bulk gap" as const, gridA: sa.bands.grid, gridB: sb.bands.grid,
      absoluteChange: Math.abs(sb.bands.bulkGap - sa.bands.bulkGap), status: "two-resolution-indicator" as const } : null;
  if (convergence) warnings.push("A two-resolution bulk-gap change is shown; asymptotic convergence is not established.");
  let quantity: string | null = null, unit: string | null = null;
  let va: number[] | null = null, vb: number[] | null = null;
  if (sa.bands && sb.bands) {
    const aa = sa.bands, bb = sb.bands;
    if (aa.kind !== bb.kind || JSON.stringify(aa.grid) !== JSON.stringify(bb.grid) ||
        aa.energies.length !== bb.energies.length || JSON.stringify(aa.labels) !== JSON.stringify(bb.labels))
      reasons.push("Band shape or identity differs.");
    if (aa.energyUnit !== bb.energyUnit) reasons.push("Band energy units differ.");
    const ca = a.arrays.get(aa.coordinates), cb = b.arrays.get(bb.coordinates);
    if (!ca || !cb || ca.length !== cb.length || ca.some((value, i) => Math.abs(value - cb[i]) > 1e-10))
      reasons.push("Band coordinate grids do not align exactly.");
    if (!reasons.length) {
      quantity = "band energy"; unit = aa.energyUnit;
      va = aa.energies.flatMap(id => [...a.arrays.get(id)!]);
      vb = bb.energies.flatMap(id => [...b.arrays.get(id)!]);
    }
  } else if (sa.fields?.length === 1 && sb.fields?.length === 1) {
    const fa = sa.fields[0], fb = sb.fields[0];
    if (JSON.stringify(fa.grid) !== JSON.stringify(fb.grid)) reasons.push("Field grids do not align exactly.");
    const da = sa.datasets.find(item => item.id === fa.real), db = sb.datasets.find(item => item.id === fb.real);
    if (!da || !db || da.unit !== db.unit) reasons.push("Field amplitude units differ.");
    const ia = fa.imaginary ? sa.datasets.find(item => item.id === fa.imaginary) : null;
    const ib = fb.imaginary ? sb.datasets.find(item => item.id === fb.imaginary) : null;
    if (fa.kind === "complex-field" && (!ia || !ib || ia.unit !== da?.unit || ib.unit !== db?.unit))
      reasons.push("Complex field components have inconsistent units.");
    if (fa.kind !== fb.kind) reasons.push("Field kinds differ.");
    if (!reasons.length) {
      quantity = fa.kind === "complex-field" ? "probability density" : "scalar field";
      unit = fa.kind === "complex-field" ? `${da!.unit}²` : da!.unit;
      const ar = a.arrays.get(fa.real)!, br = b.arrays.get(fb.real)!;
      const ai = fa.imaginary ? a.arrays.get(fa.imaginary)! : null;
      const bi = fb.imaginary ? b.arrays.get(fb.imaginary)! : null;
      va = [...ar].map((value, i) => ai ? value * value + ai[i] * ai[i] : value);
      vb = [...br].map((value, i) => bi ? value * value + bi[i] * bi[i] : value);
    }
  } else reasons.push("No matching supported band or field quantity exists.");
  if (va && vb && va.length !== vb.length) reasons.push("Aligned quantity sample counts differ.");
  if (reasons.length || !va || !vb) return { status: "incompatible", reasons, warnings, metadataDiffs, convergence,
    quantity: null, unit: null, samples: 0, meanAbsolute: null, rootMeanSquare: null,
    maximumAbsolute: null, bulkGapDelta: null };
  let abs = 0, square = 0, max = 0;
  for (let i = 0; i < va.length; i++) { const delta = va[i] - vb[i], magnitude = Math.abs(delta);
    abs += magnitude; square += delta * delta; max = Math.max(max, magnitude); }
  return { status: "compatible", reasons: [], warnings, metadataDiffs, convergence, quantity, unit, samples: va.length,
    meanAbsolute: abs / va.length, rootMeanSquare: Math.sqrt(square / va.length), maximumAbsolute: max,
    bulkGapDelta: sa.bands && sb.bands ? sb.bands.bulkGap - sa.bands.bulkGap : null };
}
