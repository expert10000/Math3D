import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import type { VectorField3DDocument } from "./vectorField3DDocument";
import { computeVectorField3DPoincareSection, projectVectorField3DTopologyStatus,
  type PoincareSectionRecipe } from "./vectorField3DTopologyStudies";

export type PoincareReturnRow = Readonly<{ id: string; x: number; y: number;
  firstTime: number; nextTime: number }>;
export type PoincareReturnStudy = Readonly<{
  status: "ready" | "unavailable"; reason: string | null;
  rows: readonly PoincareReturnRow[]; crossingCount: number;
  maxRefinementDifference: number; evaluations: number;
  publication: AnalysisResultEnvelope | null;
}>;
type ReturnRecipe = Readonly<{ sectionResultId: string; sectionSummaryHash: string;
  convergenceTolerance: number }>;
const MAX_EVALUATIONS = 500_000;

const unavailable = (reason: string, crossingCount = 0,
  evaluations = 0, maxRefinementDifference = 0): PoincareReturnStudy =>
  ({ status: "unavailable", reason, rows: [], crossingCount,
    evaluations, maxRefinementDifference, publication: null });

/** The saved GF-42 section is the only admission path for a return map. */
export function computeVectorField3DPoincareReturnMap(project: Math3DProject,
  sectionResultId: string, convergenceTolerance = .02,
  shouldCancel?: () => boolean): PoincareReturnStudy {
  if (!Number.isFinite(convergenceTolerance) || convergenceTolerance < 1e-5 ||
      convergenceTolerance > .1)
    throw new RangeError("Return-map convergence tolerance must be between 1e-5 and 0.1.");
  const section = project.workspace.results.find(item => item.resultId === sectionResultId);
  if (!section || section.provenance.operation.type !== "vector3d.poincare-section")
    return unavailable("saved-section-missing");
  const sourceStatus = projectVectorField3DTopologyStatus(project, section);
  if (sourceStatus.status !== "current") return unavailable(sourceStatus.reason!);
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === section.provenance.source.documentId);
  const document = entry!.checkpoint as VectorField3DDocument;
  const recipe = section.provenance.operation.parameters.recipe as PoincareSectionRecipe;
  const first = computeVectorField3DPoincareSection(document, recipe, shouldCancel);
  if (structuralHash(first.publication.summary) !== structuralHash(section.summary))
    return unavailable("saved-crossings-changed", first.crossings.length,
      first.totalEvaluations);
  if (first.crossings.length < 3)
    return unavailable("fewer-than-three-crossings", first.crossings.length,
      first.totalEvaluations);
  if (first.crossings.length >= recipe.maxCrossings)
    return unavailable("crossing-cap-reached", first.crossings.length,
      first.totalEvaluations);
  if (first.tangencies || first.outsideSection)
    return unavailable("ambiguous-or-outside-section-event", first.crossings.length,
      first.totalEvaluations);
  if (first.publication.summary.stopReason !== "time-limit")
    return unavailable("trajectory-ended-before-time-limit", first.crossings.length,
      first.totalEvaluations);
  if (shouldCancel?.()) throw new Error("Return-map computation cancelled.");
  const refined = computeVectorField3DPoincareSection(document, { ...recipe,
    solver: { ...recipe.solver,
      absoluteTolerance: Math.max(1e-8, recipe.solver.absoluteTolerance / 4),
      relativeTolerance: Math.max(1e-8, recipe.solver.relativeTolerance / 4) } }, shouldCancel);
  const evaluations = first.totalEvaluations + refined.totalEvaluations;
  if (evaluations > MAX_EVALUATIONS)
    return unavailable("work-budget-reached", first.crossings.length, evaluations);
  if (refined.crossings.length !== first.crossings.length || refined.tangencies ||
      refined.outsideSection || refined.publication.summary.stopReason !== "time-limit")
    return unavailable("crossing-sequence-did-not-converge", first.crossings.length,
      evaluations);
  const segment = recipe.section.start.map((value, index) =>
    recipe.section.end[index]! - value);
  const length = Math.hypot(...segment);
  let maxRefinementDifference = 0;
  for (let index = 0; index < first.crossings.length; index++) {
    const a = first.crossings[index]!, b = refined.crossings[index]!;
    const difference = Math.max(Math.abs(a.time - b.time) /
      Math.max(1, recipe.solver.maxTime),
      Math.abs(a.sectionDistance - b.sectionDistance) / length);
    maxRefinementDifference = Math.max(maxRefinementDifference, difference);
    if (difference > convergenceTolerance ||
        index > 0 && (a.time <= first.crossings[index - 1]!.time ||
          b.time <= refined.crossings[index - 1]!.time))
      return unavailable("crossing-sequence-did-not-converge", first.crossings.length,
        evaluations, maxRefinementDifference);
  }
  const rows = first.crossings.slice(0, -1).map((crossing, index) => ({
    id: `row_${index + 1}`, x: crossing.sectionDistance,
    y: first.crossings[index + 1]!.sectionDistance,
    firstTime: crossing.time, nextTime: first.crossings[index + 1]!.time }));
  const returnRecipe: ReturnRecipe = { sectionResultId,
    sectionSummaryHash: structuralHash(section.summary), convergenceTolerance };
  const pin = document.identity;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.poincare-return-map.${structuralHash({ pin,
      recipe: returnRecipe }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: "vector3d.poincare-return-map",
        algorithm: "directed-section-pairs-with-refinement", algorithmVersion: "1",
        parameters: { recipe: returnRecipe } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: recipe.solver.absoluteTolerance,
        relative: recipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { crossingCount: first.crossings.length, rowCount: rows.length,
      rowsHash: structuralHash(rows), maxRefinementDifference,
      evaluations, coordinateUnit: document.source.axes[0].unit,
      timeUnit: document.source.timeUnit },
    warnings: ["Finite-time return samples are not a periodic-orbit or global recurrence proof.",
      "Matching refinements cannot prove that no crossing was missed between solver samples."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, rows, crossingCount: first.crossings.length,
    maxRefinementDifference, evaluations, publication };
}

export function projectPoincareReturnStatus(project: Math3DProject,
  result: AnalysisResultEnvelope): Readonly<{ status: "current" | "withheld";
  reason: string | null }> {
  if (result.provenance.operation.type !== "vector3d.poincare-return-map")
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
  const recipe = result.provenance.operation.parameters.recipe as ReturnRecipe;
  if (!recipe || typeof recipe.sectionResultId !== "string" ||
      typeof recipe.sectionSummaryHash !== "string" ||
      typeof recipe.convergenceTolerance !== "number")
    return { status: "withheld", reason: "recipe-invalid" };
  const section = project.workspace.results.find(item => item.resultId ===
    recipe?.sectionResultId);
  if (!section || structuralHash(section.summary) !== recipe.sectionSummaryHash)
    return { status: "withheld", reason: "saved-section-changed" };
  const sectionStatus = projectVectorField3DTopologyStatus(project, section);
  if (sectionStatus.status !== "current") return sectionStatus;
  if (result.resultId !== `vector3d.poincare-return-map.${structuralHash({
      pin: entry.checkpoint.identity, recipe }).slice(7)}`)
    return { status: "withheld", reason: "recipe-changed" };
  return { status: "current", reason: null };
}

export function upsertProjectPoincareReturnMap(project: Math3DProject,
  study: PoincareReturnStudy): Math3DProject {
  if (!study.publication || study.status !== "ready")
    throw new TypeError("Only a converged return map can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectPoincareReturnStatus(current, study.publication);
  if (status.status !== "current")
    throw new TypeError(`Return map withheld: ${status.reason}.`);
  const recipe = study.publication.provenance.operation.parameters.recipe as ReturnRecipe;
  const expected = computeVectorField3DPoincareReturnMap(current,
    recipe.sectionResultId, recipe.convergenceTolerance);
  if (expected.status !== "ready" || !expected.publication ||
      structuralHash(expected.publication.summary) !==
        structuralHash(study.publication.summary))
    throw new TypeError("Return-map rows differ from the saved section and source.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
