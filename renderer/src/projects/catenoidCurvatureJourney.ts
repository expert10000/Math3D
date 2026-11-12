import { createAnalysisResultEnvelope, createCurveDocument, createDocumentRelation,
  createMixedWorkspaceDocument, matchesScientificSourceGeneration, replaceMath3DProjectWorkspace,
  sha256Checksum, structuralHash, viewerSourceFromDocument, type AnalysisResultEnvelope,
  type Math3DProject } from "@math3d/core";
import type { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { computeMeshDifferentialGeometry } from "../mesh/meshDifferentialGeometry";

export const CATENOID_WAIST_OPERATION = "surface.catenoid-waist-comparison";
const PROFILE = "(exp(x) + exp(-x))/2";

/** Only the pinned built-in cosh revolution licenses the analytic reference K=-sech(x)^4. */
export function recordCatenoidWaistComparison(project: Math3DProject, adapter: MeshDocumentAdapter): Math3DProject {
  const graph = project.workspace.entries.find(entry => entry.module === "graph2d")?.checkpoint;
  const surface = project.workspace.entries.find(entry => entry.module === "surface")?.checkpoint;
  const mesh = adapter.document();
  const profile = graph?.format === "math3d.graph2d-document" ?
    graph.source.objects.find(object => object.id === "profile") : null;
  if (graph?.format !== "math3d.graph2d-document" || surface?.format !== "math3d.surface-document" ||
      surface.source.definition.familyId !== "graph2d.revolution" ||
      surface.source.definition.expressions?.y !== PROFILE ||
      surface.source.definition.settings?.axis !== "x" ||
      (!surface.source.units || typeof surface.source.units !== "object" ||
        Array.isArray(surface.source.units) ||
        (surface.source.units as { length?: unknown }).length !== "unitless") ||
      profile?.kind !== "explicit-cartesian" || profile.expression.source !== PROFILE ||
      !project.workspace.entries.some(entry => entry.expected.id === mesh.identity.id &&
        entry.expected.structuralHash === mesh.identity.structuralHash))
    throw new TypeError("Catenoid waist comparison requires the saved cosh revolution and exact Mesh.");
  const surfaceSource = viewerSourceFromDocument(surface), meshSource = viewerSourceFromDocument(mesh);
  const graphSource = viewerSourceFromDocument(graph);
  if (!project.workspace.relations.some(relation => relation.status === "current" &&
      relation.operation === "graph2d.revolve-surface" && relation.sources.length === 1 &&
      matchesScientificSourceGeneration(relation.sources[0]!, graphSource) &&
      relation.target.type === "document" &&
      matchesScientificSourceGeneration(relation.target.generation, surfaceSource)) ||
      !project.workspace.relations.some(relation => relation.status === "current" &&
        relation.operation === "surface.tessellate-saved" && relation.sources.length === 1 &&
        matchesScientificSourceGeneration(relation.sources[0]!, surfaceSource) &&
        relation.target.type === "document" &&
        matchesScientificSourceGeneration(relation.target.generation, meshSource)))
    throw new TypeError("Catenoid source-to-Surface-to-Mesh lineage is stale or missing.");
  const meshResult = project.workspace.results.find(result => result.provenance.operation.type === "mesh.saved.curvature" &&
    matchesScientificSourceGeneration(result.provenance.source, meshSource));
  if (!meshResult) throw new TypeError("The exact saved Mesh curvature result is missing.");
  const data = adapter.mesh(), differential = computeMeshDifferentialGeometry(data);
  if (!differential) throw new TypeError("Saved Mesh curvature cannot be replayed.");
  let vertex = -1, distance = Infinity;
  for (let index = 0; index < data.positions.length / 3; index++) {
    if (!differential.validMask[index] || !Number.isFinite(differential.K[index])) continue;
    const x = data.positions[index * 3]!, y = data.positions[index * 3 + 1]!, z = data.positions[index * 3 + 2]!;
    const candidate = Math.abs(x) + Math.abs(Math.hypot(y, z) - 1);
    if (candidate < distance) { distance = candidate; vertex = index; }
  }
  if (vertex < 0 || distance > 0.2) throw new TypeError("No qualified Mesh sample is near the catenoid waist.");
  const x = data.positions[vertex * 3]!, discrete = differential.K[vertex]!;
  const analytic = -1 / Math.cosh(x) ** 4;
  const ridge = createCurveDocument({ stableKey: [surface.identity.id, surface.identity.revision,
      "waist-abs-gaussian-ridge-v1"], metadata: { title: "Catenoid waist |K| ridge · sampled Curve" },
    source: { representation: "polyline", dimension: 3,
      domain: { parameter: "t", min: 0, max: 1, closed: true, periodic: true },
      units: { position: "unitless", parameter: "unitless", angle: "rad" },
      orientation: { direction: "forward" }, derivatives: null,
      dependencies: [surfaceSource], definition: { familyId: "catenoid.waist-ridge-v1",
        points: Array.from({ length: 65 }, (_, index) => [0,
          Math.cos(2 * Math.PI * index / 64), Math.sin(2 * Math.PI * index / 64)]), pointCount: 65 } } });
  const result: AnalysisResultEnvelope = createAnalysisResultEnvelope({
    resultId: `catenoid-waist:${structuralHash({ surfaceSource, meshSource, vertex,
      meshResultId: meshResult.resultId }).slice(7)}`, status: "numerical",
    provenance: { source: surfaceSource, operation: { type: CATENOID_WAIST_OPERATION,
      algorithm: "cosh-revolution-reference-v1+angle-defect-cotan-shape-operator-v2", algorithmVersion: "1",
      parameters: { ridgeCurveId: ridge.identity.id, meshDocumentId: mesh.identity.id,
        meshRevision: mesh.identity.revision, meshHash: mesh.identity.structuralHash,
        meshChecksum: mesh.source.resource.checksum, meshResultId: meshResult.resultId,
        meshResultHash: structuralHash(meshResult), vertex } },
      engine: { name: "Math3D local Surface/Mesh comparison", version: "1" },
      numericContext: { precision: { binaryBits: 53 } }, elapsedMs: 0 },
    summary: { chartX: x, meshVertex: vertex, analyticGaussian: analytic,
      discreteGaussian: discrete, absoluteDifference: Math.abs(discrete - analytic),
      analyticWaistGaussian: -1, ridgeKind: "maximum |K| for the pinned cosh revolution" },
    warnings: ["The waist Curve is a 64-segment display sample of an analytic circle.",
      "The discrete value is a single Mesh vertex estimate, not a proof of convergence or global minimality."],
    diagnostics: [], artifacts: [],
  });
  const ridgeRelation = createDocumentRelation({ kind: "derived-from", sources: [surfaceSource],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(ridge) },
    operation: "surface.waist-curvature-ridge", parameters: { profile: PROFILE,
      selection: "x=0 maximum absolute analytic Gaussian curvature", segments: 64 } });
  const comparisonRelation = createDocumentRelation({ kind: "analysis-of", sources: [surfaceSource, meshSource],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: result.provenance.operation.type }, operation: CATENOID_WAIST_OPERATION,
    parameters: result.provenance.operation.parameters });
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: "curve", checkpoint: ridge,
      expected: ridge.identity, replay: null }],
    activeDocumentIds: [...project.workspace.activeDocumentIds, ridge.identity.id],
    relations: [...project.workspace.relations, ridgeRelation, comparisonRelation],
    results: [...project.workspace.results, result] });
  return replaceMath3DProjectWorkspace(project, workspace);
}

