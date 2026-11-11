import { createAnalysisResultEnvelope, createCurveDocument, createDocumentRelation,
  createMixedWorkspaceDocument, matchesScientificSourceGeneration, replaceMath3DProjectWorkspace,
  sha256Checksum, structuralHash, viewerSourceFromDocument, type Math3DProject,
  upsertMath3DProjectWorkbook, type SurfaceDocument } from "@math3d/core";
import { createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import { computeMeshDifferentialGeometry } from "../mesh/meshDifferentialGeometry";
import type { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSurfaceDifferentialPoint } from "../surfaceAnalysis/differentialGeometry";
import { surfaceDocumentBinding } from "../workspace/surfaceDocumentBinding";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";

export const SURFACE_RIDGE_COMPARISON_OPERATION = "surface.revolution-ridge-comparison";
const GRID = 64;

/** Sample the exact saved revolution at fixed angular fraction and offer only interior |K| maxima. */
export function supportedSurfaceRidges(surface: SurfaceDocument) {
  const binding = surfaceDocumentBinding(surface);
  if (!binding || surface.source.definition.familyId !== "graph2d.revolution" || !binding.wrapV)
    return [];
  const domain = { u: { min: binding.domain.uMin, max: binding.domain.uMax },
    v: { min: binding.domain.vMin, max: binding.domain.vMax, periodic: true } };
  const uAt = (index: number) => binding.domain.uMin +
    (binding.domain.uMax - binding.domain.uMin) * index / GRID;
  const samples = Array.from({ length: GRID + 1 }, (_, index) => {
    const u = uAt(index);
    try {
      const point = analyzeSurfaceDifferentialPoint({ kind: "parametric", representation: "constructed",
        evaluate: binding.point, u, v: 0.25, domain,
        units: { length: (surface.source.units as { length?: string })?.length ?? "unitless", angle: "rad" } });
      return point.masks.valid && Number.isFinite(point.gaussianCurvature) ?
        { index, u, gaussian: point.gaussianCurvature!, position: point.jet!.position } : null;
    } catch { return null; }
  });
  return samples.flatMap((sample, index) => sample && index > 0 && index < GRID &&
    samples[index - 1] && samples[index + 1] &&
    Math.abs(sample.gaussian) > 1e-9 &&
    Math.abs(sample.gaussian) >= Math.abs(samples[index - 1]!.gaussian) &&
    Math.abs(sample.gaussian) >= Math.abs(samples[index + 1]!.gaussian) ? [sample] : []);
}

/** Publish a selected sampled ridge and a local analytic/discrete comparison with exact lineage. */
export function recordSurfaceRidgeComparison(project: Math3DProject, adapter: MeshDocumentAdapter,
  surfaceId: string, ridgeIndex: number): Math3DProject {
  const surfaceEntry = project.workspace.entries.find(entry => entry.module === "surface" &&
    entry.expected.id === surfaceId);
  const surface = surfaceEntry?.checkpoint;
  if (surface?.format !== "math3d.surface-document" ||
      surfaceEntry?.expected.structuralHash !== surface.identity.structuralHash)
    throw new TypeError("Saved Surface generation is unavailable.");
  const ridge = supportedSurfaceRidges(surface).find(item => item.index === ridgeIndex);
  if (!ridge) throw new TypeError("Select a supported interior curvature ridge of the saved revolution.");
  const mesh = adapter.document(), meshEntry = project.workspace.entries.find(entry =>
    entry.module === "mesh" && entry.expected.id === mesh.identity.id &&
    entry.expected.structuralHash === mesh.identity.structuralHash);
  const surfaceSource = viewerSourceFromDocument(surface), meshSource = viewerSourceFromDocument(mesh);
  if (!meshEntry || !project.workspace.relations.some(relation =>
    relation.status === "current" && relation.operation === "surface.tessellate-saved" &&
    relation.sources.length === 1 && matchesScientificSourceGeneration(relation.sources[0]!, surfaceSource) &&
    relation.target.type === "document" &&
    matchesScientificSourceGeneration(relation.target.generation, meshSource)))
    throw new TypeError("Generate and save a current Mesh from this exact Surface first.");
  const meshResult = project.workspace.results.find(result =>
    result.provenance.operation.type === "mesh.saved.curvature" &&
    matchesScientificSourceGeneration(result.provenance.source, meshSource));
  if (!meshResult) throw new TypeError("Analyze and save curvature for the exact Mesh first.");
  const data = adapter.mesh(), differential = computeMeshDifferentialGeometry(data);
  if (!differential) throw new TypeError("Saved Mesh curvature cannot be replayed.");
  let vertex = -1, distance = Infinity;
  for (let index = 0; index < data.positions.length / 3; index++) {
    if (!differential.validMask[index] || !Number.isFinite(differential.K[index])) continue;
    const candidate = Math.hypot(...[0, 1, 2].map(axis =>
      data.positions[index * 3 + axis]! - ridge.position[axis]!));
    if (candidate < distance) { distance = candidate; vertex = index; }
  }
  if (vertex < 0 || !Number.isFinite(distance))
    throw new TypeError("No valid discrete Mesh sample is near this ridge.");
  const binding = surfaceDocumentBinding(surface)!;
  const length = (surface.source.units as { length?: string })?.length ?? "unitless";
  const curve = createCurveDocument({ stableKey: [surface.identity.id, surface.identity.revision,
    "sampled-revolution-ridge", ridgeIndex], metadata: { title: `${surface.metadata.title} · |K| ridge ${ridgeIndex}` },
    source: { representation: "polyline", dimension: 3,
      domain: { parameter: "t", min: 0, max: 1, closed: true, periodic: true },
      units: { position: length, parameter: "unitless", angle: "rad" },
      orientation: { direction: "forward" }, derivatives: null,
      dependencies: [surfaceSource], definition: { familyId: "surface.sampled-revolution-ridge-v1",
        points: Array.from({ length: 65 }, (_, index) =>
          [...binding.point(ridge.u, index / 64)]), pointCount: 65 } } });
  const result = createAnalysisResultEnvelope({
    resultId: `surface-ridge:${structuralHash({ surfaceSource, meshSource, ridgeIndex,
      meshResultId: meshResult.resultId }).slice(7)}`, status: "numerical",
    provenance: { source: surfaceSource, operation: { type: SURFACE_RIDGE_COMPARISON_OPERATION,
      algorithm: "sampled-revolution-differential-v1+angle-defect-cotan-shape-operator-v2",
      algorithmVersion: "1", parameters: { ridgeIndex, ridgeCurveId: curve.identity.id,
        ridgeCurveHash: curve.identity.structuralHash, meshDocumentId: mesh.identity.id,
        meshRevision: mesh.identity.revision, meshHash: mesh.identity.structuralHash,
        meshChecksum: mesh.source.resource.checksum, meshResultId: meshResult.resultId,
        meshResultHash: structuralHash(meshResult) } },
      engine: { name: "Math3D local Surface/Mesh comparison", version: "1" },
      numericContext: { precision: { binaryBits: 53 } }, elapsedMs: 0 },
    summary: { ridgeParameter: ridge.u, analyticGaussian: ridge.gaussian,
      discreteGaussian: differential.K[vertex]!, absoluteDifference: Math.abs(differential.K[vertex]! - ridge.gaussian),
      meshVertex: vertex, spatialOffset: distance, lengthUnit: length,
      curvatureUnit: `${length}^-2`, ridgeCriterion: "sampled interior local maximum of |Gaussian curvature|" },
    warnings: ["Ridge detection uses 65 profile samples and numerical derivatives; it does not certify a continuous extremum.",
      "The Mesh value is the nearest valid vertex estimate. Spatial offset and absolute difference are recorded; convergence is not asserted."],
    diagnostics: [], artifacts: [] });
  const curveRelation = createDocumentRelation({ kind: "derived-from", sources: [surfaceSource],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(curve) },
    operation: "surface.sampled-revolution-ridge", parameters: { ridgeIndex, u: ridge.u, samples: 65 } });
  const comparisonRelation = createDocumentRelation({ kind: "analysis-of", sources: [surfaceSource, meshSource],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: SURFACE_RIDGE_COMPARISON_OPERATION }, operation: SURFACE_RIDGE_COMPARISON_OPERATION,
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: "curve", checkpoint: curve,
      expected: curve.identity, replay: null }],
    activeDocumentIds: [...project.workspace.activeDocumentIds, curve.identity.id],
    relations: [...project.workspace.relations, curveRelation, comparisonRelation],
    results: [...project.workspace.results, result] }));
}

