import {
  buildSplineCurve, createAnalysisResultEnvelope, createDocumentRelation,
  createSplineDefinition, structuralHash,
  type AnalysisResultEnvelope, type AnyCurve, type CanonicalJsonValue,
  type CurveDocument, type DocumentIdentity, type DocumentRelation, type ScientificSourceGeneration,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { buildCurveFromPreset } from "../math/curvePresetFactory";
import { createDerivedCurveMesh } from "./curveMesh";
import { polylineCurve } from "./curveInteroperability";
import { locateCurveConstructionSource, type CurveConstructionRecord } from "./curveConstructionKernel";
import { adaptCoreCurveDefinition } from "./adapters";

export type CurveConstructionGeometry = Readonly<{
  mesh: SurfaceMeshData;
  sourceSlots: Uint8Array;
  normalizedParameters: Float32Array;
}>;

const sourceGeneration = (document: { identity: DocumentIdentity }): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const count = (value: CanonicalJsonValue | undefined, fallback: number, maximum: number) =>
  typeof value === "number" && Number.isInteger(value) ? Math.max(4, Math.min(maximum, value)) : fallback;
const number = (value: CanonicalJsonValue | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const point3 = (point: { x: number; y: number; z?: number }) => [point.x, point.y, point.z ?? 0] as const;

/** Rebuild an evaluator from committed Curve source, without relying on transient UI state. */
export const runtimeCurveFromDocument = (document: CurveDocument): AnyCurve => {
  const { source } = document;
  const id = document.metadata.legacyCurveId ?? document.identity.id;
  const name = document.metadata.title;
  if (source.representation === "polyline" && source.definition.points && source.definition.points.length >= 2) {
    return polylineCurve({ id, name, dimension: source.dimension, closed: source.domain.closed,
      points: source.definition.points.map((point) => source.dimension === 2
        ? { x: point[0], y: point[1] } : { x: point[0], y: point[1], z: point[2] }) });
  }
  if (["bezier", "b-spline", "nurbs"].includes(source.representation) && source.definition.controlPoints?.length) {
    const controls = source.definition.controlPoints.map((point) => source.dimension === 2
      ? { x: point[0], y: point[1] } : { x: point[0], y: point[1], z: point[2] });
    const degree = Number(source.definition.settings?.degree);
    const spline = createSplineDefinition({ id, name, kind: source.representation as "bezier" | "b-spline" | "nurbs",
      dimension: source.dimension, degree, controlPoints: controls,
      ...(source.definition.knots ? { knotVector: source.definition.knots } : {}),
      ...(source.definition.weights ? { weights: source.definition.weights } : {}),
      closed: source.domain.closed, periodic: source.domain.periodic,
      domain: { tMin: source.domain.min, tMax: source.domain.max },
    });
    return buildSplineCurve(spline);
  }
  if (source.representation === "parametric" && source.definition.expressions?.x && source.definition.expressions.y) {
    const built = buildCurveFromPreset({ id, label: name, kind: "parametric", dimension: source.dimension,
      formulas: { x: source.definition.expressions.x, y: source.definition.expressions.y, z: source.definition.expressions.z },
      domain: { tMin: source.domain.min, tMax: source.domain.max, closed: source.domain.closed } });
    if (built.curve) return built.curve;
    throw new TypeError(`Curve source expressions cannot be replayed: ${built.errors.join(" ")}`);
  }
  throw new TypeError(`No replayable evaluator is available for ${source.representation}; regenerate the source Curve before construction.`);
};

const evaluateAt = (curve: AnyCurve, u: number) => point3(curve.eval(curve.domain.tMin + u * (curve.domain.tMax - curve.domain.tMin)));
const normalsFor = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3, b = indices[index + 1] * 3, c = indices[index + 2] * 3;
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const vertex of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[vertex + axis] += normal[axis];
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) normals[index + axis] /= length;
  }
  return normals;
};

