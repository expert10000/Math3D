import { compileExpression, matchesScientificSourceGeneration, viewerSourceFromDocument,
  type CurveDocument, type Math3DProject, type SurfaceDocument } from "@math3d/core";
import type { CursorProjection, ProjectScientificCursor } from "../components/scientificCursor";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { curveParameterFrame } from "./curveCursor";

type ChartPoint = Readonly<{ u: number; v: number }>;

/** A saved relation is the authority for crossing from a Curve parameter to a Surface chart. */
export function currentCurveSurfacePair(project: Math3DProject, curveId: string, surfaceId: string):
  Readonly<{ curve: CurveDocument; surface: SurfaceDocument }> | null {
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  const curve = replayed.get(curveId), surface = replayed.get(surfaceId);
  if (curve?.format !== "math3d.curve-document" || surface?.format !== "math3d.surface-document" ||
      curve.source.representation !== "curve-on-surface" || surface.source.representation !== "parametric" ||
      curve.source.definition.surfaceLink?.surfaceId !== surfaceId ||
      curve.source.definition.surfaceLink.surfaceRevision !== surface.identity.revision) return null;
  const curveSource = viewerSourceFromDocument(curve), surfaceSource = viewerSourceFromDocument(surface);
  const relation = project.workspace.relations.find(item => item.kind === "derived-from" &&
    item.operation === "surface.chart-curve" && item.status === "current" &&
    item.sources.length === 1 && matchesScientificSourceGeneration(item.sources[0]!, surfaceSource) &&
    item.target.type === "document" && matchesScientificSourceGeneration(item.target.generation, curveSource));
  return relation ? { curve, surface } : null;
}

export function projectCurveSurfaceParameter(cursor: ProjectScientificCursor, project: Math3DProject,
  surfaceId: string): CursorProjection<ChartPoint> {
  if (cursor.sourceModule !== "curve" || cursor.resourceSha256 !== null || cursor.position.length !== 1)
    return { status: "incompatible-source", reason: "A Curve parameter cursor is required." };
  const pair = currentCurveSurfacePair(project, cursor.source.documentId, surfaceId);
  if (!pair || !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(pair.curve)) ||
      JSON.stringify(cursor.frame) !== JSON.stringify(curveParameterFrame(pair.curve)))
    return { status: "incompatible-source", reason: "The exact Curve, Surface and relation generations differ." };
  const t = cursor.position[0]!;
  if (!Number.isFinite(t) || t < pair.curve.source.domain.min || t > pair.curve.source.domain.max)
    return { status: "outside", reason: "Curve parameter is outside its saved domain." };
  const domain = pair.surface.source.domain;
  if (!domain || typeof domain !== "object" || Array.isArray(domain) || domain.kind !== "parameter" ||
      !domain.u || typeof domain.u !== "object" || Array.isArray(domain.u) ||
      !domain.v || typeof domain.v !== "object" || Array.isArray(domain.v))
    return { status: "incompatible-source", reason: "Surface has no bounded parameter chart." };
  const uBounds = domain.u as { min?: unknown; max?: unknown }, vBounds = domain.v as { min?: unknown; max?: unknown };
  if (![uBounds.min, uBounds.max, vBounds.min, vBounds.max].every(value => typeof value === "number" && Number.isFinite(value)) ||
      (uBounds.min as number) >= (uBounds.max as number) || (vBounds.min as number) >= (vBounds.max as number))
    return { status: "incompatible-source", reason: "Surface chart bounds are invalid." };
  const expressions = pair.curve.source.definition.expressions;
  if (!expressions?.u || !expressions.v)
    return { status: "incompatible-source", reason: "Curve chart expressions are missing." };
  const u = compileExpression(expressions.u, [pair.curve.source.domain.parameter]);
  const v = compileExpression(expressions.v, [pair.curve.source.domain.parameter]);
  if (!u.fn || !v.fn)
    return { status: "incompatible-source", reason: "Curve chart expressions cannot be evaluated." };
  const vars = { [pair.curve.source.domain.parameter]: t };
  const point = { u: u.fn(vars), v: v.fn(vars) };
  if (!Number.isFinite(point.u) || !Number.isFinite(point.v) ||
      point.u < (uBounds.min as number) || point.u > (uBounds.max as number) ||
      point.v < (vBounds.min as number) || point.v > (vBounds.max as number))
    return { status: "outside", reason: "Curve parameter maps outside the Surface chart." };
  return { status: "matched", value: point };
}