/** Reopen stored evidence without recomputing; any changed source or sidecar withholds values. */
export function inspectSurfaceRidgeComparison(project: Math3DProject,
  resultId: string, readMeshResource?: (id: string) => Uint8Array | null) {
  const result = project.workspace.results.find(item => item.resultId === resultId &&
    item.provenance.operation.type === SURFACE_RIDGE_COMPARISON_OPERATION);
  if (!result) return { status: "withheld" as const, reason: "Saved ridge result is missing." };
  const p = result.provenance.operation.parameters as Record<string, unknown>;
  const surface = project.workspace.entries.find(entry => entry.expected.id === result.provenance.source.documentId);
  const mesh = project.workspace.entries.find(entry => entry.expected.id === p.meshDocumentId);
  const curve = project.workspace.entries.find(entry => entry.expected.id === p.ridgeCurveId);
  const discrete = project.workspace.results.find(item => item.resultId === p.meshResultId);
  if (!surface || !matchesScientificSourceGeneration(result.provenance.source,
        viewerSourceFromDocument({ identity: surface.expected })) ||
      !mesh || mesh.expected.revision !== p.meshRevision || mesh.expected.structuralHash !== p.meshHash ||
      mesh.checkpoint.format !== "math3d.mesh-document" ||
      mesh.checkpoint.source.resource.checksum !== p.meshChecksum ||
      !curve || curve.expected.structuralHash !== p.ridgeCurveHash ||
      !discrete || structuralHash(discrete) !== p.meshResultHash ||
      !project.workspace.relations.some(relation => relation.status === "current" &&
        relation.operation === "surface.sampled-revolution-ridge" &&
        relation.target.type === "document" && relation.target.generation.documentId === p.ridgeCurveId) ||
      !project.workspace.relations.some(relation => relation.status === "current" &&
        relation.operation === "surface.tessellate-saved" && relation.sources.some(source =>
          matchesScientificSourceGeneration(source, result.provenance.source)) &&
        relation.target.type === "document" && relation.target.generation.documentId === p.meshDocumentId))
    return { status: "withheld" as const, reason: "Saved Surface, ridge Curve, Mesh or analysis generation changed." };
  if (readMeshResource) {
    const bytes = readMeshResource(mesh.checkpoint.source.resource.id);
    if (!bytes || sha256Checksum(bytes) !== mesh.checkpoint.source.resource.checksum)
      return { status: "withheld" as const, reason: "Saved Mesh source bytes are missing or changed." };
  }
  return { status: "current" as const, result };
}