export const tessellateCurveConstruction = (record: CurveConstructionRecord): CurveConstructionGeometry => {
  const curves = record.sourceDocuments.map(runtimeCurveFromDocument);
  const params = record.request.parameters as Record<string, CanonicalJsonValue>;
  const uSegments = count(params.uSegments, 64, 256);
  const vSegments = count(params.vSegments, 24, 128);
  const kind = record.request.kind;
  let positions: Float32Array, indices: Uint32Array, uvs: Float32Array;
  let sourceSlots: Uint8Array, normalizedParameters: Float32Array;
  if (kind === "sweep" || kind === "tube-surface") {
    const payload = createDerivedCurveMesh({
      definition: adaptCoreCurveDefinition(curves[0], { revision: record.request.inputs[0].curveRevision }),
      curve: curves[0],
      settings: { outputMode: kind === "sweep" ? "swept-profile" : "tube", longitudinalResolution: uSegments,
        radialResolution: Math.max(4, Math.min(64, vSegments)), tubeRadius: Math.max(1e-6, number(params.radius, 0.1)), caps: false },
    });
    if (!payload.geometry.indices || payload.geometry.primitive !== "triangles") throw new TypeError("Sweep did not produce a triangle surface.");
    positions = payload.geometry.positions; indices = payload.geometry.indices;
    uvs = new Float32Array((positions.length / 3) * 2);
    sourceSlots = new Uint8Array(positions.length / 3);
    normalizedParameters = Float32Array.from(payload.correspondence.sourceParameters, (parameter) =>
      (parameter - curves[0].domain.tMin) / (curves[0].domain.tMax - curves[0].domain.tMin));
  } else {
    const vertexCount = (uSegments + 1) * (vSegments + 1);
    positions = new Float32Array(vertexCount * 3); uvs = new Float32Array(vertexCount * 2);
    sourceSlots = new Uint8Array(vertexCount); normalizedParameters = new Float32Array(vertexCount);
    indices = new Uint32Array(uSegments * vSegments * 6);
    const axis = String(params.axis ?? "y"); const angle = number(params.angle, Math.PI * 2);
    const depth = number(params.depth, 1);
    for (let j = 0; j <= vSegments; j += 1) for (let i = 0; i <= uSegments; i += 1) {
      const u = i / uSegments, v = j / vSegments, vertex = j * (uSegments + 1) + i;
      const p = evaluateAt(curves[0], u);
      let output: readonly number[] = p;
      let slot = 0;
      if (kind === "extrusion") output = [p[0], p[1], p[2] + depth * v];
      else if (kind === "revolution") {
        const c = Math.cos(angle * v), s = Math.sin(angle * v);
        output = axis === "x" ? [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]
          : axis === "z" ? [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
            : [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
      } else if (kind === "ruled-surface" || kind === "loft") {
        const scaled = v * (curves.length - 1), left = Math.min(curves.length - 2, Math.floor(scaled));
        const alpha = v >= 1 ? 1 : scaled - left;
        const a = evaluateAt(curves[left], u), b = evaluateAt(curves[left + 1], u);
        output = a.map((value, component) => value * (1 - alpha) + b[component] * alpha);
        slot = alpha < 0.5 ? left : left + 1;
      }
      if (output.some((value) => !Number.isFinite(value))) throw new TypeError("Construction produced a non-finite vertex.");
      positions.set(output, vertex * 3); uvs.set([u, v], vertex * 2);
      sourceSlots[vertex] = slot; normalizedParameters[vertex] = u;
    }
    let cursor = 0;
    for (let j = 0; j < vSegments; j += 1) for (let i = 0; i < uSegments; i += 1) {
      const a = j * (uSegments + 1) + i, b = a + uSegments + 1;
      indices.set([a, b, b + 1, a, b + 1, a + 1], cursor); cursor += 6;
    }
  }
  const normals = normalsFor(positions, indices);
  const mesh: SurfaceMeshData = { label: record.target.metadata.title, positions, indices, normals, uvs,
    source: { kind: "derivedSurface", role: record.promoted ? "snapshot" : "live", state: record.promoted ? "frozen-snapshot" : "live-current",
      meshId: `curve-surface:${record.operationId}`, meshRevision: record.target.identity.revision,
      sourceSurfaceId: record.target.identity.id, sourceSurfaceRevision: record.target.identity.revision,
      sourceSurfaceLabel: record.target.metadata.title, sourceRepresentation: "constructed",
      tessellationMethod: kind, backendId: "math3d-curve-construction-v1",
      correspondenceId: `${record.operationId}:correspondence`, createdAt: 0,
      units: { length: record.sourceDocuments[0].source.units.position, area: "scene-unit²", gaussianCurvature: "scene-unit⁻²", meanCurvature: "scene-unit⁻¹" } } };
  return { mesh, sourceSlots, normalizedParameters };
};

export const locateCurveConstructionVertex = (record: CurveConstructionRecord, geometry: CurveConstructionGeometry, vertexIndex: number) => {
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= geometry.sourceSlots.length) throw new RangeError("Construction vertex is out of range.");
  return locateCurveConstructionSource(record, geometry.sourceSlots[vertexIndex], geometry.normalizedParameters[vertexIndex]);
};

export type CurveConstructionRealization = Readonly<{
  geometry: CurveConstructionGeometry;
  result: AnalysisResultEnvelope;
  artifactRelation: DocumentRelation;
}>;

/** Derived bytes remain in F07; reopened records regenerate them from committed Curve sources. */
export class CurveConstructionRealizer {
  readonly #targets = new Map<string, ScientificSourceGeneration>();
  readonly #registry = createInMemoryArtifactRegistry({ resolveSource: (id) => this.#targets.get(id) ?? null, maxArtifactBytes: 256 * 1024 * 1024 });
  artifacts() { return this.#registry; }

  realize(record: CurveConstructionRecord): CurveConstructionRealization {
    const target = sourceGeneration(record.target);
    this.#targets.set(target.documentId, target);
    const geometry = tessellateCurveConstruction(record);
    const artifactId = `curve-surface:${structuralHash({ target, operationId: record.operationId }).slice(7, 47)}`;
    const handle = { artifactId, kind: "binary" as const, role: "constructed-surface-mesh" };
    const positions = new Uint8Array(geometry.mesh.positions.buffer, geometry.mesh.positions.byteOffset, geometry.mesh.positions.byteLength);
    const indices = new Uint8Array(geometry.mesh.indices!.buffer, geometry.mesh.indices!.byteOffset, geometry.mesh.indices!.byteLength);
    const bytes = new Uint8Array(8 + positions.length + indices.length);
    new DataView(bytes.buffer).setUint32(0, positions.length, true);
    new DataView(bytes.buffer).setUint32(4, indices.length, true);
    bytes.set(positions, 8); bytes.set(indices, 8 + positions.length);
    this.#registry.declare({ handle, source: target, ownerId: "curve-construction", encoding: "math3d.triangle-surface.v1" });
    this.#registry.beginComputation(artifactId, "curve-construction", target);
    this.#registry.publish({ artifactId, ownerId: "curve-construction", source: target, bytes });
    const result = createAnalysisResultEnvelope({
      resultId: `curve-surface-result:${structuralHash({ target, artifactId }).slice(7, 47)}`,
      status: "numerical",
      provenance: { source: target, operation: { type: `curve.construct.${record.request.kind}`, algorithm: "sampled-surface-tessellation", algorithmVersion: "1", parameters: record.request.parameters as Record<string, CanonicalJsonValue> },
        numericContext: { tolerance: { absolute: number((record.request.parameters as Record<string, CanonicalJsonValue>).tolerance, 0) } },
        engine: { name: "Math3D Curve construction", version: "1" }, elapsedMs: 0 },
      summary: { vertexCount: geometry.mesh.positions.length / 3, faceCount: geometry.mesh.indices!.length / 3,
        construction: record.request.kind, sourceCount: record.sourceGenerations.length },
      warnings: record.request.warnings, diagnostics: [], artifacts: [handle],
    });
    const artifactRelation = createDocumentRelation({
      kind: "realization-of", sources: record.sourceGenerations, sourceOrder: "ordered",
      target: { type: "artifact", artifactId, artifactKind: "binary", role: "constructed-surface-mesh" },
      operation: `curve.construct.${record.request.kind}`, parameters: record.request.parameters as CanonicalJsonValue,
      producer: { commandId: record.operationId, resultIds: [result.resultId] },
      tool: { name: "Math3D Curve construction", version: "1" },
    });
    return { geometry, result, artifactRelation };
  }
}
