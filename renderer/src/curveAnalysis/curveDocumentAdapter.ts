import {
  CURVE_COMMAND_TYPES, projectCommandTransaction, canonicalJsonStringify, createDocumentIdentity, createCommandEnvelope, createCurveCommandState,
  createCurveDocument, curveCommandDefinitions, parseCurveDocument, serializeCurveDocument,
  type CanonicalJsonValue, type CommandEnvelope, type CurveDocument, type CurveDocumentSource,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { createSplineDefinition, type CanonicalSplineDefinition } from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import type { CanonicalCurveDefinition } from "./contracts";

const canonical = <T>(value: T): T => {
  const omitUndefined = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(omitUndefined)
    : entry && typeof entry === "object"
      ? Object.fromEntries(Object.entries(entry).filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]))
      : entry;
  return JSON.parse(canonicalJsonStringify(omitUndefined(value))) as T;
};

export const curveSourceFromLegacyDefinition = (definition: CanonicalCurveDefinition): CurveDocumentSource => ({
  representation: definition.representation,
  dimension: definition.dimension,
  domain: canonical(definition.domain),
  units: canonical(definition.units),
  orientation: canonical(definition.orientation) as CanonicalJsonValue,
  derivatives: canonical(definition.derivatives) as CanonicalJsonValue,
  definition: canonical(definition.source),
  dependencies: canonical(definition.dependencies) as CanonicalJsonValue,
});

export const curveDocumentFromLegacyDefinition = (definition: CanonicalCurveDefinition): CurveDocument => createCurveDocument({
  stableKey: { legacyCurveId: definition.identity.curveId },
  source: curveSourceFromLegacyDefinition(definition),
  metadata: {
    title: definition.identity.label,
    legacyCurveId: definition.identity.curveId,
    analysisSettings: canonical(definition.sampling) as CanonicalJsonValue,
  },
});

/** A spline edit is one structural command; sampled/evaluated fields stay outside history. */
export const sourceWithSplineDefinition = (source: CurveDocumentSource, spline: CanonicalSplineDefinition): CurveDocumentSource => {
  if (source.representation !== spline.kind) throw new TypeError("Spline kind does not match the active Curve document.");
  const controlPoints = spline.controlPoints.map((point) => "z" in point ? [point.x, point.y, point.z] : [point.x, point.y]);
  const knots = spline.kind === "bezier" ? {} : { knots: [...spline.knotVector] };
  const weights = spline.kind === "nurbs" ? { weights: [...spline.weights] } : {};
  const settings = spline.kind === "bezier"
    ? { degree: spline.degree }
    : { degree: spline.degree, knotCount: spline.knotVector.length, periodic: spline.periodic, ...(spline.kind === "nurbs" ? { weightCount: spline.weights.length } : {}) };
  return {
    ...source,
    domain: { ...source.domain, min: spline.domain.tMin, max: spline.domain.tMax, closed: spline.closed, periodic: spline.periodic },
    definition: { ...source.definition, controlPoints, controlPointCount: controlPoints.length, ...knots, ...weights, settings },
  };
};

/** Reopen editable spline state from the saved structural source, not the preset fixture. */
export const splineDefinitionFromCurveDocument = (document: CurveDocument, fallback: CanonicalSplineDefinition): CanonicalSplineDefinition => {
  const { source } = document;
  if (source.representation !== fallback.kind || !source.definition.controlPoints?.length ||
      source.definition.controlPoints.some((point) => point.length !== source.dimension)) return fallback;
  const points = source.definition.controlPoints.map((point) => source.dimension === 3
    ? { x: point[0], y: point[1], z: point[2] }
    : { x: point[0], y: point[1] });
  return createSplineDefinition({
    id: fallback.id, name: fallback.name, kind: fallback.kind, dimension: source.dimension,
    revision: Math.max(fallback.revision, document.identity.revision),
    degree: Number(source.definition.settings?.degree ?? fallback.degree),
    controlPoints: points,
    knotVector: source.definition.knots ?? fallback.knotVector,
    weights: source.definition.weights ?? points.map(() => 1),
    closed: source.domain.closed, periodic: source.domain.periodic, clamped: !source.domain.periodic,
    domain: { tMin: source.domain.min, tMax: source.domain.max },
  });
};

export { type CurveReplayBundle } from "@math3d/kernel";
import { CurveCommandAdapter } from "@math3d/kernel";

/** Desktop authoring helpers over the shared bounded Curve kernel. */
export class CurveDocumentAdapter extends CurveCommandAdapter {
  commitSplineDefinition(spline: CanonicalSplineDefinition): CurveDocument {
    return this.commitSource(sourceWithSplineDefinition(this.document().source, spline));
  }
  syncLegacyDefinition(definition: CanonicalCurveDefinition): CurveDocument {
    this.commitSource(curveSourceFromLegacyDefinition(definition));
    return this.setAnalysisSettings(canonical(definition.sampling) as CanonicalJsonValue);
  }
}
