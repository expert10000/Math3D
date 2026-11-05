import type { DerivedFieldShape } from "./derivedFieldDocument";

type Matrix3 = readonly (readonly [number, number, number])[];
export type AdvancedTensorMeasure = Readonly<{ status: "value" | "unavailable";
  value: number | null; unit: string; reason: string | null }>;
export type AdvancedTensorMeasures = Readonly<{ qCriterion: AdvancedTensorMeasure;
  lambda2: AdvancedTensorMeasure; swirlingStrength: AdvancedTensorMeasure }>;

/** Numerical admission gate for future GF-16 operations; Cartesian orthonormal frame only. */
export function evaluateAdvancedTensorMeasures(jacobian: Matrix3,
  shape: DerivedFieldShape): AdvancedTensorMeasures {
  if (shape.kind !== "vector" || shape.axes.length !== 3 ||
      shape.axes.some((axis, index) => axis.index !== index ||
        axis.unit !== shape.axes[0]!.unit || axis.name !== ["x", "y", "z"][index]) ||
      !shape.componentUnits || new Set(shape.componentUnits).size !== 1 ||
      shape.unit !== shape.componentUnits[0])
    throw new TypeError("Advanced tensor measures need a Cartesian orthonormal frame and uniform units.");
  if (jacobian.length !== 3 || jacobian.some(row => row.length !== 3 ||
      row.some(value => !Number.isFinite(value) || Math.abs(value) > 1e9)))
    throw new TypeError("Jacobian must be a finite bounded 3×3 matrix.");
  const unit = `${shape.unit}/${shape.axes[0]!.unit}`;
  const squared = `${unit}²`;
  const s = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 },
    (_, j) => (jacobian[i]![j]! + jacobian[j]![i]!) / 2));
  const o = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 },
    (_, j) => (jacobian[i]![j]! - jacobian[j]![i]!) / 2));
  let symmetricNorm = 0, spinNorm = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    symmetricNorm += s[i]![j]! ** 2; spinNorm += o[i]![j]! ** 2;
  }
  const q = (spinNorm - symmetricNorm) / 2;
  const a = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 },
    (_, j) => [0, 1, 2].reduce((sum, k) =>
      sum + s[i]![k]! * s[k]![j]! + o[i]![k]! * o[k]![j]!, 0)));
  // Symmetric Jacobi eigensolver, with a fixed work bound and residual gate.
  for (let pass = 0; pass < 32; pass++) {
    const pairs = [[0, 1], [0, 2], [1, 2]] as const;
    const [p, r] = pairs.reduce((best, pair) =>
      Math.abs(a[pair[0]]![pair[1]]!) > Math.abs(a[best[0]]![best[1]]!) ? pair : best);
    if (Math.abs(a[p]![r]!) <= 1e-12 * Math.max(1e-30, symmetricNorm + spinNorm)) break;
    const angle = Math.atan2(2 * a[p]![r]!, a[r]![r]! - a[p]![p]!) / 2;
    const c = Math.cos(angle), t = Math.sin(angle);
    const pp = a[p]![p]!, rr = a[r]![r]!, pr = a[p]![r]!;
    a[p]![p] = c * c * pp - 2 * c * t * pr + t * t * rr;
    a[r]![r] = t * t * pp + 2 * c * t * pr + c * c * rr;
    a[p]![r] = 0; a[r]![p] = 0;
    for (let k = 0; k < 3; k++) if (k !== p && k !== r) {
      const kp = a[k]![p]!, kr = a[k]![r]!;
      a[k]![p] = c * kp - t * kr; a[p]![k] = a[k]![p]!;
      a[k]![r] = t * kp + c * kr; a[r]![k] = a[k]![r]!;
    }
  }
  const residual = Math.max(Math.abs(a[0]![1]!), Math.abs(a[0]![2]!),
    Math.abs(a[1]![2]!));
  const eigen = [a[0]![0]!, a[1]![1]!, a[2]![2]!].sort((x, y) => x - y);
  const value = (number: number, resultUnit: string): AdvancedTensorMeasure =>
    ({ status: "value", value: number, unit: resultUnit, reason: null });
  const unavailable = (resultUnit: string, reason: string): AdvancedTensorMeasure =>
    ({ status: "unavailable", value: null, unit: resultUnit, reason });
  const lambda2 = residual <= 1e-9 * Math.max(1e-30, symmetricNorm + spinNorm) ?
    value(eigen[1]!, squared) : unavailable(squared, "Symmetric eigensolver did not converge.");
  const tr = jacobian[0]![0]! + jacobian[1]![1]! + jacobian[2]![2]!;
  const tr2 = [0, 1, 2].reduce((sum, i) => sum + [0, 1, 2].reduce((inner, j) =>
    inner + jacobian[i]![j]! * jacobian[j]![i]!, 0), 0);
  const c2 = (tr * tr - tr2) / 2;
  const determinant = jacobian[0]![0]! * (jacobian[1]![1]! * jacobian[2]![2]! -
    jacobian[1]![2]! * jacobian[2]![1]!) -
    jacobian[0]![1]! * (jacobian[1]![0]! * jacobian[2]![2]! -
      jacobian[1]![2]! * jacobian[2]![0]!) +
    jacobian[0]![2]! * (jacobian[1]![0]! * jacobian[2]![1]! -
      jacobian[1]![1]! * jacobian[2]![0]!);
  const p = c2 - tr * tr / 3;
  const z = -2 * tr ** 3 / 27 + tr * c2 / 3 - determinant;
  const discriminant = (z / 2) ** 2 + (p / 3) ** 3;
  const scale = Math.max(0, ...jacobian.flat().map(Math.abs));
  let swirlingStrength: AdvancedTensorMeasure;
  if (scale === 0 || Math.abs(discriminant) <= 1e-12 * scale ** 6)
    swirlingStrength = unavailable(unit, "Eigenvalue discriminant is ill-conditioned.");
  else if (discriminant < 0) swirlingStrength = value(0, unit);
  else {
    const root = Math.sqrt(discriminant);
    const u = Math.cbrt(-z / 2 + root), v = Math.cbrt(-z / 2 - root);
    swirlingStrength = value(Math.sqrt(3) * Math.abs(u - v) / 2, unit);
  }
  return { qCriterion: value(q, squared), lambda2, swirlingStrength };
}
