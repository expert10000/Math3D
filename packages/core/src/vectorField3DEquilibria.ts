import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";

type Vec3 = readonly [number, number, number];
type Matrix3 = readonly [Vec3, Vec3, Vec3];
type ScientificSource = Readonly<{ manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes }>;
export type VectorField3DEquilibrium = Readonly<{
  position: Vec3; residual: number; conditionEstimate: number | null;
  jacobian: Matrix3 | null; eigenvalueRealParts: Vec3 | null;
  classification: "source" | "sink" | "saddle" | "degenerate/uncertain";
  diagnostics: readonly string[];
}>;
export type VectorField3DEquilibriumSearch = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  sourceHash: string | null; status: "bounded-incomplete" | "budget-reached";
  candidates: readonly VectorField3DEquilibrium[]; attemptedSeeds: number;
  evaluations: number; rejectedSeeds: number; maxEvaluations: number;
  residualTolerance: number; diagnostics: readonly string[];
}>;

const norm = (v: Vec3) => Math.hypot(...v);
const determinant = (a: Matrix3) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
  a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
  a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
const adjugate = (a: Matrix3): Matrix3 => [
  [a[1][1] * a[2][2] - a[1][2] * a[2][1], a[0][2] * a[2][1] - a[0][1] * a[2][2], a[0][1] * a[1][2] - a[0][2] * a[1][1]],
  [a[1][2] * a[2][0] - a[1][0] * a[2][2], a[0][0] * a[2][2] - a[0][2] * a[2][0], a[0][2] * a[1][0] - a[0][0] * a[1][2]],
  [a[1][0] * a[2][1] - a[1][1] * a[2][0], a[0][1] * a[2][0] - a[0][0] * a[2][1], a[0][0] * a[1][1] - a[0][1] * a[1][0]],
];
const infinityNorm = (a: Matrix3) => Math.max(...a.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0)));
const solve = (a: Matrix3, b: Vec3): Vec3 | null => {
  const det = determinant(a);
  if (!Number.isFinite(det) || Math.abs(det) <= 1e-12 * infinityNorm(a) ** 3) return null;
  const adj = adjugate(a);
  const result = adj.map(row => row.reduce((sum, value, i) => sum + value * b[i], 0) / det) as [number, number, number];
  return result.every(Number.isFinite) ? result : null;
};

/** Real parts of the three roots of the real characteristic cubic. */
const eigenvalueRealParts = (j: Matrix3): Vec3 | null => {
  const a = -(j[0][0] + j[1][1] + j[2][2]);
  const b = j[0][0] * j[1][1] + j[0][0] * j[2][2] + j[1][1] * j[2][2] -
    j[0][1] * j[1][0] - j[0][2] * j[2][0] - j[1][2] * j[2][1];
  const c = -determinant(j), p = b - a * a / 3;
  const q = 2 * a ** 3 / 27 - a * b / 3 + c;
  const d = q * q / 4 + p ** 3 / 27;
  if (![a, b, c, p, q, d].every(Number.isFinite)) return null;
  if (d >= 0) {
    const u = Math.cbrt(-q / 2 + Math.sqrt(d));
    const v = Math.cbrt(-q / 2 - Math.sqrt(d));
    return [u + v - a / 3, -(u + v) / 2 - a / 3, -(u + v) / 2 - a / 3];
  }
  const radius = 2 * Math.sqrt(-p / 3);
  const angle = Math.acos(Math.max(-1, Math.min(1, -q / (2 * Math.sqrt(-((p / 3) ** 3))))));
  return [0, 1, 2].map(k => radius * Math.cos((angle + 2 * Math.PI * k) / 3) - a / 3) as
    [number, number, number];
};

