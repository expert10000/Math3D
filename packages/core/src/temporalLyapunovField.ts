import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createVerifiedTemporalFieldSampler, projectTemporalFieldSourceStatus,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
export type TemporalLyapunovFieldRecipe = Readonly<{ normalAxis: 0 | 1 | 2;
  coordinate: number; resolution: number; startTime: number; endTime: number;
  perturbation: number; maxSteps: number; method: "fixed-rk4-cauchy-green" }>;
export type TemporalLyapunovCell = Readonly<{ seed: Vec3; estimate: number;
  uncertainty: number }>;
export type TemporalLyapunovFieldStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; cells: readonly TemporalLyapunovCell[];
  evaluations: number; publication: AnalysisResultEnvelope | null }>;
export type TemporalLyapunovFieldOptions = Readonly<{ transfers?: VerifiedTemporalTransfers;
  shouldCancel?: () => boolean; onProgress?: (completed: number, total: number) => void;
  currentProject?: () => Math3DProject;
  verifyBeforePublish?: () => Promise<VerifiedTemporalTransfers | undefined> }>;

const add = (a: Vec3, b: Vec3, h: number): Vec3 =>
  [a[0] + b[0] * h, a[1] + b[1] * h, a[2] + b[2] * h];
const inside = (source: VectorField3DDocument, point: Vec3) =>
  point.every((value, axis) => Number.isFinite(value) &&
    value >= source.source.axes[axis]!.min && value <= source.source.axes[axis]!.max);
const unavailable = (reason: string, evaluations = 0): TemporalLyapunovFieldStudy =>
  ({ status: "unavailable", reason, cells: [], evaluations, publication: null });

// Jacobi diagonalization of the symmetric Cauchy–Green tensor. Repeated
// eigenvalues are permitted: FTLE needs the largest stretch, not its direction.
const largestStretch = (columns: readonly Vec3[]) => {
  const a = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) =>
    columns[i]!.reduce((sum, value, k) => sum + value * columns[j]![k]!, 0)));
  for (let sweep = 0; sweep < 24; sweep++) {
    let changed = false;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const off = a[p]![q]!;
      const scale = Math.max(1e-300, ...a.flat().map(Math.abs));
      if (Math.abs(off) <= scale * 1e-13) continue;
      changed = true;
      const angle = .5 * Math.atan2(2 * off, a[q]![q]! - a[p]![p]!);
      const c = Math.cos(angle), s = Math.sin(angle);
      for (let k = 0; k < 3; k++) {
        const ap = a[k]![p]!, aq = a[k]![q]!;
        a[k]![p] = c * ap - s * aq; a[k]![q] = s * ap + c * aq;
      }
      for (let k = 0; k < 3; k++) {
        const ap = a[p]![k]!, aq = a[q]![k]!;
        a[p]![k] = c * ap - s * aq; a[q]![k] = s * ap + c * aq;
      }
    }
    if (!changed) break;
  }
  const eigenvalue = Math.max(a[0]![0]!, a[1]![1]!, a[2]![2]!);
  return Number.isFinite(eigenvalue) && eigenvalue > 0 ? Math.sqrt(eigenvalue) : null;
};

