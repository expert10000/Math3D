import { canonicalJsonStringify, matchesScientificSourceGeneration, viewerSourceFromDocument,
  type AdapterFrame, type CurveDocument, type ValidationResult } from "@math3d/core";
import type { CursorProjection, ProjectCursorDraft, ProjectScientificCursor } from "../components/scientificCursor";
import type { CanonicalCurveDefinition } from "./contracts";
import { curveSourceFromLegacyDefinition } from "./curveDocumentAdapter";
import { curvePickIsStale, type SemanticCurvePick } from "./probe";

/** A Curve parameter belongs to one source document and never implies a shared xyz frame. */
export function curveParameterFrame(document: CurveDocument): AdapterFrame {
  return { kind: "parameter", frameId: document.identity.id,
    axes: [{ name: document.source.domain.parameter, dimension: "parameter", unit: document.source.units.parameter }] };
}

const sourceIsCurrent = (document: CurveDocument, definition: CanonicalCurveDefinition): boolean =>
  document.metadata.legacyCurveId === definition.identity.curveId &&
  canonicalJsonStringify(document.source) === canonicalJsonStringify(curveSourceFromLegacyDefinition(definition));
const near = (a: number, b: number): boolean => Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export function curveParameterCursorDraft(document: CurveDocument, definition: CanonicalCurveDefinition,
  pick: SemanticCurvePick, originViewId: string): ValidationResult<ProjectCursorDraft> {
  if (!sourceIsCurrent(document, definition) || curvePickIsStale(pick, definition.identity) ||
      pick.identity.key !== definition.identity.key)
    return { ok: false, errors: ["Curve probe and current saved source differ."] };
  const { min, max } = document.source.domain;
  if (!Number.isFinite(pick.t) || pick.t < min || pick.t > max ||
      !near(pick.normalizedParameter, (pick.t - min) / (max - min)) ||
      pick.worldPoint.length !== 3 || !pick.worldPoint.every(Number.isFinite))
    return { ok: false, errors: ["Curve probe has no exact finite parameter in the current domain."] };
  return { ok: true, value: { source: viewerSourceFromDocument(document), sourceModule: "curve",
    frame: curveParameterFrame(document), position: [pick.t], resourceSha256: null,
    mode: "locked", originViewId } };
}

/** Same-document return maps an exact parameter to the local selector without publishing again. */
export function projectCurveParameterCursor(cursor: ProjectScientificCursor, document: CurveDocument,
  definition: CanonicalCurveDefinition): CursorProjection<number> {
  const frame = curveParameterFrame(document), actual = cursor.frame;
  if (cursor.sourceModule !== "curve" || cursor.resourceSha256 !== null ||
      !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(document)) ||
      !sourceIsCurrent(document, definition) || actual.kind !== frame.kind || actual.frameId !== frame.frameId ||
      actual.axes.length !== 1 || actual.axes[0]?.name !== frame.axes[0]!.name ||
      actual.axes[0]?.dimension !== frame.axes[0]!.dimension || actual.axes[0]?.unit !== frame.axes[0]!.unit)
    return { status: "incompatible-source", reason: "Curve generation or parameter frame differs." };
  const t = cursor.position[0];
  if (cursor.position.length !== 1 || t === undefined || !Number.isFinite(t) ||
      t < document.source.domain.min || t > document.source.domain.max)
    return { status: "outside", reason: "Curve parameter is outside the current domain." };
  return { status: "matched", value: (t - document.source.domain.min) /
    (document.source.domain.max - document.source.domain.min) };
}
