import type { CurveDifferentialField } from "@math3d/core";

export type CurveScalarPlotKey = "speed" | "curvature" | "signed-curvature" | "torsion" | "sampling-error";
export type CurveScalarPlotDomain = "parameter" | "arc-length";
export type CurveScalarPlotRow = {
  key: CurveScalarPlotKey;
  label: string;
  unit: string;
  values: Array<{ t: number; u: number; s: number; x: number; value: number | null }>;
};

export const buildCurveScalarPlots = (
  field: CurveDifferentialField,
  domain: CurveScalarPlotDomain,
  samplingErrors: readonly number[] = []
): CurveScalarPlotRow[] => {
  const xFor = (point: CurveDifferentialField["points"][number]) => domain === "parameter" ? point.t : point.normalizedArcLength;
  const row = (key: CurveScalarPlotKey, label: string, unit: string, valueFor: (point: CurveDifferentialField["points"][number], index: number) => number | null): CurveScalarPlotRow => ({
    key,
    label,
    unit,
    values: field.points.map((point, index) => ({ t: point.t, u: point.normalizedParameter, s: point.normalizedArcLength, x: xFor(point), value: valueFor(point, index) })),
  });
  return [
    row("speed", "Speed", `${field.provenance.units.position}/${field.provenance.units.parameter}`, (point) => point.speed),
    row("curvature", "Curvature κ", `1/${field.provenance.units.position}`, (point) => point.curvature),
    row("signed-curvature", "Signed curvature", `1/${field.provenance.units.position}`, (point) => point.signedCurvature),
    row("torsion", "Torsion τ", `1/${field.provenance.units.position}`, (point) => point.torsion),
    row("sampling-error", "Sampling error", field.provenance.units.position, (_point, index) => samplingErrors[index] ?? null),
  ];
};
