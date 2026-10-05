import type { CanonicalJsonValue, SurfaceDocumentSource } from "@math3d/core";

export type SurfaceStudyPresetId = "helicoid" | "catenoid";
export const SURFACE_STUDY_PRESETS = [
  { id: "helicoid", label: "Helicoid pitch study", parameter: "Pitch per radian", value: 0.5,
    questions: ["How does changing pitch alter the twist and curvature?", "Compare mean H in the interior with values near the boundary.", "Compare Gaussian K near the axis and farther away."],
    ranges: "u: −2π to 2π; v: −1.5 to 1.5" },
  { id: "catenoid", label: "Catenoid waist study", parameter: "Waist radius", value: 1,
    questions: ["How does changing waist radius alter the shape and curvature?", "Compare Gaussian K at the waist and toward the ends.", "Inspect mean H in the interior and the boundary warnings."],
    ranges: "u: −π to π; v: −1.2a to 1.2a, where a is the waist radius" },
] as const;

/** Explicit, undoable setup of literal coordinates; no silent inference from a name. */
export const surfaceStudySource = (source: SurfaceDocumentSource, id: SurfaceStudyPresetId, value: number): SurfaceDocumentSource => {
  const domain = source.domain;
  const record = (value: unknown): value is Record<string, CanonicalJsonValue> => !!value && typeof value === "object" && !Array.isArray(value);
  if (source.representation !== "parametric" || !record(domain) || domain.kind !== "parameter" || !record(domain.u) || !record(domain.v)) throw new TypeError("Study setup requires a literal parametric Surface editor.");
  if (!Number.isFinite(value) || value <= 0 || value > 100) throw new TypeError("Enter a positive study parameter up to 100.");
  const a = String(value), helicoid = id === "helicoid";
  if (!helicoid && id !== "catenoid") throw new TypeError("Unknown Surface study.");
  return { ...source, definition: { ...source.definition, familyId: id,
    expressions: helicoid ? { x: "v*cos(u)", y: "v*sin(u)", z: `${a}*u` } : { x: `${a}*cosh(v/${a})*cos(u)`, y: `${a}*cosh(v/${a})*sin(u)`, z: "v" } },
    domain: { ...domain, u: { ...domain.u, min: helicoid ? -2 * Math.PI : -Math.PI, max: helicoid ? 2 * Math.PI : Math.PI, periodic: false },
      v: { ...domain.v, min: helicoid ? -1.5 : -1.2 * value, max: helicoid ? 1.5 : 1.2 * value, periodic: false } } };
};
