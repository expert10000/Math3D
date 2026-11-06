import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { computeTemporalLyapunovField, projectTemporalLyapunovFieldStatus,
  type TemporalLyapunovFieldOptions, type TemporalLyapunovFieldRecipe,
  type TemporalLyapunovFieldStudy, type TemporalLyapunovCell } from "./temporalLyapunovField";
import { projectTemporalFieldSourceStatus,
  type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";

export type TemporalFtleProfileRow = Readonly<{ x: number; y: number | null;
  uncertainty: number | null; status: "converged" | "unavailable" }>;
export type TemporalFtleProfileStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; rows: readonly TemporalFtleProfileRow[];
  coarse: TemporalLyapunovFieldStudy | null;
  refined: TemporalLyapunovFieldStudy | null;
  publication: AnalysisResultEnvelope | null }>;
export type TemporalFtleProfileRecipe = Readonly<{ baseResultId: string;
  convergenceTolerance: number; profileRow: 0 | 1 }>;

/** Bilinear fine-grid reconstruction at a saved coarse physical seed. */
export function assessTemporalFtleConvergence(coarse: readonly TemporalLyapunovCell[],
  fine: readonly TemporalLyapunovCell[], tolerance: number,
  profileRow: 0 | 1): readonly TemporalFtleProfileRow[] {
  if (coarse.length !== 4 || fine.length !== 16 ||
      !Number.isFinite(tolerance) || tolerance < 1e-8 || tolerance > .5)
    throw new RangeError("FTLE convergence needs 2×2 and 4×4 complete grids.");
  const at = (x: number, y: number) => fine[y * 4 + x]!;
  const coordinate = (cell: TemporalLyapunovCell, axis: number) =>
    cell.seed[axis]!;
  const varying = [0, 1, 2].filter(axis =>
    coarse[0]!.seed[axis] !== coarse[1]!.seed[axis] ||
    coarse[0]!.seed[axis] !== coarse[2]!.seed[axis]);
  if (varying.length !== 2) throw new TypeError("The FTLE seed slice is invalid.");
  const [u, v] = varying;
  return [0, 1].map(column => {
    const cell = coarse[profileRow * 2 + column]!;
    const findInterval = (axis: number, alongU: boolean) => {
      const target = coordinate(cell, axis);
      for (let index = 0; index < 3; index++) {
        const a = coordinate(alongU ? at(index, 0) : at(0, index), axis);
        const b = coordinate(alongU ? at(index + 1, 0) : at(0, index + 1), axis);
        if (target >= a - 1e-9 && target <= b + 1e-9)
          return { index, weight: (target - a) / (b - a) };
      }
      throw new RangeError("Coarse seed is outside the refined grid.");
    };
    const x = findInterval(u!, true), y = findInterval(v!, false);
    const reconstructed = (1 - y.weight) * ((1 - x.weight) *
      at(x.index, y.index).estimate + x.weight *
      at(x.index + 1, y.index).estimate) + y.weight *
      ((1 - x.weight) * at(x.index, y.index + 1).estimate +
        x.weight * at(x.index + 1, y.index + 1).estimate);
    const error = Math.max(Math.abs(reconstructed - cell.estimate),
      cell.uncertainty,
      ...[at(x.index, y.index), at(x.index + 1, y.index),
        at(x.index, y.index + 1), at(x.index + 1, y.index + 1)]
        .map(item => item.uncertainty));
    const converged = Number.isFinite(reconstructed) &&
      Number.isFinite(error) && error <= tolerance;
    return { x: coordinate(cell, u!), y: converged ? reconstructed : null,
      uncertainty: converged ? error : null,
      status: converged ? "converged" : "unavailable" };
  });
}

