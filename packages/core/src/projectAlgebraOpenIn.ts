import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import { parseSageAlgebraicLocusScene, sageAlgebraicLocusSceneStatus,
  type SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";
import { parseSageAlgebraicLocusSample, type SageAlgebraicLocusSample } from "./sageAlgebraicLocusSampling";

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
