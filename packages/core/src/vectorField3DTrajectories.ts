import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { normalizeVectorField3DDocument, type VectorField3DDocument,
  type VectorField3DSource } from "./vectorField3DDocument";
import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";
import { scientificPointWithinBounds } from "./scientificDatasetCoordinates";
import { VectorField3DVerifiedTileCache } from "./vectorField3DVerifiedTileCache";

type Vec3 = readonly [number, number, number];
export type VectorField3DStopReason = "boundary" | "stationary" | "undefined" | "step-limit" |
  "time-limit" | "line-limit" | "length-limit" | "cancelled" | "solver-failure";
export type VectorField3DTrajectory = Readonly<{
  seedId: string; direction: "forward" | "backward";
  points: readonly Readonly<{ position: Vec3; time: number; arcLength: number }>[];
  acceptedSteps: number; rejectedSteps: number; evaluations: number;
  stopReason: VectorField3DStopReason; maxEstimatedLocalError: number;
  stopDetail: string;
}>;
export type VectorField3DTrajectoryArtifact = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  solver: Readonly<{ method: "adaptive-rk4-step-doubling" | "adaptive-rk45";
    mode: "time-trajectory" | "normalized-field-line";
    parameterLimit: number; parameterUnit: string; absoluteTolerance: number;
    relativeTolerance: number; maxSteps: number; maxTime: number; maxArcLength: number;
    maxEvaluations: number }>;
  trajectories: readonly VectorField3DTrajectory[];
  totalEvaluations: number;
  verifiedTiles?: readonly Readonly<{ name: string; resourceSha256: string;
    verifiedTiles: number; totalTiles: number; tileIndices: readonly number[];
    tileSha256: readonly string[]; tileSetSha256: string }>[];
  sourceHash?: string; residentTileBytes?: number;
}>;
export type VectorField3DTrajectoryOptions = Readonly<{
  direction?: "forward" | "backward";
  seedIds?: readonly string[];
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number, trajectory: VectorField3DTrajectory) => void;
}>;

export const vectorField3DTolerancePresets = {
  exploratory: { absoluteTolerance: 1e-4, relativeTolerance: 1e-4 },
  balanced: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6 },
  precise: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8 },
} as const;
export type VectorField3DTolerancePreset = keyof typeof vectorField3DTolerancePresets;
export function vectorField3DTolerancePresetOf(solver: VectorField3DSource["solver"]):
  VectorField3DTolerancePreset | "custom" {
  return (Object.keys(vectorField3DTolerancePresets) as VectorField3DTolerancePreset[])
    .find(name => solver.absoluteTolerance === vectorField3DTolerancePresets[name].absoluteTolerance &&
      solver.relativeTolerance === vectorField3DTolerancePresets[name].relativeTolerance) ?? "custom";
}

const add = (a: Vec3, b: Vec3, scale: number): Vec3 =>
  [a[0] + scale * b[0], a[1] + scale * b[1], a[2] + scale * b[2]];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finiteVector = (vector: readonly number[]): vector is Vec3 =>
  vector.length === 3 && vector.every(Number.isFinite);
const within = (point: Vec3, axes: VectorField3DSource["axes"]) =>
  scientificPointWithinBounds(point, axes);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function vectorField3DSeedPreset(source: VectorField3DSource,
  kind: "ring-8" | "line-5" | "plane-9"): readonly Vec3[] {
  const centers = source.axes.map(axis => (axis.min + axis.max) / 2);
  const spans = source.axes.map(axis => axis.max - axis.min);
  if (kind === "line-5")
    return [-.25, -.125, 0, .125, .25].map(fraction =>
      [centers[0]! + spans[0]! * fraction, centers[1]!, centers[2]!] as Vec3);
  if (kind === "ring-8") {
    const radius = Math.min(spans[0]!, spans[1]!) / 4;
    return Array.from({ length: 8 }, (_, index) => {
      const angle = index * Math.PI / 4;
      return [centers[0]! + radius * Math.cos(angle),
        centers[1]! + radius * Math.sin(angle), centers[2]!] as Vec3;
    });
  }
  return [-.25, 0, .25].flatMap(x => [-.25, 0, .25].map(y =>
    [centers[0]! + spans[0]! * x, centers[1]! + spans[1]! * y,
      centers[2]!] as Vec3));
}

