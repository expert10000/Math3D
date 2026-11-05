import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createVectorField3DDocument, type VectorField3DDocument } from
  "./vectorField3DDocument";
import { integrateVectorField3DTrajectories, type VectorField3DTrajectory } from
  "./vectorField3DTrajectories";
import type { PoincareSectionRecipe } from "./vectorField3DTopologyStudies";

type Vec3 = readonly [number, number, number];
export type LyapunovRecipe = Readonly<{ seed: Vec3; direction: Vec3;
  perturbation: number; interval: number;
  solver: PoincareSectionRecipe["solver"] }>;
export type LyapunovStudy = Readonly<{
  status: "resolved" | "unavailable"; reason: string | null;
  estimate: number | null; uncertainty: number | null;
  evaluations: number; stopReasons: readonly string[];
  publication: AnalysisResultEnvelope | null;
}>;
const MAX_EVALUATIONS = 500_000;
const norm = (value: Vec3) => Math.hypot(...value);
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((value, i) =>
  value - b[i]!));
const inside = (document: VectorField3DDocument, point: Vec3) =>
  document.source.axes.every((axis, i) => point[i]! > axis.min &&
    point[i]! < axis.max);
const unavailable = (reason: string, evaluations = 0,
  stopReasons: readonly string[] = []): LyapunovStudy => ({ status: "unavailable",
  reason, estimate: null, uncertainty: null, evaluations, stopReasons,
  publication: null });

function trajectory(document: VectorField3DDocument, seed: Vec3,
  recipe: LyapunovRecipe, refined: boolean,
  shouldCancel?: () => boolean): Readonly<{ path: VectorField3DTrajectory;
    evaluations: number }> {
  const solver = recipe.solver;
  const temporary = createVectorField3DDocument({ ...document.source,
    seeds: [{ id: "lyapunov_seed", position: seed }],
    solver: { method: solver.method, mode: "time-trajectory", maxSteps: solver.maxSteps,
      maxTime: recipe.interval,
      absoluteTolerance: refined ? Math.max(1e-9, solver.absoluteTolerance / 4) :
        solver.absoluteTolerance,
      relativeTolerance: refined ? Math.max(1e-9, solver.relativeTolerance / 4) :
        solver.relativeTolerance } },
  { stableKey: { source: document.identity.id, seed, refined } });
  const result = integrateVectorField3DTrajectories(temporary, { shouldCancel });
  const path = result.trajectories[0]!;
  return { path, evaluations: result.totalEvaluations };
}