/** Recompute the saved GF-50 field and refine time, perturbation and spacing. */
export async function computeTemporalFtleProfile(project: Math3DProject,
  recipe: TemporalFtleProfileRecipe,
  options: TemporalLyapunovFieldOptions = {}): Promise<TemporalFtleProfileStudy> {
  const unavailable = (reason: string, coarse: TemporalLyapunovFieldStudy | null = null,
    refined: TemporalLyapunovFieldStudy | null = null): TemporalFtleProfileStudy =>
    ({ status: "unavailable", reason, rows: [], coarse, refined, publication: null });
  if (!Number.isFinite(recipe.convergenceTolerance) ||
      recipe.convergenceTolerance < 1e-8 || recipe.convergenceTolerance > .5 ||
      ![0, 1].includes(recipe.profileRow))
    throw new RangeError("FTLE profile needs a bounded tolerance and one physical row.");
  const base = project.workspace.results.find(item => item.resultId === recipe.baseResultId);
  if (!base || base.provenance.operation.type !== "vector3d.temporal-ftle-field")
    return unavailable("saved-ftle-field-missing");
  const baseStatus = projectTemporalLyapunovFieldStatus(project, base, options.transfers);
  if (baseStatus.status !== "current")
    return unavailable(`base-${baseStatus.reason}`);
  const baseRecipe = base.provenance.operation.parameters.recipe as
    TemporalLyapunovFieldRecipe;
  if (baseRecipe.resolution !== 2 || baseRecipe.maxSteps > 64 ||
      baseRecipe.perturbation <= 0)
    return unavailable("base-grid-or-step-budget-incompatible");
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === base.provenance.operation.parameters.temporalId);
  if (!temporal) return unavailable("temporal-source-missing");
  const coarse = await computeTemporalLyapunovField(project, temporal,
    baseRecipe, options);
  if (!coarse.publication || structuralHash(coarse.publication.summary) !==
      structuralHash(base.summary))
    return unavailable("saved-base-values-changed", coarse);
  const refinedRecipe = { ...baseRecipe, resolution: 4,
    maxSteps: baseRecipe.maxSteps * 2,
    perturbation: baseRecipe.perturbation / 2 };
  const refined = await computeTemporalLyapunovField(project, temporal,
    refinedRecipe, options);
  if (!refined.publication) return unavailable(refined.reason ?? "refinement-unavailable",
    coarse, refined);
  const rows = assessTemporalFtleConvergence(coarse.cells, refined.cells,
    recipe.convergenceTolerance, recipe.profileRow);
  if (rows.every(row => row.status === "unavailable"))
    return unavailable("no-converged-profile-cells", coarse, refined);
  const pin = base.provenance.source;
  const summary = { rows, rowsHash: structuralHash(rows),
    convergedCount: rows.filter(row => row.status === "converged").length,
    gapCount: rows.filter(row => row.status === "unavailable").length,
    axisUnit: String(base.summary.coordinateUnit),
    valueUnit: String(base.summary.exponentUnit),
    timeSteps: [baseRecipe.maxSteps, refinedRecipe.maxSteps],
    perturbations: [baseRecipe.perturbation, refinedRecipe.perturbation],
    resolutions: [2, 4], interpolation: "bilinear-fine-grid" };
  const parameters = { recipe, temporalId: temporal.identity.id,
    temporalHash: temporal.identity.structuralHash,
    temporalGenerationHash: temporal.source.generationHash,
    baseSummaryHash: structuralHash(base.summary),
    refinedRecipe, outputHash: structuralHash(summary) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-ftle-profile.${structuralHash({ pin,
      parameters }).slice(7)}`,
    status: "numerical",
    provenance: { source: pin, operation: { type: "vector3d.temporal-ftle-profile",
      algorithm: "nested-ftle-time-perturbation-spacing", algorithmVersion: "1",
      parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: recipe.convergenceTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary,
    warnings: ["Convergence is tested against one finer discretization; gaps are unavailable, not zero.",
      "Finite-time profile estimates do not certify asymptotic Lyapunov exponents."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, rows, coarse, refined, publication };
}

export function projectTemporalFtleProfileStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-ftle-profile")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const base = project.workspace.results.find(item => item.resultId ===
    (parameters.recipe as { baseResultId?: string } | undefined)?.baseResultId);
  if (!base || structuralHash(base.summary) !== parameters.baseSummaryHash)
    return { status: "withheld" as const, reason: "base-result-changed" };
  const baseStatus = projectTemporalLyapunovFieldStatus(project, base, transfers);
  if (baseStatus.status !== "current") return baseStatus;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === parameters.temporalId);
  if (!temporal || temporal.identity.structuralHash !== parameters.temporalHash ||
      temporal.source.generationHash !== parameters.temporalGenerationHash ||
      result.resultId !== `vector3d.temporal-ftle-profile.${structuralHash({
        pin: result.provenance.source, parameters }).slice(7)}` ||
      structuralHash(result.summary.rows) !== result.summary.rowsHash ||
      structuralHash(result.summary) !== parameters.outputHash)
    return { status: "withheld" as const, reason: "profile-recipe-or-rows-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  return status.status === "current" ? { status: "current" as const, reason: null } :
    { status: "withheld" as const, reason: status.reason };
}

export function upsertProjectTemporalFtleProfile(project: Math3DProject,
  study: TemporalFtleProfileStudy,
  transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "ready" || !study.publication ||
      structuralHash(study.rows) !== study.publication.summary.rowsHash)
    throw new TypeError("Only a complete, measured FTLE profile can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTemporalFtleProfileStatus(current, study.publication,
    transfers);
  if (status.status !== "current")
    throw new TypeError(`FTLE profile withheld: ${status.reason}.`);
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
