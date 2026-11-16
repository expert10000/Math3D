import { createMixedWorkspaceDocument, type Math3DProject, type MixedWorkspaceDocument } from "@math3d/core";

export const GEOMETRY_MESH_PROJECT_TAG = "geometry-mesh-project";

/** Capture only the two workbenches in a Geometry–Mesh Project journey. */
export const geometryMeshProjectWorkspace = (workspace: MixedWorkspaceDocument): MixedWorkspaceDocument => {
  const entries = workspace.entries.filter((entry) => entry.module === "geometry" || entry.module === "mesh");
  if (!entries.some((entry) => entry.module === "geometry") || !entries.some((entry) => entry.module === "mesh"))
    throw new TypeError("Open Geometry and Mesh before creating a focused Project.");
  const documentIds = new Set(entries.map((entry) => entry.expected.id));
  const results = workspace.results.filter((result) => documentIds.has(result.provenance.source.documentId));
  const resultIds = new Set(results.map((result) => result.resultId));
  const artifactIds = new Set(results.flatMap((result) => result.artifacts.map((artifact) => artifact.artifactId)));
  const artifacts = workspace.artifacts.filter((artifact) => artifactIds.has(artifact.handle.artifactId));
  const relations = workspace.relations.filter((relation) => relation.sources.every((source) => documentIds.has(source.documentId)) &&
    (relation.target.type === "document" ? documentIds.has(relation.target.generation.documentId) :
      relation.target.type === "result" ? resultIds.has(relation.target.resultId) : artifactIds.has(relation.target.artifactId)));
  return createMixedWorkspaceDocument({
    entries,
    activeDocumentIds: entries.map((entry) => entry.expected.id),
    constructions: workspace.constructions.filter((entry) => entry.kind === "scene-script"),
    results, relations, artifacts,
    committedSelection: workspace.committedSelection && documentIds.has(workspace.committedSelection.source.documentId)
      ? workspace.committedSelection : null,
  });
};

export const isGeometryMeshProject = (project: Math3DProject | null): boolean =>
  project?.metadata.tags?.includes(GEOMETRY_MESH_PROJECT_TAG) ?? false;
