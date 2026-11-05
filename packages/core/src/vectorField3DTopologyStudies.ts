import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createVectorField3DDocument, type VectorField3DDocument,
  type VectorField3DSource } from "./vectorField3DDocument";
import { integrateVectorField3DTrajectories, type VectorField3DTrajectory } from
  "./vectorField3DTrajectories";

type Vec3 = readonly [number, number, number];
type Solver = Readonly<{ method: "rk4-step-doubling" | "rk45";
  maxSteps: number; maxTime: number; absoluteTolerance: number;
  relativeTolerance: number }>;
export type BasinMapRecipe = Readonly<{ planeZ: number;
  x: readonly [number, number]; y: readonly [number, number];
  columns: number; rows: number; attractors: readonly Readonly<{
    id: string; position: Vec3 }> []; captureRadius: number; solver: Solver }>;
export type BasinCell = Readonly<{ x: number; y: number;
  state: "attractor" | "inconclusive"; attractorId: string | null;
  reason: "captured" | "boundary" | "nonconvergent" | "solver-stop" }>;
export type BasinMapStudy = Readonly<{ publication: AnalysisResultEnvelope;
  cells: readonly BasinCell[]; totalEvaluations: number }>;
export type PoincareSectionRecipe = Readonly<{ seed: Vec3;
  section: Readonly<{ start: Vec3; end: Vec3;
    normal: readonly [number, number]; direction: "positive" | "negative" }>;
  solver: Solver; maxCrossings: number; tangencyTolerance: number }>;
export type PoincareCrossing = Readonly<{ time: number; position: Vec3;
  sectionDistance: number; normalSpeed: number }>;
export type PoincareStudy = Readonly<{ publication: AnalysisResultEnvelope;
  crossings: readonly PoincareCrossing[]; totalEvaluations: number;
  tangencies: number; outsideSection: number }>;
export type TopologyStudyStatus = Readonly<{ status: "current" | "withheld";
  reason: string | null }>;
const MAX_EVALUATIONS = 250_000;
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((value, i) => value - b[i]!));
const within = (point: Vec3, source: VectorField3DSource) =>
  source.axes.every((axis, i) => point[i]! >= axis.min && point[i]! <= axis.max);
const finiteVec = (value: readonly number[]): value is Vec3 =>
  value.length === 3 && value.every(Number.isFinite);
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);