/** Reopened evidence is displayed only while both exact sources and the saved result still agree. */
export function inspectCatenoidWaistComparison(project: Math3DProject,
  readMeshResource?: (id: string) => Uint8Array | null): Readonly<{
  status: "current"; result: AnalysisResultEnvelope } | { status: "withheld"; reason: string }> {
  const result = project.workspace.results.find(item => item.provenance.operation.type === CATENOID_WAIST_OPERATION);
  if (!result) return { status: "withheld", reason: "No saved Catenoid waist comparison exists." };
  const parameters = result.provenance.operation.parameters as Record<string, unknown>;
  const surface = project.workspace.entries.find(entry => entry.expected.id === result.provenance.source.documentId);
  const mesh = project.workspace.entries.find(entry => entry.expected.id === parameters.meshDocumentId);
  const discrete = project.workspace.results.find(item => item.resultId === parameters.meshResultId);
  const ridge = project.workspace.entries.find(entry => entry.expected.id === parameters.ridgeCurveId);
  if (!surface || !matchesScientificSourceGeneration(result.provenance.source,
      viewerSourceFromDocument({ identity: surface.expected })) ||
      !mesh || mesh.expected.revision !== parameters.meshRevision ||
      mesh.expected.structuralHash !== parameters.meshHash ||
      mesh.checkpoint.format !== "math3d.mesh-document" ||
      mesh.checkpoint.source.resource.checksum !== parameters.meshChecksum ||
      !discrete || structuralHash(discrete) !== parameters.meshResultHash ||
      !ridge || ridge.checkpoint.format !== "math3d.curve-document" ||
      !project.workspace.relations.some(relation => relation.status === "current" &&
        relation.operation === "surface.waist-curvature-ridge" && relation.sources.length === 1 &&
        matchesScientificSourceGeneration(relation.sources[0]!, result.provenance.source) &&
        relation.target.type === "document" &&
        matchesScientificSourceGeneration(relation.target.generation,
          viewerSourceFromDocument({ identity: ridge.expected }))))
    return { status: "withheld", reason: "Saved Surface, ridge Curve, Mesh or discrete result changed or is missing." };
  if (readMeshResource) {
    const bytes = readMeshResource(mesh.checkpoint.source.resource.id);
    if (!bytes || sha256Checksum(bytes) !== mesh.checkpoint.source.resource.checksum)
      return { status: "withheld", reason: "Saved Mesh buffer resource is missing or changed." };
  }
  return { status: "current", result };
}
