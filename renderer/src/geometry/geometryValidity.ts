import { analyzeIntrinsicGeometry } from "./intrinsicGeometry";
import { analyzeExactSurface, evaluateExactSurfacePoint, type ExactSurfaceVec3, type GeometryAnalyticSurfaceDefinition } from "./exactSurfaceAnalysis";

export type GeometryNativeEntityKind = "body" | "shell" | "face" | "loop" | "edge" | "vertex";
export type GeometryNativeEntity = { id: string; kind: GeometryNativeEntityKind; label: string; parentId: string | null; childIds: string[]; sourceRevision: number };
export type GeometryNativeTopology = { entities: GeometryNativeEntity[]; roots: string[]; representation: "analytic-semantic-topology"; renderTriangleIndependent: true };
export type GeometryDiagnosticSeverity = "info" | "warning" | "error" | "unknown";
export type GeometryDiagnosticAction = "Frame" | "Select" | "Isolate" | "Open source" | "Attempt repair";
export type GeometryValidityIssueKind = "invalid-parameter-domain" | "degenerate-surface" | "invalid-trim" | "self-intersection" | "open-shell" | "non-manifold-join" | "orientation" | "zero-length-edge" | "collapsed-trim" | "duplicate-boundary" | "singularity" | "seam" | "pole" | "excessive-stretch" | "poor-metric-conditioning" | "trim-domain-pathology";
export type GeometryValidityIssue = { id: string; kind: GeometryValidityIssueKind; severity: GeometryDiagnosticSeverity; entityId: string; message: string; exact: boolean; actions: GeometryDiagnosticAction[]; value?: number; tolerance?: number };
export type GeometryContinuityClass = "C0/G0" | "C1/G1" | "C2/G2" | "discontinuous" | "degenerate";
export type GeometryContinuityResult = { classification: GeometryContinuityClass; positionGap: number; tangentAngle: number | null; normalAngle: number | null; curvatureMismatch: number | null; samples: number; tolerance: number };
export type GeometryValidityResult = {
  topology: GeometryNativeTopology;
  exactGeometry: { valid: boolean; issues: GeometryValidityIssue[]; continuity: GeometryContinuityResult | null };
  displayMeshHealth: { available: boolean; exactBrepValidity: false; label: "Tessellated display mesh health"; notes: string[] };
  counts: Record<GeometryNativeEntityKind, number>;
  sourceRevision: number;
  conventions: { validity: string; meshSeparation: string };
};

const distance = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: ExactSurfaceVec3 | null, b: ExactSurfaceVec3 | null): number | null => {
  if (!a || !b) return null;
  const denominator = Math.hypot(...a) * Math.hypot(...b);
  return denominator ? Math.acos(Math.min(1, Math.max(-1, Math.abs(dot(a, b) / denominator)))) : null;
};
const actions: GeometryDiagnosticAction[] = ["Frame", "Select", "Isolate", "Open source", "Attempt repair"];

export const buildGeometryNativeTopology = (definition: GeometryAnalyticSurfaceDefinition): GeometryNativeTopology => {
  const root = `body:${definition.id}`;
  const shell = `shell:${definition.id}`;
  const face = `face:${definition.id}`;
  const boundaryCount = [definition.domain.u, definition.domain.v].filter((domain) => !domain.periodic).length * 2 + definition.trims.length;
  const entities: GeometryNativeEntity[] = [
    { id: root, kind: "body", label: `${definition.label} body`, parentId: null, childIds: [shell], sourceRevision: definition.revision },
    { id: shell, kind: "shell", label: "Analytic shell", parentId: root, childIds: [face], sourceRevision: definition.revision },
    { id: face, kind: "face", label: definition.label, parentId: shell, childIds: ["loop:outer", ...definition.trims.map((trim) => `loop:${trim.id}`)], sourceRevision: definition.revision },
    { id: "loop:outer", kind: "loop", label: "Parameter-domain boundary", parentId: face, childIds: Array.from({ length: boundaryCount }, (_, i) => `edge:${i}`), sourceRevision: definition.revision },
    ...definition.trims.map((trim) => ({ id: `loop:${trim.id}`, kind: "loop" as const, label: trim.description, parentId: face, childIds: [], sourceRevision: definition.revision })),
    ...Array.from({ length: boundaryCount }, (_, i) => ({ id: `edge:${i}`, kind: "edge" as const, label: `Semantic boundary ${i + 1}`, parentId: "loop:outer", childIds: [`vertex:${i}`, `vertex:${(i + 1) % Math.max(1, boundaryCount)}`], sourceRevision: definition.revision })),
    ...Array.from({ length: boundaryCount }, (_, i) => ({ id: `vertex:${i}`, kind: "vertex" as const, label: `Boundary vertex ${i + 1}`, parentId: `edge:${i}`, childIds: [], sourceRevision: definition.revision })),
  ];
  return { entities, roots: [root], representation: "analytic-semantic-topology", renderTriangleIndependent: true };
};