/** Bind the exact result and promoted Curve into a portable Workbook sidecar. */
export function prepareSurfaceRidgeWorkbook(project: Math3DProject, resultId: string) {
  const result = project.workspace.results.find(item => item.resultId === resultId &&
    item.provenance.operation.type === SURFACE_RIDGE_COMPARISON_OPERATION);
  if (!result) throw new TypeError("Saved ridge comparison is unavailable.");
  const curveId = (result.provenance.operation.parameters as Record<string, unknown>).ridgeCurveId;
  if (typeof curveId !== "string") throw new TypeError("Saved ridge Curve is unavailable.");
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `ridge-${resultId.slice(-12)}-${++sequence}`);
  workbook.title = "Surface ridge and discrete curvature comparison";
  workbook.stages[0]!.blocks[0]!.text = "Inspect the promoted sampled ridge Curve and the exact Surface/Mesh comparison. This is a local numerical estimate with a stated spatial offset and error, not a convergence proof.";
  workbook.stages[1]!.blocks = [
    { id: `ridge-curve-${resultId.slice(-12)}`, type: "reference", title: "Promoted ridge Curve",
      notebookReference: createNotebookReference(project, "document", curveId) },
    { id: `ridge-result-${resultId.slice(-12)}`, type: "reference", title: "Analytic and discrete comparison",
      notebookReference: createNotebookReference(project, "result", resultId) }];
  workbook.stages[3]!.blocks = [{ id: `ridge-limits-${resultId.slice(-12)}`, type: "text",
    title: "Interpretation and limits", text: result.warnings.join(" ") }];
  const prepared = prepareProjectWorkbook(project, workbook, `surface-ridge-${resultId}`);
  return { project: upsertMath3DProjectWorkbook(project, prepared.reference),
    workbookId: prepared.reference.id, workbookBytes: prepared.bytes };
}
