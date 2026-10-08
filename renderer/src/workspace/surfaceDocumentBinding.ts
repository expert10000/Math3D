import { createGraph2DSurfacePointEvaluator, type SurfaceDocument } from "@math3d/core";

/** A presentation binding over the owning adapter, never a replacement document. */
export type SurfaceDocumentBinding = {
  kind: "captured-graph-surface";
  generation: SurfaceDocument["identity"];
  wrapU: boolean;
  wrapV: boolean;
  domain: { uMin: number; uMax: number; vMin: number; vMax: number };
  point: (u: number, v: number) => readonly [number, number, number];
};
export function surfaceDocumentBinding(document: SurfaceDocument): SurfaceDocumentBinding | null {
  const source = document.source, family = source.definition.familyId;
  if (source.representation !== "constructed" || !["graph2d.revolution", "graph2d.extrusion"].includes(family)) return null;
  // A capped extrusion requires the sampled Mesh presentation; an open patch cannot represent its caps.
  if (family === "graph2d.extrusion" && source.parameters.capPolicy !== "none") return null;
  const profile = (source.domain as unknown as { profile: { min: number; max: number; includeMin: boolean; includeMax: boolean } }).profile;
  if (!profile || !Number.isFinite(profile.min) || !Number.isFinite(profile.max) || profile.min >= profile.max) throw new TypeError("Invalid saved profile domain.");
  const evaluate = createGraph2DSurfacePointEvaluator(document);
  return { kind: "captured-graph-surface", generation: document.identity, wrapU: false,
    wrapV: family === "graph2d.revolution" && Math.abs(Number(source.parameters.angleMax) - Number(source.parameters.angleMin) - 2 * Math.PI) < 1e-12,
    domain: { uMin: profile.min, uMax: profile.max, vMin: 0, vMax: 1 },
    point: (u, v) => {
      // Match the retained sampling contract for excluded endpoints.
      const span = profile.max - profile.min;
      const parameter = u <= profile.min && !profile.includeMin ? profile.min + span * 1e-8
        : u >= profile.max && !profile.includeMax ? profile.min + span * (1 - 1e-8) : u;
      return evaluate(parameter, v);
    } };
}