function validateSource(document: VectorField3DDocument): void {
  if (document.source.field.kind !== "expressions")
    throw new TypeError("Topology studies require a verified analytic vector source.");
  if (new Set(document.source.axes.map(axis => axis.unit)).size !== 1)
    throw new TypeError("Topology studies need one physical coordinate unit.");
}
function validateSolver(solver: Solver): void {
  if (!["rk4-step-doubling", "rk45"].includes(solver.method) ||
      !Number.isInteger(solver.maxSteps) || solver.maxSteps < 16 || solver.maxSteps > 256 ||
      !Number.isFinite(solver.maxTime) || solver.maxTime <= 0 || solver.maxTime > 30 ||
      !Number.isFinite(solver.absoluteTolerance) || solver.absoluteTolerance < 1e-8 ||
      solver.absoluteTolerance > .01 || !Number.isFinite(solver.relativeTolerance) ||
      solver.relativeTolerance < 1e-8 || solver.relativeTolerance > .01)
    throw new RangeError("Topology solver settings exceed the bounded analytic gate.");
}
function solve(document: VectorField3DDocument, seed: Vec3, solver: Solver):
  Readonly<{ path: VectorField3DTrajectory; evaluations: number }> {
  const source = { ...document.source, seeds: [{ id: "topology_seed", position: seed }],
    solver: { method: solver.method, mode: "time-trajectory" as const,
      maxSteps: solver.maxSteps, maxTime: solver.maxTime,
      absoluteTolerance: solver.absoluteTolerance,
      relativeTolerance: solver.relativeTolerance } };
  const temporary = createVectorField3DDocument(source,
    { stableKey: `topology:${document.identity.id}:${structuralHash({ seed, solver })}` });
  const artifact = integrateVectorField3DTrajectories(temporary);
  return { path: artifact.trajectories[0]!, evaluations: artifact.totalEvaluations };
}
function publication(document: VectorField3DDocument, kind: "basin-map" | "poincare-section",
  recipe: BasinMapRecipe | PoincareSectionRecipe,
  summary: Record<string, string | number>, evaluations: number,
  started: number): AnalysisResultEnvelope {
  const pin = document.identity;
  return createAnalysisResultEnvelope({
    resultId: `vector3d.${kind}.${structuralHash({ pin, recipe }).slice(7)}`,
    status: kind === "basin-map" ? "heuristic" : "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: `vector3d.${kind}`, algorithm: kind === "basin-map" ?
        "bounded-attractor-capture" : "oriented-transverse-crossings",
        algorithmVersion: "1", parameters: { recipe } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: recipe.solver.absoluteTolerance,
        relative: recipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" },
      elapsedMs: Math.max(0, Date.now() - started) },
    summary: { ...summary, evaluations, coordinateUnit: document.source.axes[0].unit,
      timeUnit: document.source.timeUnit },
    warnings: kind === "basin-map" ?
      ["Capture is local to the declared attractors and finite integration time; boundary and nonconvergent cells are inconclusive."] :
      ["Crossings are interpolated between accepted trajectory points; tangencies and unobserved later returns are not inferred."],
    diagnostics: [], artifacts: [] });
}

/** Local analytic basin gate. No global attraction claim follows from finite integration. */
export function computeVectorField3DBasinMap(document: VectorField3DDocument,
  recipe: BasinMapRecipe, shouldCancel?: () => boolean): BasinMapStudy {
  validateSource(document); validateSolver(recipe.solver);
  if (!Number.isInteger(recipe.columns) || recipe.columns < 3 || recipe.columns > 7 ||
      !Number.isInteger(recipe.rows) || recipe.rows < 3 || recipe.rows > 7 ||
      !Number.isFinite(recipe.planeZ) ||
      !Array.isArray(recipe.x) || recipe.x.length !== 2 ||
      !Array.isArray(recipe.y) || recipe.y.length !== 2 ||
      !recipe.x.every(Number.isFinite) || !recipe.y.every(Number.isFinite) ||
      recipe.x[0] >= recipe.x[1] || recipe.y[0] >= recipe.y[1] ||
      !Number.isFinite(recipe.captureRadius) || recipe.captureRadius <= 0 ||
      recipe.attractors.length < 2 || recipe.attractors.length > 4 ||
      new Set(recipe.attractors.map(item => item.id)).size !== recipe.attractors.length ||
      recipe.attractors.some(item => !/^[A-Za-z0-9_-]{1,40}$/.test(item.id) ||
        !finiteVec(item.position) || !within(item.position, document.source)) ||
      !within([recipe.x[0], recipe.y[0], recipe.planeZ], document.source) ||
      !within([recipe.x[1], recipe.y[1], recipe.planeZ], document.source))
    throw new RangeError("Basin seed grid, attractors or capture radius are invalid.");
  const started = Date.now();
  let evaluations = 0;
  const cells: BasinCell[] = [];
  for (let row = 0; row < recipe.rows; row++) for (let column = 0;
      column < recipe.columns; column++) {
    if (shouldCancel?.()) throw new Error("Basin map cancelled.");
    const x = recipe.x[0] + (recipe.x[1] - recipe.x[0]) * column /
      (recipe.columns - 1);
    const y = recipe.y[0] + (recipe.y[1] - recipe.y[0]) * row /
      (recipe.rows - 1);
    const { path, evaluations: work } = solve(document, [x, y, recipe.planeZ],
      recipe.solver);
    evaluations += work;
    if (evaluations > MAX_EVALUATIONS) throw new RangeError("Basin work budget reached.");
    const endpoint = path.points.at(-1)!.position;
    const candidates = recipe.attractors.filter(item =>
      distance(endpoint, item.position) <= recipe.captureRadius);
    const captured = candidates.length === 1 &&
      Math.abs(endpoint[2] - recipe.planeZ) <= recipe.captureRadius;
    cells.push({ x, y, state: captured ? "attractor" : "inconclusive",
      attractorId: captured ? candidates[0]!.id : null,
      reason: captured ? "captured" : path.stopReason === "time-limit" ||
        path.stopReason === "step-limit" ? "nonconvergent" : "solver-stop" });
  }
  const rawCells = [...cells];
  for (let row = 0; row < recipe.rows; row++) for (let column = 0;
      column < recipe.columns; column++) {
    const index = row * recipe.columns + column, cell = rawCells[index]!;
    if (cell.state !== "attractor") continue;
    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([dx, dy]) => {
      const x = column + dx!, y = row + dy!;
      return x >= 0 && x < recipe.columns && y >= 0 && y < recipe.rows ?
        [rawCells[y * recipe.columns + x]!] : [];
    });
    if (neighbors.some(item => item.state === "attractor" &&
        item.attractorId !== cell.attractorId))
      cells[index] = { ...cell, state: "inconclusive", attractorId: null,
        reason: "boundary" };
  }
  const counts = { captured: cells.filter(cell => cell.state === "attractor").length,
    boundary: cells.filter(cell => cell.reason === "boundary").length,
    inconclusive: cells.filter(cell => cell.state === "inconclusive").length };
  return { cells, totalEvaluations: evaluations,
    publication: publication(document, "basin-map", recipe,
      { ...counts, seedCount: cells.length,
        classificationHash: structuralHash(cells) }, evaluations, started) };
}

