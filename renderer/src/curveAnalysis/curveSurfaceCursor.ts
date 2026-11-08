import { compileExpression, matchesScientificSourceGeneration, viewerSourceFromDocument,
  type CurveDocument, type Math3DProject, type SurfaceDocument } from "@math3d/core";
import type { CursorProjection, ProjectScientificCursor } from "../components/scientificCursor";
import type { ProjectCursorDraft } from "../components/scientificCursor";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { curveParameterFrame } from "./curveCursor";

type ChartPoint = Readonly<{ u: number; v: number }>;
type SurfaceChartPick = Readonly<{ surfaceId: string; revision: number; hash: string; uv: ChartPoint }>;
const near = (a: number, b: number): boolean => Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

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

/** Publish only when the saved Curve and chart relation still produce a bounded point. */
export function curveSurfaceCursorDraft(project: Math3DProject, curveId: string, surfaceId: string,
  t: number, originViewId: string): CursorProjection<ProjectCursorDraft> {
  const pair = currentCurveSurfacePair(project, curveId, surfaceId);
  if (!pair) return { status: "incompatible-source", reason: "Curve and Surface relation is not current." };
  const draft: ProjectCursorDraft = { source: viewerSourceFromDocument(pair.curve), sourceModule: "curve",
    frame: curveParameterFrame(pair.curve), position: [t], resourceSha256: null, mode: "locked", originViewId };
  const chart = projectCurveSurfaceParameter({ ...draft, kind: "project", sequence: 0 }, project, surfaceId);
  return chart.status === "matched" ? { status: "matched", value: draft } : chart;
}

/** Only an explicit identity chart axis gives a unique, checkable inverse. */
export function curveSurfaceReturnDraft(project: Math3DProject, curveId: string, pick: SurfaceChartPick,
  originViewId: string): CursorProjection<ProjectCursorDraft> {
  const pair = currentCurveSurfacePair(project, curveId, pick.surfaceId);
  if (!pair || pair.surface.identity.revision !== pick.revision ||
      pair.surface.identity.structuralHash !== pick.hash)
    return { status: "incompatible-source", reason: "Surface pick and current Curve chart generation differ." };
  const { u, v } = pick.uv;
  if (!Number.isFinite(u) || !Number.isFinite(v))
    return { status: "outside", reason: "Surface pick has no finite parameter coordinate." };
  const parameter = pair.curve.source.domain.parameter;
  const expressions = pair.curve.source.definition.expressions;
  const uIsIdentity = expressions?.u?.trim() === parameter;
  const vIsIdentity = expressions?.v?.trim() === parameter;
  if (!uIsIdentity && !vIsIdentity)
    return { status: "ambiguous", reason: "Curve chart has no identity parameter axis to invert." };
  const t = uIsIdentity ? u : v;
  const draft = curveSurfaceCursorDraft(project, curveId, pick.surfaceId, t, originViewId);
  if (draft.status !== "matched") return draft;
  const forward = projectCurveSurfaceParameter({ ...draft.value, kind: "project", sequence: 0 }, project, pick.surfaceId);
  if (forward.status !== "matched" || !near(forward.value.u, u) || !near(forward.value.v, v))
    return { status: "outside", reason: "Surface pick is not on the saved Curve trace." };
  return draft;
}
