export type SurfaceToleranceClass = "exact" | "numerical" | "sampled" | "mesh-approximation";

export const SURFACE_ANALYSIS_TOLERANCES = {
  exact: { absolute: 1e-10, relative: 1e-10, convergenceRequired: false },
  numerical: { absolute: 2e-4, relative: 2e-4, convergenceRequired: true },
  sampled: { absolute: 2e-2, relative: 5e-2, convergenceRequired: true },
  "mesh-approximation": { absolute: 8e-2, relative: 1e-1, convergenceRequired: true },
} as const satisfies Readonly<Record<SurfaceToleranceClass, { absolute: number; relative: number; convergenceRequired: boolean }>>;

export type SurfaceRegressionCase = {
  id: string;
  label: string;
  family: "canonical" | "pathological";
  representation: "explicit" | "implicit" | "parametric" | "spline" | "constructed" | "weierstrass" | "mesh-backed";
  evidence: readonly string[];
};

export const SURFACE_V1_REGRESSION_MATRIX: readonly SurfaceRegressionCase[] = [
  { id: "plane", label: "Plane", family: "canonical", representation: "parametric", evidence: ["exact zero curvature", "chart orientation"] },
  { id: "sphere", label: "Sphere", family: "canonical", representation: "parametric", evidence: ["radius-scaled curvature", "umbilic policy"] },
  { id: "cylinder", label: "Cylinder", family: "canonical", representation: "parametric", evidence: ["developable curvature", "periodic seam"] },
  { id: "cone", label: "Cone", family: "canonical", representation: "parametric", evidence: ["tip singularity", "derived mesh"] },
  { id: "torus", label: "Torus", family: "canonical", representation: "parametric", evidence: ["elliptic/hyperbolic/parabolic regions", "reparameterization"] },
  { id: "saddle", label: "Saddle", family: "canonical", representation: "explicit", evidence: ["negative Gaussian curvature"] },
  { id: "paraboloid", label: "Paraboloid", family: "canonical", representation: "explicit", evidence: ["numerical graph derivatives"] },
  { id: "ellipsoid", label: "Ellipsoid", family: "canonical", representation: "parametric", evidence: ["gallery functional coverage"] },
  { id: "mexican-hat", label: "Mexican hat", family: "canonical", representation: "explicit", evidence: ["gallery functional coverage"] },
  { id: "enneper", label: "Enneper surface", family: "canonical", representation: "parametric", evidence: ["gallery functional coverage"] },
  { id: "helicoid", label: "Helicoid", family: "canonical", representation: "parametric", evidence: ["gallery functional coverage"] },
  { id: "mobius", label: "Möbius strip", family: "canonical", representation: "parametric", evidence: ["non-orientable chart warning"] },
  { id: "implicit-sphere", label: "Implicit sphere", family: "canonical", representation: "implicit", evidence: ["gradient/Hessian curvature", "derived correspondence"] },
  { id: "implicit-torus", label: "Implicit torus", family: "canonical", representation: "implicit", evidence: ["worker/backend workflow"] },
  { id: "nurbs-patch", label: "NURBS patch", family: "canonical", representation: "spline", evidence: ["gallery functional coverage", "sampling"] },
  { id: "constructed-sweep", label: "Constructed sweep", family: "canonical", representation: "constructed", evidence: ["gallery functional coverage", "provenance"] },
  { id: "weierstrass", label: "Weierstrass surface", family: "canonical", representation: "weierstrass", evidence: ["gallery functional coverage", "sampling"] },
  { id: "degenerate-parameterization", label: "Degenerate parameterization", family: "pathological", representation: "parametric", evidence: ["invalid/degenerate masks"] },
  { id: "implicit-critical-point", label: "Implicit critical point", family: "pathological", representation: "implicit", evidence: ["zero-gradient singularity"] },
  { id: "orientation-reversal", label: "Seam/orientation reversal", family: "pathological", representation: "parametric", evidence: ["orientation-flip region", "signed curvature"] },
  { id: "trim-boundary", label: "Trim boundary", family: "pathological", representation: "parametric", evidence: ["trim metadata", "boundary mask"] },
  { id: "non-orientable-chart", label: "Non-orientable chart", family: "pathological", representation: "parametric", evidence: ["Möbius orientation policy"] },
  { id: "disconnected-implicit", label: "Disconnected implicit extraction", family: "pathological", representation: "implicit", evidence: ["backend validation/component count"] },
  { id: "undersampled-field", label: "Undersampled field", family: "pathological", representation: "mesh-backed", evidence: ["uncertainty mask", "method tolerance"] },
  { id: "stale-derived-mesh", label: "Stale derived mesh", family: "pathological", representation: "mesh-backed", evidence: ["revision invalidation", "preserved provenance"] },
  { id: "worker-cancellation", label: "Worker cancellation/failure", family: "pathological", representation: "mesh-backed", evidence: ["cancelled result history", "failure injection E2E"] },
  { id: "unavailable-backend", label: "Unavailable backend", family: "pathological", representation: "mesh-backed", evidence: ["explicit availability", "no fallback relabel"] },
] as const;

export const surfaceToleranceFor = (method: SurfaceToleranceClass) => SURFACE_ANALYSIS_TOLERANCES[method];

export const withinSurfaceTolerance = (actual: number, expected: number, toleranceClass: SurfaceToleranceClass): boolean => {
  const tolerance = surfaceToleranceFor(toleranceClass);
  return Math.abs(actual - expected) <= Math.max(tolerance.absolute, tolerance.relative * Math.max(1, Math.abs(expected)));
};

export const validateSurfaceRegressionMatrix = (matrix = SURFACE_V1_REGRESSION_MATRIX): string[] => {
  const issues: string[] = [];
  const ids = new Set<string>();
  matrix.forEach((entry) => {
    if (ids.has(entry.id)) issues.push(`Duplicate regression ID: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.evidence.length) issues.push(`Missing evidence: ${entry.id}`);
  });
  const representations = new Set(matrix.filter((entry) => entry.family === "canonical").map((entry) => entry.representation));
  ["explicit", "implicit", "parametric", "spline", "constructed", "weierstrass"].forEach((representation) => {
    if (!representations.has(representation as SurfaceRegressionCase["representation"])) issues.push(`Missing canonical representation: ${representation}`);
  });
  if (matrix.filter((entry) => entry.family === "canonical").length < 16) issues.push("Canonical matrix must contain at least 16 cases.");
  if (matrix.filter((entry) => entry.family === "pathological").length < 10) issues.push("Pathological matrix must contain at least 10 cases.");
  return issues;
};
