import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import { parseSageAlgebraicLocusScene, sageAlgebraicLocusSceneStatus,
  type SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";
import { parseSageAlgebraicLocusSample, type SageAlgebraicLocusSample } from "./sageAlgebraicLocusSampling";
import { inspectProjectAlgebraFreshness } from "./projectAlgebraRegistry";

export const PROJECT_ALGEBRA_OPEN_IN_SCHEMA_VERSION = 1 as const;
export type ProjectAlgebraOpenInAction = Readonly<{
  schemaVersion: typeof PROJECT_ALGEBRA_OPEN_IN_SCHEMA_VERSION;
  id: "algebra.locus-geometry" | "algebra.sampled-geometry";
  source: Readonly<{ projectId: string; objectId: string; revision: number; contentHash: string }>;
  sceneHash: string | null;
  sampleHash: string | null;
  targetModule: "geometry";
  label: string;
  preview: string;
  enabled: boolean;
  disabledReason: string | null;
}>;

export type ProjectAlgebraCasHandoff = Readonly<{
  schemaVersion: typeof PROJECT_ALGEBRA_OPEN_IN_SCHEMA_VERSION;
  id: "algebra.prepare-locus-cas";
  source: ProjectAlgebraOpenInAction["source"];
  label: "Prepare locus in CAS";
  enabled: boolean;
  disabledReason: string | null;
}>;

/** A Project-to-CAS selection handoff; no scene is computed or saved here. */
export const projectAlgebraCasHandoff = (project: Math3DProject, target: AlgebraObjectRef):
  ProjectAlgebraCasHandoff => {
  const entry = project.algebraObjects?.find(item => item.id === target.objectId);
  const record = entry?.revisions[target.revision - 1];
  const source = { projectId: project.identity.id, objectId: target.objectId,
    revision: target.revision, contentHash: record?.contentHash ?? "" };
  let disabledReason: string | null = null;
  if (!record || entry?.archived || record.revision !== entry.revisions.length)
    disabledReason = "Choose the current unarchived algebra object revision.";
  else if (inspectProjectAlgebraFreshness(project).find(item => item.objectId === record.id)?.status !== "fresh")
    disabledReason = "Refresh this algebra object's stale dependencies before preparing a locus.";
  else if (record.definition.kind !== "ideal" && record.definition.kind !== "polynomial-ring")
    disabledReason = "A real locus requires a polynomial ring or ideal.";
  else {
    const ambientRef = record.definition.kind === "ideal" ? record.definition.ambientRing : target;
    const ambient = project.algebraObjects?.find(item => item.id === ambientRef.objectId)
      ?.revisions[ambientRef.revision - 1];
    const coefficientRef = ambient?.definition.kind === "polynomial-ring"
      ? ambient.definition.coefficientDomain : null;
    const coefficient = coefficientRef ? project.algebraObjects?.find(item => item.id === coefficientRef.objectId)
      ?.revisions[coefficientRef.revision - 1] : null;
    if (ambient?.definition.kind !== "polynomial-ring" ||
        ambient.definition.variables.length < 1 || ambient.definition.variables.length > 3 ||
        coefficient?.definition.kind !== "rational-field")
      disabledReason = "Real locus preparation requires a pinned QQ polynomial ring with 1–3 variables.";
  }
  return { schemaVersion: PROJECT_ALGEBRA_OPEN_IN_SCHEMA_VERSION,
    id: "algebra.prepare-locus-cas", source, label: "Prepare locus in CAS",
    enabled: disabledReason === null, disabledReason };
};

export const resolveProjectAlgebraCasHandoff = (project: Math3DProject, target: AlgebraObjectRef,
  choice: ProjectAlgebraCasHandoff): AlgebraObjectRef => {
  const current = projectAlgebraCasHandoff(project, target);
  if (!current.enabled || !choice.enabled || current.schemaVersion !== choice.schemaVersion ||
      current.id !== choice.id || current.source.projectId !== choice.source.projectId ||
      current.source.objectId !== choice.source.objectId ||
      current.source.revision !== choice.source.revision ||
      current.source.contentHash !== choice.source.contentHash)
    throw new TypeError("The algebra source changed; review the CAS handoff again.");
  return target;
};

/** Exact algebra is kept separate from its bounded numerical visualization. */
export const projectAlgebraOpenInActions = (project: Math3DProject, target: AlgebraObjectRef,
  scene: SageAlgebraicLocusScene | null, sample: SageAlgebraicLocusSample | null):
  readonly ProjectAlgebraOpenInAction[] => {
  const entry = project.algebraObjects?.find(item => item.id === target.objectId);
  const record = entry?.revisions[target.revision - 1];
  const source = { projectId: project.identity.id, objectId: target.objectId,
    revision: target.revision, contentHash: record?.contentHash ?? "" };
  let sceneReason: string | null = null;
  if (!record || entry?.archived || record.revision !== entry.revisions.length)
    sceneReason = "Choose the current unarchived algebra object revision.";
  else if (!scene) sceneReason = "Validate a bounded real locus first.";
  else try {
    parseSageAlgebraicLocusScene(scene, project);
    if (scene.source.target.id !== record.id || scene.source.target.revision !== record.revision ||
        scene.source.target.contentHash !== record.contentHash ||
        sageAlgebraicLocusSceneStatus(scene, project) !== "current")
      sceneReason = "The prepared locus does not match the current algebra source.";
  } catch (error) { sceneReason = (error as Error).message; }
  let sampleReason: string | null = sceneReason;
  if (!sampleReason && !sample) sampleReason = "Render a bounded real-locus sample first.";
  else if (!sampleReason && sample) try {
    parseSageAlgebraicLocusSample(sample, project);
    if (sample.scene.sceneHash !== scene!.sceneHash)
      sampleReason = "The sample does not match the prepared exact locus.";
  } catch (error) { sampleReason = (error as Error).message; }
  const base = { schemaVersion: PROJECT_ALGEBRA_OPEN_IN_SCHEMA_VERSION,
    source, sceneHash: scene?.sceneHash ?? null, sampleHash: sample?.resultHash ?? null,
    targetModule: "geometry" as const };
  return [
    { ...base, id: "algebra.locus-geometry", label: "Open exact locus in Geometry",
      preview: "Saves an uncomputed Geometry contract with pinned exact equations and real bounds. No numerical plot is claimed.",
      enabled: sceneReason === null, disabledReason: sceneReason },
    { ...base, id: "algebra.sampled-geometry", label: "Open sampled locus in Geometry",
      preview: "Saves a bounded numerical Geometry interpretation with explicit sample method and completeness limits; exact equations stay pinned.",
      enabled: sampleReason === null, disabledReason: sampleReason },
  ];
};

/** Requalify against the current Project before the existing Project save producer runs. */
export const resolveProjectAlgebraOpenIn = (project: Math3DProject, target: AlgebraObjectRef,
  scene: SageAlgebraicLocusScene | null, sample: SageAlgebraicLocusSample | null,
  choice: ProjectAlgebraOpenInAction): SageAlgebraicLocusScene | SageAlgebraicLocusSample => {
  const qualified = projectAlgebraOpenInActions(project, target, scene, sample).find(action =>
    action.id === choice.id && action.enabled && choice.enabled &&
    action.source.projectId === choice.source.projectId &&
    action.source.objectId === choice.source.objectId &&
    action.source.revision === choice.source.revision &&
    action.source.contentHash === choice.source.contentHash &&
    action.sceneHash === choice.sceneHash && action.sampleHash === choice.sampleHash);
  if (!qualified) throw new TypeError("The algebraic locus action is no longer qualified; validate it again.");
  if (choice.id === "algebra.locus-geometry" && scene) return parseSageAlgebraicLocusScene(scene, project);
  if (choice.id === "algebra.sampled-geometry" && sample) return parseSageAlgebraicLocusSample(sample, project);
  throw new TypeError("The algebraic locus action has no prepared source.");
};
