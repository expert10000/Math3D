type Point = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ min: number; max: number }>;
type Matrix = readonly [number, number, number, number];
type Eigenvalue = Readonly<{ real: number; imaginary: number }>;

export type Graph2DPhaseLinearizationKind = "saddle" | "stable-node" | "unstable-node" |
  "stable-spiral" | "unstable-spiral" | "linear-center" | "nonhyperbolic" | "unresolved";
export type Graph2DPhaseLinearization = Readonly<{
  status: "classified" | "inconclusive" | "unavailable";
  kind: Graph2DPhaseLinearizationKind;
  stability: "stable" | "unstable" | "undetermined";
  jacobian: Matrix | null;
  eigenvalues: readonly [Eigenvalue, Eigenvalue] | null;
  trace: number | null;
  determinant: number | null;
  step: Point | null;
  consistency: number | null;
  reason: string | null;
}>;

const unavailable = (reason: string): Graph2DPhaseLinearization => ({
  status: "unavailable", kind: "unresolved", stability: "undetermined", jacobian: null,
  eigenvalues: null, trace: null, determinant: null, step: null, consistency: null, reason,
});

/** Two-scale central differences; evaluation uses the caller's shared sample and time budget. */
export const estimateGraph2DPhaseLinearization = (point: Point, xBounds: Bounds, yBounds: Bounds,
  evaluate: (point: Point) => Point | null): Graph2DPhaseLinearization => {
  const stepFor = (coordinate: number, bounds: Bounds) => Math.min(
    Math.max(1e-6, 1e-4 * (bounds.max - bounds.min)),
    (coordinate - bounds.min) / 2, (bounds.max - coordinate) / 2);
  const hx = stepFor(point.x, xBounds), hy = stepFor(point.y, yBounds);
  if (hx < 1e-7 * Math.max(1, Math.abs(point.x)) || hy < 1e-7 * Math.max(1, Math.abs(point.y)))
    return unavailable("The equilibrium is too close to a domain boundary for central differences.");
  const center = evaluate(point);
  if (!center) return unavailable("Jacobian evaluation exceeded the shared budget or the field is undefined.");
  const derivative = (axis: "x" | "y", h: number) => {
    const plus = evaluate({ ...point, [axis]: point[axis] + h });
    const minus = evaluate({ ...point, [axis]: point[axis] - h });
    if (!plus || !minus) return null;
    return { x: (plus.x - minus.x) / (2 * h), y: (plus.y - minus.y) / (2 * h),
      asymmetry: Math.max(Math.abs((plus.x - center.x) / h - (center.x - minus.x) / h),
        Math.abs((plus.y - center.y) / h - (center.y - minus.y) / h)) };
  };
  const coarseX = derivative("x", hx), coarseY = derivative("y", hy);
  const fineX = derivative("x", hx / 2), fineY = derivative("y", hy / 2);
  if (!coarseX || !coarseY || !fineX || !fineY)
    return unavailable("Jacobian evaluation exceeded the shared budget or the field is undefined.");
  const jacobian: Matrix = [fineX.x, fineY.x, fineX.y, fineY.y];
  const scale = Math.max(1, ...jacobian.map(Math.abs));
  const consistency = Math.max(Math.abs(fineX.x - coarseX.x), Math.abs(fineX.y - coarseX.y),
    Math.abs(fineY.x - coarseY.x), Math.abs(fineY.y - coarseY.y),
    coarseX.asymmetry, coarseY.asymmetry, fineX.asymmetry, fineY.asymmetry);
  const [a, b, c, d] = jacobian, trace = a + d, determinant = a * d - b * c;
  const base = { jacobian, trace, determinant, step: { x: hx / 2, y: hy / 2 }, consistency };
  const inconclusive = (reason: string): Graph2DPhaseLinearization => ({
    ...base, status: "inconclusive", kind: "unresolved", stability: "undetermined", eigenvalues: null, reason,
  });
  if (![...jacobian, trace, determinant, consistency].every(Number.isFinite))
    return inconclusive("The estimated Jacobian is non-finite.");
  if (consistency > 0.02 * scale)
    return inconclusive("One-sided or two-scale derivatives disagree; the field may be nonsmooth.");
  const discriminant = trace * trace - 4 * determinant;
  const absoluteMargin = Math.max(1e-6, 10 * consistency);
  const margin = Math.max(1e-6 * scale, absoluteMargin);
  const determinantMargin = margin * scale;
  if (!Number.isFinite(discriminant)) return inconclusive("The estimated eigenvalues are non-finite.");
  const realRoot = Math.sqrt(Math.max(0, discriminant));
  const imaginaryRoot = Math.sqrt(Math.max(0, -discriminant));
  const eigenvalues: [Eigenvalue, Eigenvalue] = discriminant >= 0 ?
    [{ real: (trace + realRoot) / 2, imaginary: 0 }, { real: (trace - realRoot) / 2, imaginary: 0 }] :
    [{ real: trace / 2, imaginary: imaginaryRoot / 2 }, { real: trace / 2, imaginary: -imaginaryRoot / 2 }];
  const ambiguous = (reason: string): Graph2DPhaseLinearization => ({
    ...base, eigenvalues, status: "inconclusive", kind: "unresolved", stability: "undetermined", reason,
  });
  let kind: Graph2DPhaseLinearizationKind, stability: Graph2DPhaseLinearization["stability"];
  if (determinant < -determinantMargin) { kind = "saddle"; stability = "unstable"; }
  else if (Math.abs(determinant) <= determinantMargin) {
    if (Math.abs(determinant) > absoluteMargin * Math.max(1, Math.abs(trace)))
      return ambiguous("An eigenvalue is small relative to the Jacobian scale but not resolved as zero.");
    kind = "nonhyperbolic"; stability = "undetermined";
  }
  else if (discriminant < -margin * scale) {
    if (trace < -margin) { kind = "stable-spiral"; stability = "stable"; }
    else if (trace > margin) { kind = "unstable-spiral"; stability = "unstable"; }
    else if (Math.abs(trace) <= absoluteMargin) { kind = "linear-center"; stability = "undetermined"; }
    else return ambiguous("The real eigenvalue part is small relative to the Jacobian scale.");
  } else if (discriminant > margin * scale) {
    if (eigenvalues.some(value => Math.abs(value.real) <= margin)) {
      if (eigenvalues.every(value => Math.abs(value.real) > absoluteMargin))
        return ambiguous("An eigenvalue is small relative to the Jacobian scale but not resolved as zero.");
      kind = "nonhyperbolic"; stability = "undetermined";
    } else if (eigenvalues.every(value => value.real < 0)) {
      kind = "stable-node"; stability = "stable";
    } else if (eigenvalues.every(value => value.real > 0)) {
      kind = "unstable-node"; stability = "unstable";
    } else { kind = "saddle"; stability = "unstable"; }
  } else return { ...base, eigenvalues, status: "inconclusive", kind: "unresolved",
    stability: trace < -margin ? "stable" : trace > margin ? "unstable" : "undetermined",
    reason: "The eigenvalue discriminant is too close to zero to distinguish a node from a spiral." };
  return { ...base, eigenvalues, status: kind === "nonhyperbolic" || kind === "linear-center" ? "inconclusive" : "classified",
    kind, stability, reason: kind === "linear-center" ? "Purely imaginary linear eigenvalues do not determine nonlinear stability." :
      kind === "nonhyperbolic" ? "A zero or near-zero real eigenvalue makes linear stability inconclusive." : null };
};