/** Oriented finite segment crossing; tangential or unresolved events are withheld. */
export function computeVectorField3DPoincareSection(document: VectorField3DDocument,
  recipe: PoincareSectionRecipe, shouldCancel?: () => boolean): PoincareStudy {
  validateSource(document); validateSolver(recipe.solver);
  const { start, end, normal, direction } = recipe.section;
  if (!finiteVec(recipe.seed) || !finiteVec(start) || !finiteVec(end) ||
      !within(recipe.seed, document.source) || !within(start, document.source) ||
      !within(end, document.source) || start[2] !== end[2] ||
      recipe.seed[2] !== start[2] ||
      !Array.isArray(normal) || normal.length !== 2 ||
      !normal.every(Number.isFinite) ||
      Math.abs(Math.hypot(...normal) - 1) > 1e-6 ||
      Math.abs((end[0] - start[0]) * normal[0] +
        (end[1] - start[1]) * normal[1]) > 1e-6 ||
      distance(start, end) <= 1e-9 ||
      !["positive", "negative"].includes(direction) ||
      !Number.isInteger(recipe.maxCrossings) || recipe.maxCrossings < 1 ||
      recipe.maxCrossings > 64 || !Number.isFinite(recipe.tangencyTolerance) ||
      recipe.tangencyTolerance <= 0 || recipe.tangencyTolerance > .1)
    throw new RangeError("Poincaré section geometry, orientation or budget is invalid.");
  const started = Date.now();
  const { path, evaluations } = solve(document, recipe.seed, recipe.solver);
  if (evaluations > MAX_EVALUATIONS) throw new RangeError("Section work budget reached.");
  const crossings: PoincareCrossing[] = [];
  const signed = (point: Vec3) => (point[0] - start[0]) * normal[0] +
    (point[1] - start[1]) * normal[1];
  const length2 = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  let tangencies = 0, outsideSection = 0;
  for (let index = 1; index < path.points.length; index++) {
    if (shouldCancel?.()) throw new Error("Poincaré section cancelled.");
    const a = path.points[index - 1]!, b = path.points[index]!;
    const sa = signed(a.position), sb = signed(b.position);
    if (sa * sb > 0 || sa === sb) continue;
    const dt = b.time - a.time;
    if (dt <= 0) continue;
    const speed = (sb - sa) / dt;
    if (direction === "positive" ? speed <= 0 : speed >= 0) continue;
    if (Math.abs(speed) <= recipe.tangencyTolerance) { tangencies++; continue; }
    const fraction = sa / (sa - sb);
    if (fraction < 0 || fraction > 1) continue;
    const position = [0, 1, 2].map(axis => a.position[axis]! +
      fraction * (b.position[axis]! - a.position[axis]!)) as unknown as Vec3;
    const along = ((position[0] - start[0]) * (end[0] - start[0]) +
      (position[1] - start[1]) * (end[1] - start[1])) / length2;
    if (along < 0 || along > 1) { outsideSection++; continue; }
    const time = a.time + fraction * dt;
    if (time <= 1e-9 || crossings.at(-1) &&
        time - crossings.at(-1)!.time <= Math.max(1e-9, dt * .5)) continue;
    crossings.push({ time, position, sectionDistance: Math.sqrt(length2) * along,
      normalSpeed: speed });
    if (crossings.length >= recipe.maxCrossings) break;
  }
  return { crossings, totalEvaluations: evaluations, tangencies, outsideSection,
    publication: publication(document, "poincare-section", recipe,
      { crossingCount: crossings.length, tangencies, outsideSection,
        stopReason: path.stopReason, rowsHash: structuralHash(crossings) },
      evaluations, started) };
}

