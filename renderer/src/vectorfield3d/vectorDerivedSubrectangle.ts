import { vectorDerivedSubrectangleSelection,
  type CombinedRegionStatistics, type VectorDerivedSubrectangleSummary,
  type VectorField3DOverlayRegion } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";

type Speed = Awaited<ReturnType<typeof verifiedVectorRegionProfile>>;
type Derived = Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;

/** Reduce only the selected cells of the verified parent 17×17 lattice. */
export function summarizeVectorDerivedSubrectangle(region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  speed: Speed, derived: Derived): VectorDerivedSubrectangleSummary {
  const selected = vectorDerivedSubrectangleSelection(region, bounds);
  const statistics = (cells: readonly (number | null)[]): CombinedRegionStatistics => {
    if (cells.length !== 289)
      throw new TypeError("The verified vector region lattice is incomplete.");
    const values: number[] = [];
    for (let i = selected.columns[0]; i <= selected.columns[1]; i++)
      for (let j = selected.rows[0]; j <= selected.rows[1]; j++) {
        const value = cells[i * 17 + j];
        if (value !== null && value !== undefined && Number.isFinite(value))
          values.push(value);
      }
    return { count: values.length, gaps: selected.sampleCount - values.length,
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) /
        values.length : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null };
  };
  return { sampleCount: selected.sampleCount, vector: statistics(speed.cells),
    divergence: statistics(derived.divergence.cells),
    curlMagnitude: statistics(derived.curlMagnitude.cells),
    vectorUnit: speed.unit, divergenceUnit: derived.divergence.unit,
    curlMagnitudeUnit: derived.curlMagnitude.unit };
}