type Evaluation = (point: Vec3) => Vec3 | null;
type Step = { ok: true; point: Vec3 } | { ok: false; reason: "boundary" | "undefined" };

function integrateWith(document: VectorField3DDocument, evaluateField: Evaluation,
  options: VectorField3DTrajectoryOptions): VectorField3DTrajectoryArtifact {
  const source = document.source, direction = options.direction ?? "forward";
  if (direction !== "forward" && direction !== "backward") throw new TypeError("Invalid trajectory direction.");
  if (new Set(source.axes.map(axis => axis.unit)).size !== 1)
    throw new TypeError("Trajectory arc length requires matching coordinate-axis units.");
  const sign = direction === "forward" ? 1 : -1;
  const mode = source.solver.mode ?? "time-trajectory";
  const normalized = mode === "normalized-field-line";
  const parameterLimit = normalized ? source.solver.maxLineLength ?? 20 : source.solver.maxTime;
  const parameterUnit = normalized ? source.axes[0].unit : source.timeUnit;
  const maximumSteps = Math.min(source.solver.maxSteps, 2048);
  const selected = options.seedIds ? new Set(options.seedIds) : null;
  const seeds = selected ? source.seeds.filter(seed => selected.has(seed.id)) : source.seeds;
  if (selected && (seeds.length !== selected.size || !seeds.length))
    throw new TypeError("Trajectory seed selection does not match the document.");
  const maximumArc = source.solver.maxArcLength ?? 1e6;
  const maximumEvaluationsPerSeed = Math.min(150_000, 1 + maximumSteps * 17);
  const maximumEvaluations = maximumEvaluationsPerSeed * Math.max(seeds.length, 1);
  const useRk45 = source.solver.method === "rk45";
  let totalEvaluations = 0;
  const trajectories: VectorField3DTrajectory[] = [];
  for (const seed of seeds) {
    let evaluations = 0, acceptedSteps = 0, rejectedSteps = 0, maxEstimatedLocalError = 0;
    let point = [...seed.position] as Vec3;
    let elapsed = 0, arcLength = 0;
    let stepSize = parameterLimit / 32;
    const minimumStep = Math.max(1e-12, parameterLimit * 1e-12);
    const points: { position: Vec3; time: number; arcLength: number }[] =
      [{ position: point, time: 0, arcLength: 0 }];
    const evaluate = (candidate: Vec3): Step & { vector?: Vec3; rawSpeed?: number } => {
      if (!within(candidate, source.axes)) return { ok: false, reason: "boundary" };
      if (evaluations >= maximumEvaluationsPerSeed) return { ok: false, reason: "undefined" };
      evaluations++; totalEvaluations++;
      const vector = evaluateField(candidate);
      if (!vector || !finiteVector(vector)) return { ok: false, reason: "undefined" };
      const rawSpeed = Math.hypot(...vector);
      return { ok: true, point: candidate,
        vector: normalized && rawSpeed > 0 ? vector.map(value => value / rawSpeed) as
          unknown as Vec3 : vector, rawSpeed };
    };
    const rk4 = (start: Vec3, dt: number): Step => {
      const a = evaluate(start); if (!a.ok) return a;
      const b = evaluate(add(start, a.vector!, dt / 2)); if (!b.ok) return b;
      const c = evaluate(add(start, b.vector!, dt / 2)); if (!c.ok) return c;
      const d = evaluate(add(start, c.vector!, dt)); if (!d.ok) return d;
      return { ok: true, point: [0, 1, 2].map(axis => start[axis]! + dt / 6 *
        (a.vector![axis]! + 2 * b.vector![axis]! + 2 * c.vector![axis]! + d.vector![axis]!)) as
        unknown as Vec3 };
    };
    const rk45 = (start: Vec3, dt: number): Step & { error?: number } => {
      const stage = (terms: readonly (readonly [number, Vec3])[]) =>
        evaluate([0, 1, 2].map(axis => start[axis]! + dt * terms.reduce((sum, [weight, vector]) =>
          sum + weight * vector[axis]!, 0)) as unknown as Vec3);
      const a = evaluate(start); if (!a.ok) return a;
      const b = stage([[1 / 5, a.vector!]]); if (!b.ok) return b;
      const c = stage([[3 / 40, a.vector!], [9 / 40, b.vector!]]); if (!c.ok) return c;
      const d = stage([[44 / 45, a.vector!], [-56 / 15, b.vector!], [32 / 9, c.vector!]]);
      if (!d.ok) return d;
      const e = stage([[19372 / 6561, a.vector!], [-25360 / 2187, b.vector!],
        [64448 / 6561, c.vector!], [-212 / 729, d.vector!]]); if (!e.ok) return e;
      const f = stage([[9017 / 3168, a.vector!], [-355 / 33, b.vector!],
        [46732 / 5247, c.vector!], [49 / 176, d.vector!], [-5103 / 18656, e.vector!]]);
      if (!f.ok) return f;
      const fifth = [0, 1, 2].map(axis => start[axis]! + dt *
        (35 / 384 * a.vector![axis]! + 500 / 1113 * c.vector![axis]! +
          125 / 192 * d.vector![axis]! - 2187 / 6784 * e.vector![axis]! +
          11 / 84 * f.vector![axis]!)) as unknown as Vec3;
      const g = evaluate(fifth); if (!g.ok) return g;
      const fourth = [0, 1, 2].map(axis => start[axis]! + dt *
        (5179 / 57600 * a.vector![axis]! + 7571 / 16695 * c.vector![axis]! +
          393 / 640 * d.vector![axis]! - 92097 / 339200 * e.vector![axis]! +
          187 / 2100 * f.vector![axis]! + 1 / 40 * g.vector![axis]!)) as unknown as Vec3;
      return { ok: true, point: fifth, error: distance(fifth, fourth) };
    };
    const pushPoint = (next: Vec3, dt: number, length: number) => {
      elapsed += dt; arcLength += length; point = next;
      points.push({ position: next, time: sign * elapsed, arcLength });
    };
    const boundaryPoint = (vector: Vec3, dt: number): { position: Vec3; time: number } | null => {
      let fraction = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const velocity = sign * vector[axis]!;
        const limit = velocity > 0 ? source.axes[axis]!.max : source.axes[axis]!.min;
        if (velocity !== 0) fraction = Math.min(fraction, (limit - point[axis]!) / (velocity * dt));
      }
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
      const position = add(point, vector, sign * dt * fraction).map((value, axis) =>
        clamp(value, source.axes[axis]!.min, source.axes[axis]!.max)) as unknown as Vec3;
      return { position, time: dt * fraction };
    };
    const finishBoundary = (crossing: { position: Vec3; time: number }): VectorField3DStopReason => {
      const length = distance(point, crossing.position);
      if (length === 0) return "boundary";
      if (arcLength + length >= maximumArc) {
        const fraction = (maximumArc - arcLength) / length;
        pushPoint(add(point, [crossing.position[0] - point[0], crossing.position[1] - point[1],
          crossing.position[2] - point[2]], fraction), crossing.time * fraction, maximumArc - arcLength);
        return "length-limit";
      }
      pushPoint(crossing.position, crossing.time, length);
      return "boundary";
    };
    let stopReason: VectorField3DStopReason = "step-limit";
    for (let attempt = 0; attempt < maximumSteps; attempt++) {
      if (options.shouldCancel?.()) { stopReason = "cancelled"; break; }
      if (elapsed >= parameterLimit) { stopReason = normalized ? "line-limit" : "time-limit"; break; }
      if (arcLength >= maximumArc) { stopReason = "length-limit"; break; }
      const initial = evaluate(point);
      if (!initial.ok) { stopReason = initial.reason; break; }
      const speed = initial.rawSpeed!;
      if (speed <= source.solver.absoluteTolerance) { stopReason = "stationary"; break; }
      const dt = Math.min(stepSize, parameterLimit - elapsed);
      if (dt < minimumStep) { stopReason = "solver-failure"; break; }
      const embedded = useRk45 ? rk45(point, sign * dt) : null;
      const full = useRk45 ? null : rk4(point, sign * dt);
      const half = useRk45 ? null : rk4(point, sign * dt / 2);
      const twice = half?.ok ? rk4(half.point, sign * dt / 2) : half;
      const problem = useRk45 ? (!embedded?.ok ? embedded : null) :
        !full?.ok ? full : !half?.ok ? half : !twice?.ok ? twice : null;
      if (problem && !problem.ok) {
        if (problem.reason === "boundary") {
          const crossing = boundaryPoint(initial.vector!, dt);
          if (crossing) {
            stopReason = finishBoundary(crossing); break;
          }
        }
        rejectedSteps++; stepSize = dt / 2;
        if (stepSize < minimumStep) { stopReason = problem.reason; break; }
        continue;
      }
      let error: number, corrected: Vec3;
      if (useRk45) {
        const success = embedded as { ok: true; point: Vec3; error: number };
        error = success.error; corrected = success.point;
      } else {
        if (!full?.ok || !twice?.ok) throw new Error("Unreachable trajectory step state.");
        error = distance(twice.point, full.point) / 15;
        corrected = [0, 1, 2].map(axis => twice.point[axis]! +
          (twice.point[axis]! - full.point[axis]!) / 15) as unknown as Vec3;
      }
      maxEstimatedLocalError = Math.max(maxEstimatedLocalError, error);
      if (!Number.isFinite(error)) { stopReason = "solver-failure"; break; }
      if (!finiteVector(corrected)) { stopReason = "solver-failure"; break; }
      const scale = Math.max(1, Math.hypot(...point), Math.hypot(...corrected));
      const tolerance = source.solver.absoluteTolerance + source.solver.relativeTolerance * scale;
      if (error > tolerance) {
        rejectedSteps++; stepSize = dt * clamp(.9 * Math.pow(tolerance / error, .2), .1, .5);
        if (stepSize < minimumStep) { stopReason = "solver-failure"; break; }
        continue;
      }
      if (!within(corrected, source.axes)) {
        const crossing = boundaryPoint(initial.vector!, dt);
        if (crossing) {
          stopReason = finishBoundary(crossing); break;
        }
        rejectedSteps++; stepSize = dt / 2; continue;
      }
      // Probe the accepted chord as well as RK stages. A small RK residual alone does not
      // rule out a jump across a pole or a rapid reversal hidden between stage points.
      let previousVector = initial.vector!;
      let discontinuity: "undefined" | "solver-failure" | null = null;
      for (const fraction of [.25, .5, .75, 1]) {
        const along = add(point, [corrected[0] - point[0], corrected[1] - point[1],
          corrected[2] - point[2]], fraction);
        const probe = evaluate(along);
        if (!probe.ok) { discontinuity = probe.reason === "undefined" ? "undefined" : "solver-failure"; break; }
        const previousSpeed = Math.hypot(...previousVector), probeSpeed = Math.hypot(...probe.vector!);
        const dot = previousVector[0] * probe.vector![0] + previousVector[1] * probe.vector![1] +
          previousVector[2] * probe.vector![2];
        if ((previousSpeed > 0 && probeSpeed > 0 && dot < -.25 * previousSpeed * probeSpeed) ||
            probeSpeed > 8 * Math.max(previousSpeed, normalized ? 1 : speed)) {
          discontinuity = "solver-failure"; break;
        }
        previousVector = probe.vector!;
      }
      if (discontinuity) {
        rejectedSteps++; stepSize = dt / 2;
        if (stepSize < minimumStep) { stopReason = discontinuity; break; }
        continue;
      }
      const length = distance(point, corrected);
      if (arcLength + length >= maximumArc && length > 0) {
        const fraction = (maximumArc - arcLength) / length;
        pushPoint(add(point, [corrected[0] - point[0], corrected[1] - point[1],
          corrected[2] - point[2]], fraction), dt * fraction, maximumArc - arcLength);
        stopReason = "length-limit"; break;
      }
      pushPoint(corrected, dt, length); acceptedSteps++;
      stepSize = dt * (error === 0 ? 2 : clamp(.9 * Math.pow(tolerance / error, .2), .2, 2));
      if (elapsed >= parameterLimit - minimumStep) {
        stopReason = normalized ? "line-limit" : "time-limit"; break;
      }
    }
    const stopDetail = ({ boundary: "A stage or accepted path reached the field boundary.",
      stationary: "Field speed is at or below the absolute tolerance.",
      undefined: "The field is undefined at a required sample.",
      "step-limit": "The bounded attempt count was exhausted.",
      "time-limit": "The configured integration time was reached.",
      "line-limit": "The configured normalized field-line length was reached.",
      "length-limit": "The configured arc-length limit was reached.",
      cancelled: "The integration was cancelled before another step.",
      "solver-failure": "The minimum step or numerical continuity guard was reached." } as const)[stopReason];
    const trajectory = { seedId: seed.id, direction, points, acceptedSteps, rejectedSteps,
      evaluations, stopReason, maxEstimatedLocalError, stopDetail };
    trajectories.push(trajectory);
    options.onProgress?.(trajectories.length, seeds.length, trajectory);
  }
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash },
    solver: { method: useRk45 ? "adaptive-rk45" : "adaptive-rk4-step-doubling",
      mode, parameterLimit, parameterUnit,
      absoluteTolerance: source.solver.absoluteTolerance,
      relativeTolerance: source.solver.relativeTolerance, maxSteps: maximumSteps,
      maxTime: source.solver.maxTime, maxArcLength: maximumArc, maxEvaluations: maximumEvaluations },
    trajectories, totalEvaluations };
}

