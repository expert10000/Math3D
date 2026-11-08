import type { AlgebraObjectRef } from "./algebraObjects";
import type { StableDocumentId, StructuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { parseAlgebraicLocusGeometryDocument, sageAlgebraicLocusSceneStatus,
  SAGE_LOCUS_GEOMETRY_EXTENSION, type SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";
import { parseSampledAlgebraicLocusGeometryDocument, SAGE_LOCUS_SAMPLE_EXTENSION,
  type SageAlgebraicLocusSample } from
  "./sageAlgebraicLocusSampling";
import { parseAlgebraicSingularityGeometryDocument, SAGE_LOCUS_SINGULARITY_EXTENSION,
  type SageAlgebraicSingularityScene } from
  "./sageAlgebraicSingularity";

export const PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION = 2 as const;
export type ProjectAlgebraLocusReturn = Readonly<{
  schemaVersion: typeof PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION;
  documentId: StableDocumentId;
  documentRevision: number;
  documentHash: StructuralHash;
  source: Readonly<{ projectId: string; objectId: StableDocumentId;
    revision: number; contentHash: string }>;
  sceneHash: string;
  sampleHash: string | null;
  analysisHash: string | null;
  inspectionPoint: readonly string[] | null;
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
  const singularity = SAGE_LOCUS_SINGULARITY_EXTENSION in extensions;
  if (sampled && singularity || Object.keys(extensions).length !== (sampled || singularity ? 2 : 1))
    return null;
  let scene, sampleHash: string | null = null, analysisHash: string | null = null;
  let inspectionPoint: readonly string[] | null = null;
  try {
    if (singularity) {
      const { analysis } = parseAlgebraicSingularityGeometryDocument(entry.checkpoint, project);
      scene = analysis.scene; analysisHash = analysis.analysisHash; inspectionPoint = analysis.point;
    } else if (sampled) {
      const { sample } = parseSampledAlgebraicLocusGeometryDocument(entry.checkpoint, project);
      scene = sample.scene; sampleHash = sample.resultHash;
    } else scene = parseAlgebraicLocusGeometryDocument(entry.checkpoint, project).scene;
  } catch { return null; }
  const status = sageAlgebraicLocusSceneStatus(scene, project);
  return { schemaVersion: PROJECT_ALGEBRA_LOCUS_RETURN_SCHEMA_VERSION,
    documentId: entry.expected.id, documentRevision: entry.expected.revision,
    documentHash: entry.expected.structuralHash,
    source: { projectId: scene.source.projectId, objectId: scene.source.target.id,
      revision: scene.source.target.revision, contentHash: scene.source.target.contentHash },
    sceneHash: scene.sceneHash, sampleHash, analysisHash, inspectionPoint,
    sourceStatus: status, label: "Return to algebra source in CAS",
    enabled: status !== "missing", reason: status === "current" ? null :
      status === "missing" ? "The pinned algebra source is missing from this Project." :
      `The pinned algebra source is ${status}; CAS will open that exact revision for inspection.` };
};

/** Lists validated saved views for one exact algebra revision, in Project document order. */
export const projectSavedAlgebraLocusEvidence = (project: Math3DProject,
  target: AlgebraObjectRef): readonly ProjectAlgebraLocusReturn[] =>
  project.workspace.entries.flatMap(entry => {
    const choice = projectAlgebraLocusReturn(project, entry.expected.id);
    return choice?.enabled && choice.source.objectId === target.objectId &&
      choice.source.revision === target.revision ? [choice] : [];
  });

/** Rechecks both the Geometry checkpoint and pinned algebra source before navigation. */
export const resolveProjectAlgebraLocusReturn = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): { projectId: string; target: AlgebraObjectRef; contentHash: string } => {
  const current = projectAlgebraLocusReturn(project, choice.documentId);
  if (!current?.enabled || !choice.enabled ||
      current.schemaVersion !== choice.schemaVersion ||
      current.documentRevision !== choice.documentRevision ||
      current.documentHash !== choice.documentHash ||
      current.sceneHash !== choice.sceneHash || current.sampleHash !== choice.sampleHash ||
      current.analysisHash !== choice.analysisHash ||
      JSON.stringify(current.inspectionPoint) !== JSON.stringify(choice.inspectionPoint) ||
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

/** Reads an exact saved inspection only after requalifying its source and checkpoint. */
export const resolveProjectAlgebraSingularityInspection = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): SageAlgebraicSingularityScene => {
  resolveProjectAlgebraLocusReturn(project, choice);
  if (!choice.analysisHash || !choice.inspectionPoint || choice.sampleHash)
    throw new TypeError("The selected Geometry checkpoint has no saved exact tangent analysis.");
  const entry = project.workspace.entries.find(item => item.expected.id === choice.documentId);
  if (entry?.checkpoint.format !== "math3d.geometry-document")
    throw new TypeError("The saved tangent Geometry checkpoint is unavailable.");
  const analysis = parseAlgebraicSingularityGeometryDocument(entry.checkpoint, project).analysis;
  if (analysis.analysisHash !== choice.analysisHash ||
      analysis.scene.sceneHash !== choice.sceneHash ||
      JSON.stringify(analysis.point) !== JSON.stringify(choice.inspectionPoint))
    throw new TypeError("The saved exact tangent analysis changed; review its Geometry checkpoint again.");
  return analysis;
};

export type ProjectAlgebraLocusInspection =
  | Readonly<{ kind: "exact"; scene: SageAlgebraicLocusScene }>
  | Readonly<{ kind: "sampled"; sample: SageAlgebraicLocusSample }>
  | Readonly<{ kind: "singularity"; analysis: SageAlgebraicSingularityScene }>;

/** Reads one immutable saved locus view after checking its exact Project checkpoint. */
export const resolveProjectAlgebraLocusInspection = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): ProjectAlgebraLocusInspection => {
  resolveProjectAlgebraLocusReturn(project, choice);
  if (choice.analysisHash)
    return { kind: "singularity", analysis: resolveProjectAlgebraSingularityInspection(project, choice) };
  if (choice.inspectionPoint)
    throw new TypeError("The saved locus inspection point has no exact tangent analysis.");
  const entry = project.workspace.entries.find(item => item.expected.id === choice.documentId);
  if (entry?.checkpoint.format !== "math3d.geometry-document")
    throw new TypeError("The saved locus Geometry checkpoint is unavailable.");
  if (choice.sampleHash) {
    const sample = parseSampledAlgebraicLocusGeometryDocument(entry.checkpoint, project).sample;
    if (sample.resultHash !== choice.sampleHash || sample.scene.sceneHash !== choice.sceneHash)
      throw new TypeError("The saved bounded sample changed; review its Geometry checkpoint again.");
    return { kind: "sampled", sample };
  }
  const scene = parseAlgebraicLocusGeometryDocument(entry.checkpoint, project).scene;
  if (scene.sceneHash !== choice.sceneHash)
    throw new TypeError("The saved exact locus changed; review its Geometry checkpoint again.");
  return { kind: "exact", scene };
};