export function projectVectorField3DTopologyStatus(project: Math3DProject,
  result: AnalysisResultEnvelope): TopologyStudyStatus {
  const kind = result.provenance.operation.type;
  if (kind !== "vector3d.basin-map" && kind !== "vector3d.poincare-section")
    return { status: "withheld", reason: "wrong-result-type" };
  const source = result.provenance.source;
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === source.documentId);
  if (!entry || entry.checkpoint.format !== "math3d.vector-field3d-document")
    return { status: "withheld", reason: "source-missing" };
  const document = entry.checkpoint;
  if (entry.expected.revision !== document.identity.revision ||
      entry.expected.structuralHash !== document.identity.structuralHash ||
      document.identity.revision !== source.revision ||
      document.identity.structuralHash !== source.structuralHash ||
      source.generation !== source.revision)
    return { status: "withheld", reason: "source-changed" };
  if (document.source.field.kind !== "expressions")
    return { status: "withheld", reason: "source-unverified" };
  const recipe = result.provenance.operation.parameters.recipe;
  if (result.resultId !== `vector3d.${kind.slice(9)}.${structuralHash({ pin: document.identity,
      recipe }).slice(7)}`)
    return { status: "withheld", reason: "recipe-changed" };
  return { status: "current", reason: null };
}

export function upsertProjectVectorField3DTopologyStudy(project: Math3DProject,
  result: AnalysisResultEnvelope): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectVectorField3DTopologyStatus(current, result);
  if (status.status !== "current")
    throw new TypeError(`Topology study withheld: ${status.reason}.`);
  const document = current.workspace.entries.find(item => item.expected.id ===
    result.provenance.source.documentId)!.checkpoint as VectorField3DDocument;
  const recipe = result.provenance.operation.parameters.recipe;
  const expected = result.provenance.operation.type === "vector3d.basin-map" ?
    computeVectorField3DBasinMap(document, recipe as BasinMapRecipe).publication :
    computeVectorField3DPoincareSection(document, recipe as PoincareSectionRecipe).publication;
  if (!same(expected.summary, result.summary) || expected.resultId !== result.resultId)
    throw new TypeError("Topology study summary differs from its saved source and recipe.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== result.resultId), result] }));
}
