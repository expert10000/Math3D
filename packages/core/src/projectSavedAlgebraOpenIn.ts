import type { AlgebraObjectRef } from "./algebraObjects";
import type { StableDocumentId, StructuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { projectAlgebraOpenInActions, type ProjectAlgebraOpenInAction } from "./projectAlgebraOpenIn";
import { parseAlgebraicLocusGeometryDocument, sageAlgebraicLocusSceneStatus,
  SAGE_LOCUS_GEOMETRY_EXTENSION } from
  "./sageAlgebraicLocusScene";
import { parseSampledAlgebraicLocusGeometryDocument, SAGE_LOCUS_SAMPLE_EXTENSION } from
  "./sageAlgebraicLocusSampling";

export const PROJECT_SAVED_ALGEBRA_OPEN_IN_SCHEMA_VERSION = 2 as const;
export type ProjectSavedAlgebraOpenInAction = Readonly<{
  schemaVersion: typeof PROJECT_SAVED_ALGEBRA_OPEN_IN_SCHEMA_VERSION;
  id: ProjectAlgebraOpenInAction["id"];
  source: ProjectAlgebraOpenInAction["source"];
  sceneHash: string | null;
  sampleHash: string | null;
  sourceStatus: "current" | "historical" | "stale" | "archived" | "missing" | null;
  documentId: StableDocumentId | null;
  documentRevision: number | null;
  documentHash: StructuralHash | null;
  targetModule: "geometry";
  label: string;
  preview: string;
  enabled: boolean;
  disabledReason: string | null;
}>;

/** Lists only saved locus checkpoints; this route never computes or replaces Geometry. */
export const projectSavedAlgebraOpenInActions = (project: Math3DProject, target: AlgebraObjectRef):
  readonly ProjectSavedAlgebraOpenInAction[] => {
  const actions: ProjectSavedAlgebraOpenInAction[] = [];
  for (const entry of project.workspace.entries) {
    if (entry.module !== "geometry" || entry.checkpoint.format !== "math3d.geometry-document" ||
        !(SAGE_LOCUS_GEOMETRY_EXTENSION in entry.checkpoint.source.extensions)) continue;
    const sampled = SAGE_LOCUS_SAMPLE_EXTENSION in entry.checkpoint.source.extensions;
    let parsed;
    try {
      parsed = sampled
        ? parseSampledAlgebraicLocusGeometryDocument(entry.checkpoint, project)
        : parseAlgebraicLocusGeometryDocument(entry.checkpoint, project);
    } catch { continue; }
    const scene = "sample" in parsed ? parsed.sample.scene : parsed.scene;
    if (scene.source.target.id !== target.objectId || scene.source.target.revision !== target.revision)
      continue;
    const sample = "sample" in parsed ? parsed.sample : null;
    const sourceStatus = sageAlgebraicLocusSceneStatus(scene, project);
    const qualified = projectAlgebraOpenInActions(project, target, scene, sample)
      .find(action => action.id === (sampled ? "algebra.sampled-geometry" : "algebra.locus-geometry"))!;
    actions.push({ schemaVersion: PROJECT_SAVED_ALGEBRA_OPEN_IN_SCHEMA_VERSION,
      id: qualified.id, source: qualified.source, sceneHash: qualified.sceneHash,
      sampleHash: qualified.sampleHash, sourceStatus, documentId: entry.expected.id,
      documentRevision: entry.expected.revision, documentHash: entry.expected.structuralHash,
      targetModule: "geometry", label: qualified.label,
      preview: (sample ? `Open the saved ${sample.algorithm} bounded sample; exact equations and source remain pinned.` :
        "Open the saved uncomputed exact Geometry contract; no numerical plot is claimed.") +
        (sourceStatus === "current" ? "" : ` Source is ${sourceStatus}; inspect saved evidence without recomputation.`),
      enabled: sourceStatus !== "missing", disabledReason: sourceStatus === "missing"
        ? "The pinned algebra source is missing from this Project." : null });
  }
  if (actions.length) return actions;
  const source = projectAlgebraOpenInActions(project, target, null, null)[0]!;
  return [{ schemaVersion: PROJECT_SAVED_ALGEBRA_OPEN_IN_SCHEMA_VERSION,
    id: "algebra.locus-geometry", source: source.source, sceneHash: null, sampleHash: null,
    sourceStatus: null,
    documentId: null, documentRevision: null, documentHash: null, targetModule: "geometry",
    label: "Open locus in Geometry", preview: "Prepare and save a bounded locus in CAS first.",
    enabled: false, disabledReason: source.disabledReason ===
      "Choose the current unarchived algebra object revision." ? source.disabledReason :
      "No saved locus Geometry is available. Prepare one in CAS first." }];
};

/** Rejects stale menu choices even when a saved document ID is reused by a newer checkpoint. */
export const resolveProjectSavedAlgebraOpenIn = (project: Math3DProject, target: AlgebraObjectRef,
  choice: ProjectSavedAlgebraOpenInAction): StableDocumentId => {
  const current = projectSavedAlgebraOpenInActions(project, target).find(action =>
    action.enabled && choice.enabled && action.schemaVersion === choice.schemaVersion &&
    action.id === choice.id && action.targetModule === choice.targetModule &&
    action.source.projectId === choice.source.projectId &&
    action.source.objectId === choice.source.objectId &&
    action.source.revision === choice.source.revision &&
    action.source.contentHash === choice.source.contentHash &&
    action.sceneHash === choice.sceneHash && action.sampleHash === choice.sampleHash &&
    action.sourceStatus === choice.sourceStatus &&
    action.documentId === choice.documentId &&
    action.documentRevision === choice.documentRevision && action.documentHash === choice.documentHash);
  if (!current?.documentId) throw new TypeError("The saved algebra locus destination changed; review it again.");
  return current.documentId;
};