/** Small, cancellable FTLE slice; missing samples never produce partial values. */
export async function computeTemporalLyapunovField(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, recipe: TemporalLyapunovFieldRecipe,
  options: TemporalLyapunovFieldOptions = {}): Promise<TemporalLyapunovFieldStudy> {
  const first = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]?.documentId)?.checkpoint;
  if (first?.format !== "math3d.vector-field3d-document") return unavailable("first-frame-missing");
  const axes = first.source.axes;
  const span = Math.min(...axes.map(axis => axis.max - axis.min));
  if (recipe.method !== "fixed-rk4-cauchy-green" ||
      ![0, 1, 2].includes(recipe.normalAxis) || !Number.isFinite(recipe.coordinate) ||
      recipe.coordinate <= axes[recipe.normalAxis].min ||
      recipe.coordinate >= axes[recipe.normalAxis].max ||
      !Number.isSafeInteger(recipe.resolution) || recipe.resolution < 2 ||
      recipe.resolution > 4 || !Number.isSafeInteger(recipe.maxSteps) ||
      recipe.maxSteps < 8 || recipe.maxSteps > 128 ||
      !Number.isFinite(recipe.startTime) || !Number.isFinite(recipe.endTime) ||
      recipe.startTime < temporal.source.frames[0]!.time ||
      recipe.endTime > temporal.source.frames.at(-1)!.time ||
      recipe.startTime >= recipe.endTime ||
      !Number.isFinite(recipe.perturbation) || recipe.perturbation < span * 1e-5 ||
      recipe.perturbation > span * .01)
    throw new RangeError("FTLE field requires a 2–4 seed grid, 8–128 steps and a bounded physical interval.");
  const coordinateUnit = axes[0].unit;
  const componentUnits = first.source.field.kind === "expressions" ?
    first.source.field.components.map(item => item.unit) : first.source.field.componentUnits;
  if (axes.some(axis => axis.unit !== coordinateUnit) ||
      componentUnits.some(unit => unit !== `${coordinateUnit}/${temporal.source.timeAxis.unit}`))
    return unavailable("velocity-units-must-match-coordinate-per-time");
  if (temporal.source.timeAxis.interpolation !== "linear")
    return unavailable("linear-time-interpolation-required");
  const sourceStatus = projectTemporalFieldSourceStatus(project, temporal, options.transfers);
  if (sourceStatus.status !== "current") return unavailable(sourceStatus.reason ?? "source-unverified");
  const sample = createVerifiedTemporalFieldSampler(project, temporal, options.transfers);
  const live = () => {
    if (options.shouldCancel?.()) throw new Error("FTLE field cancelled.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, options.transfers);
    if (status.status !== "current") throw new TypeError(`FTLE field withheld: ${status.reason}.`);
  };
  let evaluations = 0;
  const h = (recipe.endTime - recipe.startTime) / recipe.maxSteps;
  const flow = (seed: Vec3): Vec3 | null => {
    if (!inside(first, seed)) return null;
    let point = seed;
    for (let step = 0; step < recipe.maxSteps; step++) {
      if (options.shouldCancel?.()) throw new Error("FTLE field cancelled.");
      const t = recipe.startTime + step * h;
      const velocity = (time: number, position: Vec3) => {
        if (!inside(first, position)) return null;
        evaluations++;
        if (evaluations > 60_000) throw new RangeError("FTLE work budget reached.");
        return sample(time, position).vector;
      };
      const k1 = velocity(t, point); if (!k1) return null;
      const k2 = velocity(t + h / 2, add(point, k1, h / 2)); if (!k2) return null;
      const k3 = velocity(t + h / 2, add(point, k2, h / 2)); if (!k3) return null;
      const k4 = velocity(t + h, add(point, k3, h)); if (!k4) return null;
      point = [0, 1, 2].map(axis => point[axis]! + h *
        (k1[axis]! + 2 * k2[axis]! + 2 * k3[axis]! + k4[axis]!) / 6) as
        unknown as Vec3;
      if (!inside(first, point)) return null;
    }
    return point;
  };
  const axesInPlane = [0, 1, 2].filter(axis => axis !== recipe.normalAxis);
  const cells: TemporalLyapunovCell[] = [];
  const total = recipe.resolution ** 2;
  for (let index = 0; index < total; index++) {
    live();
    const seed: number[] = [0, 0, 0]; seed[recipe.normalAxis] = recipe.coordinate;
    for (const [slot, axis] of axesInPlane.entries()) {
      const bounds = axes[axis]!;
      seed[axis] = bounds.min + (bounds.max - bounds.min) *
        (Math.floor(index / recipe.resolution ** slot) % recipe.resolution + 1) /
        (recipe.resolution + 1);
    }
    const center = seed as unknown as Vec3;
    const base = flow(center);
    if (!base) return unavailable("trajectory-left-domain", evaluations);
    const estimateAt = (delta: number) => {
      const columns: Vec3[] = [];
      for (let axis = 0; axis < 3; axis++) {
        const displaced = add(center, [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0,
          axis === 2 ? 1 : 0], delta);
        const endpoint = flow(displaced);
        if (!endpoint) return null;
        columns.push(endpoint.map((value, i) => (value - base[i]!) / delta) as
          unknown as Vec3);
      }
      const stretch = largestStretch(columns);
      return stretch ? Math.log(stretch) / (recipe.endTime - recipe.startTime) : null;
    };
    const coarse = estimateAt(recipe.perturbation);
    const fine = estimateAt(recipe.perturbation / 2);
    if (coarse === null || fine === null || !Number.isFinite(fine))
      return unavailable("stretch-unresolved-or-incomplete", evaluations);
    cells.push({ seed: center, estimate: fine,
      uncertainty: Math.abs(fine - coarse) });
    options.onProgress?.(index + 1, total);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  live();
  if (temporal.schemaVersion === 3) {
    if (!options.verifyBeforePublish) return unavailable("final-frame-verification-required", evaluations);
    const final = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, await options.verifyBeforePublish());
    if (final.status !== "current") return unavailable(`final-${final.reason}`, evaluations);
  }
  live();
  const pin = temporal.identity;
  const firstFrame = temporal.source.frames[0]!;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-ftle-field.${structuralHash({ pin, recipe }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: firstFrame.documentId as `math3d:${string}:${string}`,
      revision: firstFrame.revision,
      structuralHash: firstFrame.structuralHash as `sha256:${string}`,
      generation: firstFrame.revision },
      operation: { type: "vector3d.temporal-ftle-field",
        algorithm: "finite-difference-cauchy-green-rk4", algorithmVersion: "1",
        parameters: { recipe, temporalId: pin.id, temporalRevision: pin.revision,
          temporalHash: pin.structuralHash,
          temporalGenerationHash: temporal.source.generationHash } },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { cells, cellCount: cells.length, evaluations,
      exponentUnit: `1/${temporal.source.timeAxis.unit}`,
      coordinateUnit, timeUnit: temporal.source.timeAxis.unit,
      coverage: "complete", frameIds: temporal.source.frames.map(frame => frame.documentId) },
    warnings: ["Finite-time estimate only; two perturbation scales give a numerical indicator, not a certified error bound."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, cells, evaluations, publication };
}

export function projectTemporalLyapunovFieldStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-ftle-field")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === parameters.temporalId);
  if (!temporal) return { status: "withheld" as const, reason: "temporal-source-missing" };
  const pin = result.provenance.source;
  const recipe = parameters.recipe;
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe))
    return { status: "withheld" as const, reason: "recipe-invalid" };
  const firstFrame = temporal.source.frames[0]!;
  if (pin.documentId !== firstFrame.documentId ||
      pin.revision !== firstFrame.revision ||
      pin.structuralHash !== firstFrame.structuralHash ||
      pin.generation !== firstFrame.revision ||
      parameters.temporalRevision !== temporal.identity.revision ||
      parameters.temporalHash !== temporal.identity.structuralHash ||
      parameters.temporalGenerationHash !==
        temporal.source.generationHash ||
      result.resultId !== `vector3d.temporal-ftle-field.${structuralHash({
        pin: temporal.identity, recipe }).slice(7)}`)
    return { status: "withheld" as const, reason: "temporal-recipe-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  return status.status === "current" ? { status: "current" as const, reason: null } :
    { status: "withheld" as const, reason: status.reason };
}

export function upsertProjectTemporalLyapunovField(project: Math3DProject,
  study: TemporalLyapunovFieldStudy,
  transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "ready" || !study.publication)
    throw new TypeError("Only a complete FTLE field can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const result = study.publication;
  if (result.summary.cellCount !== study.cells.length ||
      structuralHash(result.summary.cells) !== structuralHash(study.cells) ||
      result.summary.coverage !== "complete")
    throw new TypeError("FTLE cell summary differs from the measured field.");
  const temporal = current.workspace.timeSources?.find(item =>
    item.identity.id === result.provenance.operation.parameters.temporalId);
  if (projectTemporalLyapunovFieldStatus(current, result, transfers).status !== "current")
    throw new TypeError("FTLE source is unverified or changed before save.");
  if (!temporal || result.provenance.source.structuralHash !==
      temporal.source.frames[0]!.structuralHash || result.resultId !==
      `vector3d.temporal-ftle-field.${structuralHash({ pin: temporal.identity,
        recipe: result.provenance.operation.parameters.recipe }).slice(7)}`)
    throw new TypeError("FTLE source or recipe changed before save.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== result.resultId), result] }));
}
