import { createDocumentRelation, createMixedWorkspaceDocument, reviewProjectDerivedField,
  structuralHash, viewerSourceFromDocument,
  type CanonicalJsonValue, type DerivedScalarIsosurface, type Math3DProject,
  type MixedWorkspaceDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import type { SurfaceMeshSource } from "../mesh/surfaceMesh";
import { MIXED_REPLAY_FORMATS } from "../kernel/mixedWorkspaceReplay";

/** Promote a current analytic scalar DAG result with its exact source and recipe lineage. */
export function promoteDerivedScalarIsosurfaceMesh(workspace: MixedWorkspaceDocument,
  project: Math3DProject, surface: DerivedScalarIsosurface) {
  const derived = project.workspace.derivedFields?.find(item =>
    item.identity.id === surface.derived.documentId);
  const vector = workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === surface.vectorSource.documentId);
  const sources = surface.vectorSources.map(generation => workspace.entries.find(item =>
    item.module === "vector3d" && item.expected.id === generation.documentId &&
    item.expected.revision === generation.revision &&
    item.expected.structuralHash === generation.structuralHash &&
    item.checkpoint.format === "math3d.vector-field3d-document"));
  if (!derived || derived.identity.revision !== surface.derived.revision ||
      derived.identity.structuralHash !== surface.derived.structuralHash ||
      vector?.checkpoint.format !== "math3d.vector-field3d-document" ||
      vector.expected.revision !== surface.vectorSource.revision ||
      vector.expected.structuralHash !== surface.vectorSource.structuralHash ||
      !sources.length || sources.some(source => !source) ||
      !surface.vectorSources.some(source => source.documentId === surface.vectorSource.documentId) ||
      surface.triangleCount < 1 || surface.indices.length !== surface.triangleCount * 3 ||
      surface.positions.length !== surface.vertexCount * 3 ||
      surface.normals.length !== surface.positions.length)
    throw new TypeError("Derived scalar isosurface is stale or has invalid mesh geometry.");
  const origin: Extract<SurfaceMeshSource, { kind: "derivedScalarFieldIsosurface" }> = {
    kind: "derivedScalarFieldIsosurface", derived: surface.derived,
    vectorSource: surface.vectorSource, vectorSources: surface.vectorSources,
    sampleHash: surface.sampleHash,
    recipe: { level: surface.level, unit: surface.unit,
      clipBounds: surface.clipBounds, triangleBudget: surface.triangleBudget,
      timeBudgetMs: surface.timeBudgetMs, gridShape: surface.gridShape },
    complete: surface.complete, limitReason: surface.limitReason ?? null };
  const adapter = MeshDocumentAdapter.fromMesh({ label: `${derived.metadata.title} = ${
    surface.level} ${surface.unit}`, positions: surface.positions,
    normals: surface.normals, indices: surface.indices, source: origin });
  const mesh = adapter.document();
  const replay = adapter.replayBundle();
  if (workspace.entries.some(item => item.expected.id === mesh.identity.id))
    throw new TypeError("This derived scalar Mesh is already in the Project.");
  const relation = createDocumentRelation({ kind: "generated-by",
    sources: [...sources.map(source => viewerSourceFromDocument(source!.checkpoint)),
      viewerSourceFromDocument(derived)],
    sourceOrder: "ordered", target: { type: "document",
      generation: viewerSourceFromDocument(mesh) },
    operation: "derived-field.scalar-isosurface-mesh",
    parameters: { derivedId: derived.identity.id,
      recipeHash: surface.derived.recipeHash, sampleHash: surface.sampleHash,
      level: surface.level, unit: surface.unit, clipBounds: surface.clipBounds,
      triangleBudget: surface.triangleBudget, timeBudgetMs: surface.timeBudgetMs } });
  return { adapter, workspace: createMixedWorkspaceDocument({ ...workspace,
    entries: [...workspace.entries, { module: "mesh", checkpoint: replay.checkpoint.document,
      expected: mesh.identity, replay: { format: MIXED_REPLAY_FORMATS.mesh,
        payload: replay as unknown as CanonicalJsonValue } }],
    activeDocumentIds: [...new Set([...workspace.activeDocumentIds, mesh.identity.id])],
    relations: [...workspace.relations, relation] }) };
}

export function projectDerivedScalarMeshStatus(project: Math3DProject,
  origin: Extract<SurfaceMeshSource, { kind: "derivedScalarFieldIsosurface" }>):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  const derived = project.workspace.derivedFields?.find(item =>
    item.identity.id === origin.derived.documentId);
  if (!derived) return { status: "withheld", reason: "derived-recipe-missing" };
  if (derived.identity.revision !== origin.derived.revision ||
      derived.identity.structuralHash !== origin.derived.structuralHash ||
      structuralHash({ input: derived.input, secondaryInput: derived.secondaryInput ?? null,
        operation: derived.operation }) !== origin.derived.recipeHash)
    return { status: "withheld", reason: "derived-recipe-changed" };
  for (const generation of origin.vectorSources) {
    const vector = project.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === generation.documentId);
    if (!vector) return { status: "withheld", reason: "vector-source-missing" };
    if (vector.expected.revision !== generation.revision ||
        vector.expected.structuralHash !== generation.structuralHash)
      return { status: "withheld", reason: "vector-source-changed" };
  }
  const review = reviewProjectDerivedField(project, derived.identity.id,
    source => source.source.field.kind === "expressions");
  return review.status === "current" ? { status: "current", reason: null } :
    { status: "withheld", reason: review.status };
}