/** A two-separation, four-trajectory finite-time estimate; no asymptotic claim. */
export function computeVectorField3DLyapunov(document: VectorField3DDocument,
  recipe: LyapunovRecipe, shouldCancel?: () => boolean): LyapunovStudy {
  if (document.source.field.kind !== "expressions")
    return unavailable("analytic-source-required");
  if (new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      new Set(document.source.field.components.map(item => item.unit)).size !== 1)
    return unavailable("incompatible-coordinate-or-vector-units");
  const span = Math.min(...document.source.axes.map(axis => axis.max - axis.min));
  if (!Array.isArray(recipe.seed) || recipe.seed.length !== 3 ||
      !recipe.seed.every(Number.isFinite) || !inside(document, recipe.seed) ||
      !Array.isArray(recipe.direction) || recipe.direction.length !== 3 ||
      !recipe.direction.every(Number.isFinite) ||
      Math.abs(norm(recipe.direction) - 1) > 1e-6 ||
      !Number.isFinite(recipe.perturbation) || recipe.perturbation < span * 1e-6 ||
      recipe.perturbation > span * .05 ||
      !Number.isFinite(recipe.interval) || recipe.interval <= 0 ||
      recipe.interval > 10 || !Number.isInteger(recipe.solver.maxSteps) ||
      recipe.solver.maxTime !== recipe.interval ||
      recipe.solver.maxSteps < 16 || recipe.solver.maxSteps > 256 ||
      !["rk4-step-doubling", "rk45"].includes(recipe.solver.method) ||
      !Number.isFinite(recipe.solver.absoluteTolerance) ||
      recipe.solver.absoluteTolerance < 1e-9 ||
      recipe.solver.absoluteTolerance > 1e-4 ||
      !Number.isFinite(recipe.solver.relativeTolerance) ||
      recipe.solver.relativeTolerance < 1e-9 ||
      recipe.solver.relativeTolerance > 1e-4)
    throw new RangeError("Finite-time Lyapunov seed, perturbation or solver budget is invalid.");
  const displaced = (scale: number): Vec3 => recipe.seed.map((value, i) =>
    value + recipe.direction[i]! * scale) as unknown as Vec3;
  if (!inside(document, displaced(recipe.perturbation)) ||
      !inside(document, displaced(recipe.perturbation / 2)))
    return unavailable("perturbed-seed-outside-domain");
  if (shouldCancel?.()) throw new Error("Lyapunov computation cancelled.");
  const base = trajectory(document, recipe.seed, recipe, false, shouldCancel);
  const first = trajectory(document, displaced(recipe.perturbation), recipe,
    false, shouldCancel);
  const refinedBase = trajectory(document, recipe.seed, recipe, true, shouldCancel);
  const refined = trajectory(document, displaced(recipe.perturbation / 2),
    recipe, true, shouldCancel);
  const paths = [base.path, first.path, refinedBase.path, refined.path];
  const evaluations = [base, first, refinedBase, refined].reduce((sum, item) =>
    sum + item.evaluations, 0);
  const stopReasons = paths.map(item => item.stopReason);
  if (evaluations > MAX_EVALUATIONS)
    return unavailable("work-budget-reached", evaluations, stopReasons);
  if (paths.some(item => item.stopReason === "cancelled"))
    throw new Error("Lyapunov computation cancelled.");
  if (paths.some(item => item.stopReason !== "time-limit" ||
      Math.abs(item.points.at(-1)!.time - recipe.interval) > 1e-6))
    return unavailable("incomplete-time-coverage", evaluations, stopReasons);
  const separation = distance(base.path.points.at(-1)!.position,
    first.path.points.at(-1)!.position);
  const refinedSeparation = distance(refinedBase.path.points.at(-1)!.position,
    refined.path.points.at(-1)!.position);
  if (separation <= 0 || refinedSeparation <= 0 ||
      !Number.isFinite(separation) || !Number.isFinite(refinedSeparation))
    return unavailable("separation-unresolved", evaluations, stopReasons);
  const estimate = Math.log(separation / recipe.perturbation) / recipe.interval;
  const refinedEstimate = Math.log(refinedSeparation /
    (recipe.perturbation / 2)) / recipe.interval;
  const integrationError = paths.reduce((sum, item) =>
    sum + item.maxEstimatedLocalError, 0) /
    Math.max(Math.min(separation, refinedSeparation), recipe.perturbation * 1e-6) /
    recipe.interval;
  const uncertainty = Math.abs(estimate - refinedEstimate) + integrationError;
  if (!Number.isFinite(estimate) || !Number.isFinite(uncertainty))
    return unavailable("estimate-unresolved", evaluations, stopReasons);
  const pin = document.identity;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.lyapunov-finite-time.${structuralHash({ pin, recipe }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: "vector3d.lyapunov-finite-time",
        algorithm: "two-separation-finite-time-flow", algorithmVersion: "1",
        parameters: { recipe } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: recipe.solver.absoluteTolerance,
        relative: recipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { estimate, uncertainty, exponentUnit: `1/${document.source.timeUnit}`,
      interval: recipe.interval, timeUnit: document.source.timeUnit,
      coordinateUnit: document.source.axes[0].unit, evaluations,
      stopReasons },
    warnings: ["Finite-time directional estimate, not an asymptotic Lyapunov exponent or FTLE field.",
      "The two-scale uncertainty is a numerical indicator, not a certified error bound."],
    diagnostics: [], artifacts: [] });
  return { status: "resolved", reason: null, estimate, uncertainty,
    evaluations, stopReasons, publication };
}

export function projectLyapunovStatus(project: Math3DProject,
  result: AnalysisResultEnvelope): Readonly<{ status: "current" | "withheld";
  reason: string | null }> {
  if (result.provenance.operation.type !== "vector3d.lyapunov-finite-time")
    return { status: "withheld", reason: "wrong-result-type" };
  const pin = result.provenance.source;
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === pin.documentId);
  if (entry?.checkpoint.format !== "math3d.vector-field3d-document")
    return { status: "withheld", reason: "source-missing" };
  if (entry.expected.revision !== pin.revision ||
      entry.expected.structuralHash !== pin.structuralHash ||
      entry.checkpoint.identity.revision !== pin.revision ||
      entry.checkpoint.identity.structuralHash !== pin.structuralHash ||
      pin.generation !== pin.revision)
    return { status: "withheld", reason: "source-changed" };
  const recipe = result.provenance.operation.parameters.recipe;
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe))
    return { status: "withheld", reason: "recipe-invalid" };
  if (result.resultId !== `vector3d.lyapunov-finite-time.${structuralHash({
      pin: entry.checkpoint.identity, recipe }).slice(7)}`)
    return { status: "withheld", reason: "recipe-changed" };
  return { status: "current", reason: null };
}

export function upsertProjectLyapunov(project: Math3DProject,
  study: LyapunovStudy): Math3DProject {
  if (!study.publication || study.status !== "resolved")
    throw new TypeError("Only a resolved finite-time estimate can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectLyapunovStatus(current, study.publication);
  if (status.status !== "current") throw new TypeError(`Estimate withheld: ${status.reason}.`);
  const document = current.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === study.publication!.provenance.source.documentId)!
    .checkpoint as VectorField3DDocument;
  const expected = computeVectorField3DLyapunov(document,
    study.publication.provenance.operation.parameters.recipe as LyapunovRecipe);
  if (!expected.publication || structuralHash(expected.publication.summary) !==
      structuralHash(study.publication.summary))
    throw new TypeError("Finite-time estimate differs from its saved source and recipe.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
