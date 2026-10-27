type Vec3 = readonly [number, number, number];
export type VectorField3DMatrix3 = readonly [Vec3, Vec3, Vec3];
export type VectorField3DEigenvalue = Readonly<{ real: number; imaginary: number }>;
export type VectorField3DEigenanalysis = Readonly<{
  status: "resolved" | "uncertain" | "unavailable";
  eigenvalues: readonly [VectorField3DEigenvalue, VectorField3DEigenvalue,
    VectorField3DEigenvalue] | null;
  unit: string | null;
  conditionEstimate: number | null;
  diagnostics: readonly string[];
}>;

const determinant = (a: VectorField3DMatrix3) =>
  a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
  a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
  a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
const infinityNorm = (a: VectorField3DMatrix3) =>
  Math.max(...a.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0)));
const adjugate = (a: VectorField3DMatrix3): VectorField3DMatrix3 => [
  [a[1][1] * a[2][2] - a[1][2] * a[2][1], a[0][2] * a[2][1] - a[0][1] * a[2][2],
    a[0][1] * a[1][2] - a[0][2] * a[1][1]],
  [a[1][2] * a[2][0] - a[1][0] * a[2][2], a[0][0] * a[2][2] - a[0][2] * a[2][0],
    a[0][2] * a[1][0] - a[0][0] * a[1][2]],
  [a[1][0] * a[2][1] - a[1][1] * a[2][0], a[0][1] * a[2][0] - a[0][0] * a[2][1],
    a[0][0] * a[1][1] - a[0][1] * a[1][0]],
];

/** Roots of the real 3×3 characteristic cubic, with conservative confidence labels. */
export function analyzeVectorField3DEigenvalues(matrix: VectorField3DMatrix3,
  unit: string | null, reducedAccuracy = false): VectorField3DEigenanalysis {
  const unavailable = (message: string): VectorField3DEigenanalysis => ({
    status: "unavailable", eigenvalues: null, unit, conditionEstimate: null,
    diagnostics: [message] });
  if (!unit) return unavailable("Eigenvalues require compatible component and coordinate units.");
  if (matrix.some(row => row.some(value => !Number.isFinite(value))))
    return unavailable("The verified Jacobian contains a non-finite entry.");
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (scale === 0) return { status: "uncertain", unit, conditionEstimate: null,
    eigenvalues: [{ real: 0, imaginary: 0 }, { real: 0, imaginary: 0 },
      { real: 0, imaginary: 0 }],
    diagnostics: ["The zero Jacobian has repeated eigenvalues; local behavior is unresolved."] };
  const j = matrix.map(row => row.map(value => value / scale)) as unknown as VectorField3DMatrix3;
  const a = -(j[0][0] + j[1][1] + j[2][2]);
  const b = j[0][0] * j[1][1] + j[0][0] * j[2][2] + j[1][1] * j[2][2] -
    j[0][1] * j[1][0] - j[0][2] * j[2][0] - j[1][2] * j[2][1];
  const det = determinant(j), c = -det;
  const p = b - a * a / 3;
  const q = 2 * a ** 3 / 27 - a * b / 3 + c;
  const d = q * q / 4 + p ** 3 / 27;
  if (![a, b, c, p, q, d].every(Number.isFinite))
    return unavailable("The Jacobian characteristic polynomial is non-finite.");
  let normalized: [VectorField3DEigenvalue, VectorField3DEigenvalue,
    VectorField3DEigenvalue];
  if (d >= 0) {
    const root = Math.sqrt(d);
    const u = Math.cbrt(-q / 2 + root), v = Math.cbrt(-q / 2 - root);
    const pairReal = -(u + v) / 2 - a / 3;
    const pairImaginary = Math.sqrt(3) * Math.abs(u - v) / 2;
    normalized = [{ real: u + v - a / 3, imaginary: 0 },
      { real: pairReal, imaginary: pairImaginary },
      { real: pairReal, imaginary: -pairImaginary }];
  } else {
    const radius = 2 * Math.sqrt(-p / 3);
    const cosine = -q / (2 * Math.sqrt(-((p / 3) ** 3)));
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    normalized = [0, 1, 2].map(index => ({
      real: radius * Math.cos((angle + 2 * Math.PI * index) / 3) - a / 3,
      imaginary: 0 })) as [VectorField3DEigenvalue, VectorField3DEigenvalue,
        VectorField3DEigenvalue];
    normalized.sort((left, right) => left.real - right.real);
  }
  const eigenvalues = normalized.map(value => ({ real: value.real * scale,
    imaginary: value.imaginary * scale })) as unknown as
    [VectorField3DEigenvalue, VectorField3DEigenvalue, VectorField3DEigenvalue];
  if (eigenvalues.some(value => !Number.isFinite(value.real) ||
      !Number.isFinite(value.imaginary))) return unavailable("The eigenvalues are non-finite.");
  const condition = Math.abs(det) > 0 ?
    infinityNorm(j) * infinityNorm(adjugate(j)) / Math.abs(det) : null;
  const conditionEstimate = condition !== null && Number.isFinite(condition) ? condition : null;
  const nearRepeated = Math.abs(d) <= 1e-10 *
    Math.max(Math.abs(q * q / 4), Math.abs(p ** 3 / 27), 1e-16);
  const diagnostics = [
    ...(conditionEstimate === null || conditionEstimate >= 1e8 ?
      ["The Jacobian is singular or poorly conditioned; eigenvalue interpretation is uncertain."] : []),
    ...(nearRepeated ? ["The characteristic roots are nearly repeated."] : []),
    ...(reducedAccuracy ? ["A boundary or two-point stencil reduces derivative accuracy."] : []),
    "This is a local linearization at the probe, not a stability classification unless the point is an equilibrium.",
  ];
  return { status: conditionEstimate === null || conditionEstimate >= 1e8 ||
    nearRepeated || reducedAccuracy ? "uncertain" : "resolved",
  eigenvalues, unit, conditionEstimate, diagnostics };
}