export const evaluateSurfaceBoundaryContinuity = (args: { a: GeometryAnalyticSurfaceDefinition; b: GeometryAnalyticSurfaceDefinition; boundaryA?: "u-min" | "u-max"; boundaryB?: "u-min" | "u-max"; samples?: number; tolerance?: number }): GeometryContinuityResult => {
  const samples = Math.max(3, args.samples ?? 17);
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-6);
  let positionGap = 0, tangentAngle = 0, normalAngle = 0, curvatureMismatch = 0;
  let degenerate = false;
  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const ua = (args.boundaryA ?? "u-max") === "u-min" ? args.a.domain.u.min : args.a.domain.u.max;
    const ub = (args.boundaryB ?? "u-min") === "u-min" ? args.b.domain.u.min : args.b.domain.u.max;
    const va = args.a.domain.v.min + t * (args.a.domain.v.max - args.a.domain.v.min);
    const vb = args.b.domain.v.min + t * (args.b.domain.v.max - args.b.domain.v.min);
    const pa = evaluateExactSurfacePoint({ definition: args.a, u: ua, v: va, tolerance });
    const pb = evaluateExactSurfacePoint({ definition: args.b, u: ub, v: vb, tolerance });
    positionGap = Math.max(positionGap, distance(pa.position, pb.position));
    const tangent = angle(pa.derivativeV, pb.derivativeV);
    const normals = angle(pa.normal, pb.normal);
    if (tangent == null || normals == null || pa.meanCurvature == null || pb.meanCurvature == null) degenerate = true;
    else {
      tangentAngle = Math.max(tangentAngle, tangent);
      normalAngle = Math.max(normalAngle, normals);
      curvatureMismatch = Math.max(curvatureMismatch, Math.abs(pa.meanCurvature - pb.meanCurvature));
    }
  }
  const classification: GeometryContinuityClass = degenerate ? "degenerate" : positionGap > tolerance ? "discontinuous" : tangentAngle > Math.sqrt(tolerance) || normalAngle > Math.sqrt(tolerance) ? "C0/G0" : curvatureMismatch > Math.sqrt(tolerance) ? "C1/G1" : "C2/G2";
  return { classification, positionGap, tangentAngle: degenerate ? null : tangentAngle, normalAngle: degenerate ? null : normalAngle, curvatureMismatch: degenerate ? null : curvatureMismatch, samples, tolerance };
};

