import type { AlgebraObjectRef } from "./algebraObjects";
import type { StableDocumentId, StructuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { parseAlgebraicLocusGeometryDocument, sageAlgebraicLocusSceneStatus,
  SAGE_LOCUS_GEOMETRY_EXTENSION } from "./sageAlgebraicLocusScene";
import { parseSampledAlgebraicLocusGeometryDocument, SAGE_LOCUS_SAMPLE_EXTENSION } from
  "./sageAlgebraicLocusSampling";

export const PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION = 1 as const;
export type ProjectAlgebraLocusReturn = Readonly<{
  schemaVersion: typeof PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION;
  documentId: StableDocumentId;
  documentRevision: number;
  documentHash: StructuralHash;
  source: Readonly<{ projectId: string; objectId: StableDocumentId;
    revision: number; contentHash: string }>;
  sceneHash: string;
  sampleHash: string | null;
  sourceStatus: "current" | "historical" | "stale" | "archived" | "missing";
  label: "Return to algebra source in CAS";
  enabled: boolean;
  reason: string | null;
}>;

/** Opens a pinned algebra revision for inspection, including historical evidence. */
export const projectAlgebraLocusReturn = (project: Math3DProject, documentId: string):
  ProjectAlgebraLocusReturn | null => {
  const entry = project.workspace.entries.find(item => item.expected.id === documentId);
  if (entry?.module !== "geometry" || entry.checkpoint.format !== "math3d.geometry-document") return null;
  const extensions = entry.checkpoint.source.extensions;
  if (!(SAGE_LOCUS_GEOMETRY_EXTENSION in extensions)) return null;
  const sampled = SAGE_LOCUS_SAMPLE_EXTENSION in extensions;
  if (Object.keys(extensions).length !== (sampled ? 2 : 1)) return null;
  const parsed = sampled
    ? parseSampledAlgebraicLocusGeometryDocument(entry.checkpoint, project)
    : parseAlgebraicLocusGeometryDocument(entry.checkpoint, project);
  const scene = "sample" in parsed ? parsed.sample.scene : parsed.scene;
  const status = sageAlgebraicLocusSceneStatus(scene, project);
  return { schemaVersion: PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION,
    documentId: entry.expected.id, documentRevision: entry.expected.revision,
    documentHash: entry.expected.structuralHash,
    source: { projectId: scene.source.projectId, objectId: scene.source.target.id,
      revision: scene.source.target.revision, contentHash: scene.source.target.contentHash },
    sceneHash: scene.sceneHash, sampleHash: "sample" in parsed ? parsed.sample.resultHash : null,
    sourceStatus: status, label: "Return to algebra source in CAS",
    enabled: status !== "missing", reason: status === "current" ? null :
      status === "missing" ? "The pinned algebra source is missing from this Project." :
      `The pinned algebra source is ${status}; CAS will open that exact revision for inspection.` };
};

/** Rechecks both the Geometry checkpoint and pinned algebra source before navigation. */
export const resolveProjectAlgebraLocusReturn = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): { projectId: string; target: AlgebraObjectRef; contentHash: string } => {
  const current = projectAlgebraLocusReturn(project, choice.documentId);
  if (!current?.enabled || !choice.enabled ||
      current.schemaVersion !== choice.schemaVersion ||
      current.documentRevision !== choice.documentRevision ||
      current.documentHash !== choice.documentHash ||
      current.sceneHash !== choice.sceneHash || current.sampleHash !== choice.sampleHash ||
      current.source.projectId !== choice.source.projectId ||
      current.source.objectId !== choice.source.objectId ||
      current.source.revision !== choice.source.revision ||
      current.source.contentHash !== choice.source.contentHash ||
      current.sourceStatus !== choice.sourceStatus)
    throw new TypeError("The locus source or Geometry checkpoint changed; review its return link again.");
  return { projectId: current.source.projectId,
    target: { objectId: current.source.objectId, revision: current.source.revision },
    contentHash: current.source.contentHash };
};