export function integrateVectorField3DTrajectories(document: VectorField3DDocument,
  options: VectorField3DTrajectoryOptions = {}): VectorField3DTrajectoryArtifact {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "expressions")
    throw new TypeError("Reverify all scientific vector components before integrating trajectories.");
  return integrateWith(checked.value, position => {
    const variables = { x: position[0], y: position[1], z: position[2] };
    const components = field.components.map(component => evaluateGraph2DExpression(component.ast, variables,
      { maxEvaluations: 256 }));
    return components.every(result => result.ok) ? components.map(result => result.ok ? result.value : NaN) as
      unknown as Vec3 : null;
  }, options);
}

export function integrateVectorField3DScientificTrajectories(document: VectorField3DDocument,
  manifestJson: string, fingerprint: string, volumes: VectorField3DVolumes,
  options: VectorField3DTrajectoryOptions = {}): VectorField3DTrajectoryArtifact {
  const checked = verifyVectorField3DVolumes(document, manifestJson, fingerprint, volumes);
  const field = document.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific bundle vector field.");
  if (checked[0].sampleShape.some(size => size < 2))
    throw new TypeError("Scientific trajectory interpolation needs at least two samples per axis.");
  const samplePositions = field.references[0].axes.map((axis, index) =>
    Array.from({ length: checked[0].sampleShape[index] }, (_, sampleIndex) =>
      axis.origin + axis.spacing * Math.round(sampleIndex * (checked[0].sourceShape[index] - 1) /
        (checked[0].sampleShape[index] - 1))));
  return integrateWith(document, position => {
    const lower: number[] = [], weight: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const positions = samplePositions[axis]!;
      let index = 0;
      while (index < positions.length - 2 && position[axis]! > positions[index + 1]!) index++;
      const width = positions[index + 1]! - positions[index]!;
      if (width <= 0) return null;
      lower.push(index); weight.push(clamp((position[axis]! - positions[index]!) / width, 0, 1));
    }
    const vector = checked.map(volume => {
      let result = 0;
      for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let c = 0; c <= 1; c++) {
        const index = ((lower[0]! + a) * volume.sampleShape[1] + lower[1]! + b) *
          volume.sampleShape[2] + lower[2]! + c;
        const fraction = (a ? weight[0]! : 1 - weight[0]!) *
          (b ? weight[1]! : 1 - weight[1]!) * (c ? weight[2]! : 1 - weight[2]!);
        result += volume.values[index]! * fraction;
      }
      return result;
    });
    return finiteVector(vector) ? vector : null;
  }, options);
}

/** The caller supplies a manifest-pinned, tile-verified source-grid sampler. */
export function integrateVectorField3DVerifiedTileTrajectories(document: VectorField3DDocument,
  cache: VectorField3DVerifiedTileCache,
  options: VectorField3DTrajectoryOptions = {}): VectorField3DTrajectoryArtifact {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  if (checked.value.source.field.kind !== "scientific-bundle" || !cache.matches(checked.value))
    throw new TypeError("Verified tile trajectories require a scientific vector field.");
  return integrateWith(checked.value, point => cache.sample(point), options);
}