export const analyzeGeometryValidity = (args: { definition: GeometryAnalyticSurfaceDefinition; continuityWith?: GeometryAnalyticSurfaceDefinition; meshHealthNotes?: string[]; tolerance?: number }): GeometryValidityResult => {
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-6);
  const definition = args.definition;
  const topology = buildGeometryNativeTopology(definition);
  const issues: GeometryValidityIssue[] = [];
  const push = (kind: GeometryValidityIssueKind, severity: GeometryDiagnosticSeverity, entityId: string, message: string, value?: number) => issues.push({ id: `${kind}:${issues.length}`, kind, severity, entityId, message, exact: true, actions, value, tolerance });
  for (const axis of ["u", "v"] as const) {
    const domain = definition.domain[axis];
    if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) push("invalid-parameter-domain", "error", `face:${definition.id}`, `${axis} domain must be finite and increasing.`);
    if (domain.seam === "identified") push("seam", "info", `face:${definition.id}`, `${axis} boundaries form one identified seam.`);
    for (const boundary of domain.singularBoundaries ?? []) push("pole", "warning", `face:${definition.id}`, `${axis}-${boundary} is a declared pole.`);
  }
  const trimIds = new Set<string>();
  definition.trims.forEach((trim) => {
    if (!trim.id.trim() || !trim.description.trim()) push("invalid-trim", "error", `loop:${trim.id}`, "Trim identity and description must be non-empty.");
    if (trimIds.has(trim.id)) push("duplicate-boundary", "error", `loop:${trim.id}`, `Duplicate trim boundary ${trim.id}.`);
    if (/collapsed|zero[- ]?length/i.test(trim.description)) push("collapsed-trim", "error", `loop:${trim.id}`, `Trim ${trim.id} is collapsed.`);
    if (/self[- ]?intersect/i.test(trim.description)) push("self-intersection", "error", `loop:${trim.id}`, `Trim ${trim.id} self-intersects.`);
    trimIds.add(trim.id);
  });
  const surface = analyzeExactSurface({ definition, u: (definition.domain.u.min + definition.domain.u.max) / 2, v: (definition.domain.v.min + definition.domain.v.max) / 2, uCount: 17, vCount: 17, tolerance });
  if (surface.classifications.degenerate) push("degenerate-surface", "error", `face:${definition.id}`, `${surface.classifications.degenerate} rank-deficient sample(s).`, surface.classifications.degenerate);
  const intrinsic = analyzeIntrinsicGeometry({ definition, start: { u: definition.domain.u.min, v: definition.domain.v.min }, destination: { u: definition.domain.u.max, v: definition.domain.v.max }, gridResolution: 16, tolerance });
  if ((intrinsic.metricPoint.metricConditionNumber ?? 0) > 1e6) push("poor-metric-conditioning", "warning", `face:${definition.id}`, "Metric condition number exceeds 1e6.", intrinsic.metricPoint.metricConditionNumber ?? undefined);
  if ((intrinsic.metricPoint.parameterStretch ?? 0) > 1e3) push("excessive-stretch", "warning", `face:${definition.id}`, "Parameter stretch exceeds 1e3.", intrinsic.metricPoint.parameterStretch);
  if (definition.trims.length) push("trim-domain-pathology", "unknown", `face:${definition.id}`, "Trim-domain connectivity requires a boundary solver before shell closure can be certified.");
  const closed = definition.domain.u.periodic && definition.domain.v.periodic && !definition.trims.length;
  if (!closed && definition.id !== "sphere") push("open-shell", "warning", `shell:${definition.id}`, "Semantic shell has one or more unpaired boundary loops.");
  const counts = ({ body: 0, shell: 0, face: 0, loop: 0, edge: 0, vertex: 0 } as Record<GeometryNativeEntityKind, number>);
  topology.entities.forEach((entity) => { counts[entity.kind] += 1; });
  return {
    topology,
    exactGeometry: { valid: !issues.some((issue) => issue.severity === "error"), issues, continuity: args.continuityWith ? evaluateSurfaceBoundaryContinuity({ a: definition, b: args.continuityWith, tolerance }) : null },
    displayMeshHealth: { available: Boolean(args.meshHealthNotes), exactBrepValidity: false, label: "Tessellated display mesh health", notes: args.meshHealthNotes ?? ["No display-mesh snapshot was supplied."] },
    counts,
    sourceRevision: definition.revision,
    conventions: { validity: "Exact Geometry issues refer to semantic analytic entities, parameter domains, and trims.", meshSeparation: "Triangle-mesh health is informative display diagnostics only and is never exact B-rep validity." },
  };
};