/** Bounded seeded search. No sampled search is a certificate of exhaustive coverage. */
export function searchVectorField3DEquilibria(document: VectorField3DDocument,
  scientific?: ScientificSource, options: Readonly<{ maxEvaluations?: number; seedResolution?: 3 | 5 }> = {}):
  VectorField3DEquilibriumSearch {
  const normalized = normalizeVectorField3DDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const checked = normalized.value, { axes, field } = checked.source;
  const maxEvaluations = options.maxEvaluations ?? 40000;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 100 || maxEvaluations > 100000)
    throw new RangeError("Equilibrium evaluation budget must be between 100 and 100000.");
  const resolution = options.seedResolution ?? 5;
  if (resolution !== 3 && resolution !== 5) throw new RangeError("Unsupported equilibrium seed resolution.");
  const volumes = field.kind === "scientific-bundle" ? (() => {
    if (!scientific) throw new TypeError("Reverify all three scientific components before equilibrium search.");
    return verifyVectorField3DVolumes(checked, scientific.manifestJson, scientific.fingerprint, scientific.volumes);
  })() : null;
  const sourceHash = field.kind === "scientific-bundle" ? createScientificDatasetLink(field.references).sourceHash : null;
  let evaluations = 0, rejectedSeeds = 0, attemptedSeeds = 0, budgetReached = false;
  const coordinateLattice = volumes && field.kind === "scientific-bundle" ? axes.map((_, axis) => {
    const ref = field.references[0], count = volumes[0].sampleShape[axis];
    return Array.from({ length: count }, (_, i) => ref.axes[axis].origin +
      ref.axes[axis].spacing * (count === 1 ? 0 : Math.round(i * (ref.shape[axis] - 1) / (count - 1))));
  }) : null;
  const sample = (point: Vec3): Vec3 | null => {
    if (++evaluations > maxEvaluations) { budgetReached = true; return null; }
    if (point.some((value, axis) => !Number.isFinite(value) || value < axes[axis].min || value > axes[axis].max)) return null;
    if (field.kind === "expressions") {
      const variables = { x: point[0], y: point[1], z: point[2] };
      const values = field.components.map(component => evaluateGraph2DExpression(component.ast, variables,
        { maxEvaluations: 256 }));
      return values.every(value => value.ok) ? values.map(value => value.ok ? value.value : NaN) as
        [number, number, number] : null;
    }
    const lattice = coordinateLattice!;
    const brackets = point.map((value, axis) => {
      const coordinates = lattice[axis];
      if (coordinates.length < 2) return null;
      let low = 0, high = coordinates.length - 1;
      while (high - low > 1) { const mid = (low + high) >> 1;
        if (coordinates[mid] <= value) low = mid; else high = mid; }
      const width = coordinates[high] - coordinates[low];
      return width > 0 ? { low, high, weight: Math.max(0, Math.min(1, (value - coordinates[low]) / width)) } : null;
    });
    if (brackets.some(item => !item)) return null;
    const shape = volumes![0].sampleShape, result = [0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
      const index = brackets.map((item, axis) => corner & (1 << axis) ? item!.high : item!.low);
      const weight = brackets.reduce((product, item, axis) => product *
        (corner & (1 << axis) ? item!.weight : 1 - item!.weight), 1);
      const offset = (index[0] * shape[1] + index[1]) * shape[2] + index[2];
      for (let component = 0; component < 3; component++) result[component] += weight * volumes![component].values[offset];
    }
    return result.every(Number.isFinite) ? result as [number, number, number] : null;
  };
  const jacobian = (point: Vec3): Matrix3 | null => {
    const columns: Vec3[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const { min, max } = axes[axis], step = (max - min) / 1000;
      const left = [...point] as [number, number, number], right = [...point] as [number, number, number];
      left[axis] = Math.max(min, point[axis] - step); right[axis] = Math.min(max, point[axis] + step);
      if (right[axis] - left[axis] <= Number.EPSILON * Math.max(1, Math.abs(point[axis]))) return null;
      const l = sample(left), r = sample(right);
      if (!l || !r) return null;
      const width = right[axis] - left[axis];
      columns.push([(r[0] - l[0]) / width, (r[1] - l[1]) / width, (r[2] - l[2]) / width]);
    }
    return [
      [columns[0]![0], columns[1]![0], columns[2]![0]],
      [columns[0]![1], columns[1]![1], columns[2]![1]],
      [columns[0]![2], columns[1]![2], columns[2]![2]],
    ];
  };
  const smoothStencil = (point: Vec3, center: Vec3, j: Matrix3): boolean => {
    const scale = Math.max(1, infinityNorm(j));
    for (let axis = 0; axis < 3; axis++) {
      const { min, max } = axes[axis], step = (max - min) / 1000;
      if (point[axis] - step < min || point[axis] + step > max) return false;
      const left = [...point] as [number, number, number]; left[axis] -= step;
      const right = [...point] as [number, number, number]; right[axis] += step;
      const l = sample(left), r = sample(right);
      if (!l || !r) return false;
      for (let component = 0; component < 3; component++) {
        const backward = (center[component] - l[component]) / step;
        const forward = (r[component] - center[component]) / step;
        if (Math.abs(forward - backward) > 0.02 * scale) return false;
      }
    }
    return true;
  };
  const tolerance = Math.max(1e-9, checked.source.solver.absoluteTolerance);
  const spans = axes.map(axis => axis.max - axis.min);
  const dedupeDistance = Math.min(...spans) * 1e-4;
  const candidates: VectorField3DEquilibrium[] = [];
  const regular = Array.from({ length: resolution ** 3 }, (_, index) => {
    const ix = Math.floor(index / (resolution * resolution)), iy = Math.floor(index / resolution) % resolution;
    const iz = index % resolution;
    return [ix, iy, iz].map((i, axis) => axes[axis].min + spans[axis] * i / (resolution - 1)) as
      [number, number, number];
  });
  const seeds = [...checked.source.seeds.map(seed => seed.position), ...regular];
  const unitsCompatible = new Set(axes.map(axis => axis.unit)).size === 1 &&
    new Set((field.kind === "expressions" ? field.components.map(item => item.unit) : field.componentUnits)).size === 1;
  for (const seed of seeds) {
    if (budgetReached || candidates.length >= 32) break;
    attemptedSeeds++;
    let point = [...seed] as [number, number, number], value = sample(point);
    for (let iteration = 0; iteration < 24 && value && norm(value) > tolerance && !budgetReached; iteration++) {
      const j = jacobian(point);
      const delta = j ? solve(j, value) : null;
      if (!delta) break;
      let improved = false;
      for (let scale = 1; scale >= 1 / 64 && !budgetReached; scale /= 2) {
        const trial = point.map((coordinate, axis) => coordinate - scale * delta[axis]) as
          [number, number, number];
        const next = sample(trial);
        if (next && norm(next) < norm(value)) { point = trial; value = next; improved = true; break; }
      }
      if (!improved) break;
    }
    if (!value || norm(value) > tolerance) { rejectedSeeds++; continue; }
    if (candidates.some(candidate => norm(point.map((v, i) => v - candidate.position[i]) as
      [number, number, number]) <= dedupeDistance)) continue;
    const j = jacobian(point), det = j ? determinant(j) : 0;
    const condition = j && Math.abs(det) > 0 ? infinityNorm(j) * infinityNorm(adjugate(j)) / Math.abs(det) : null;
    const eigen = j ? eigenvalueRealParts(j) : null;
    const scale = j ? Math.max(1, infinityNorm(j)) : 1;
    const separated = eigen && eigen.every(value => Math.abs(value) > 1e-5 * scale);
    const locallySmooth = j ? smoothStencil(point, value, j) : false;
    const reliable = unitsCompatible && locallySmooth && separated && condition !== null &&
      Number.isFinite(condition) && condition < 1e8 && norm(value) <= tolerance;
    const classification = !reliable ? "degenerate/uncertain" :
      eigen!.every(value => value > 0) ? "source" : eigen!.every(value => value < 0) ? "sink" : "saddle";
    const diagnostics = [
      ...(!unitsCompatible ? ["Eigenvalue stability needs matching spatial and component units."] : []),
      ...(!separated ? ["An eigenvalue is near the imaginary axis or the Jacobian is unavailable."] : []),
      ...(!locallySmooth ? ["The point is on a domain boundary or opposite derivative stencils disagree; smooth local linearization is uncertain."] : []),
      ...(condition === null || condition >= 1e8 ? ["Jacobian is singular or poorly conditioned."] : []),
    ];
    candidates.push({ position: point, residual: norm(value), conditionEstimate: Number.isFinite(condition) ?
      condition : null, jacobian: j, eigenvalueRealParts: eigen, classification, diagnostics });
  }
  candidates.sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1] ||
    a.position[2] - b.position[2]);
  const stoppedEarly = budgetReached || candidates.length >= 32;
  return { source: { documentId: checked.identity.id, revision: checked.identity.revision,
    structuralHash: checked.identity.structuralHash }, sourceHash,
    status: stoppedEarly ? "budget-reached" : "bounded-incomplete", candidates,
    attemptedSeeds, rejectedSeeds, evaluations: Math.min(evaluations, maxEvaluations),
    maxEvaluations, residualTolerance: tolerance,
    diagnostics: [stoppedEarly ? "Search stopped at its evaluation or 32-candidate budget." :
      "Seeded local search finished; unsampled equilibria may remain.",
      "Classification is a candidate local linearization for a smooth autonomous field, not a global topology proof."] };
}
