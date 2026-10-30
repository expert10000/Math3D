import { vectorDerivedSubrectangleSelection,
  type CombinedRegionStatistics, type CombinedSubrectangleSummary,
  type VectorField3DOverlayRegion } from "@math3d/core";

export type CombinedSubrectangleCells = Readonly<{
  vector: readonly (number | null)[]; scalar: readonly (number | null)[];
  complexMagnitude: readonly (number | null)[];
  complexPhase: readonly (number | null)[];
  divergence: readonly (number | null)[];
  curlMagnitude: readonly (number | null)[];
}>;
export type CombinedSubrectangleUnits = Pick<CombinedSubrectangleSummary,
  "vectorUnit" | "scalarUnit" | "complexUnit" | "divergenceUnit" |
  "curlMagnitudeUnit">;

/** Reduce the same physical 17×17 cells for all six independently sampled fields. */
export function summarizeCombinedSubrectangle(region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  cells: CombinedSubrectangleCells,
  units: CombinedSubrectangleUnits): CombinedSubrectangleSummary {
  const selected = vectorDerivedSubrectangleSelection(region, bounds);
  const statistics = (field: readonly (number | null)[], phase = false):
    CombinedRegionStatistics => {
    if (field.length !== 289)
      throw new TypeError("The verified combined region lattice is incomplete.");
    const values: number[] = [];
    for (let i = selected.columns[0]; i <= selected.columns[1]; i++)
      for (let j = selected.rows[0]; j <= selected.rows[1]; j++) {
        const value = field[i * 17 + j];
        if (value !== null && value !== undefined && Number.isFinite(value))
          values.push(value);
      }
    let mean: number | null = values.length ?
      values.reduce((sum, value) => sum + value, 0) / values.length : null;
    if (phase && values.length) {
      const sine = values.reduce((sum, value) => sum + Math.sin(value), 0);
      const cosine = values.reduce((sum, value) => sum + Math.cos(value), 0);
      mean = Math.hypot(sine, cosine) / values.length < 1e-12 ? null :
        Math.atan2(sine, cosine);
    }
    return { count: values.length, gaps: selected.sampleCount - values.length,
      mean, min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null };
  };
  return { sampleCount: selected.sampleCount,
    vector: statistics(cells.vector), scalar: statistics(cells.scalar),
    complexMagnitude: statistics(cells.complexMagnitude),
    complexPhase: statistics(cells.complexPhase, true),
    divergence: statistics(cells.divergence),
    curlMagnitude: statistics(cells.curlMagnitude), ...units };
}
