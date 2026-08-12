export type MeshBenchmarkExpectedMetrics = {
  readonly boundaryEdges?: number;
  readonly boundaryLoops?: number;
  readonly closed?: boolean;
  readonly components?: number;
  readonly degenerateFacesAtLeast?: number;
  readonly edges?: number;
  readonly eulerCharacteristic?: number;
  readonly faces?: number;
  readonly genus?: number;
  readonly nonManifoldEdges?: number;
  readonly orientationConsistent?: boolean;
  readonly selfIntersectionPairsAtLeast?: number;
  readonly vertices?: number;
};

export type MeshBenchmarkExpected = {
  readonly computedReference?: MeshBenchmarkExpectedMetrics & {
    readonly closedByEdgeIncidence?: boolean;
  };
  readonly expected?: MeshBenchmarkExpectedMetrics;
  readonly expectedAfterSpatialWeld?: MeshBenchmarkExpectedMetrics & {
    readonly uniqueVertices?: number;
  };
  readonly file?: string;
  readonly generated?: boolean;
  readonly purpose?: string;
  readonly rawTriangleCornerCount?: number;
};

export type MeshBenchmarkActualMetrics = {
  readonly boundaryEdges: number | null;
  readonly boundaryLoops: number | null;
  readonly closed: boolean | null;
  readonly components: number | null;
  readonly degenerateFaces: number | null;
  readonly edges: number | null;
  readonly eulerCharacteristic: number | null;
  readonly faces: number | null;
  readonly nonManifoldEdges: number | null;
  readonly orientationConsistent: boolean | null;
  readonly selfIntersectionPairs: number | null;
  readonly vertices: number | null;
};

export type MeshBenchmarkVerificationRow = {
  readonly id: string;
  readonly label: string;
  readonly expected: number | boolean;
  readonly actual: number | boolean | null;
  readonly comparator: "equals" | "atLeast";
  readonly passes: boolean;
  readonly highlightKind?: "boundary";
};

export const hasMeshBenchmarkExpectedMetrics = (expected: MeshBenchmarkExpected | null | undefined): boolean =>
  Boolean(expected?.expected && Object.keys(expected.expected).length > 0) ||
  Boolean(expected?.expectedAfterSpatialWeld && Object.keys(expected.expectedAfterSpatialWeld).length > 0);

const compareBenchmarkValue = (
  actual: number | boolean | null,
  expected: number | boolean,
  comparator: MeshBenchmarkVerificationRow["comparator"]
): boolean => {
  if (actual == null) return false;
  if (comparator === "atLeast") {
    return typeof actual === "number" && typeof expected === "number" && actual >= expected;
  }
  return actual === expected;
};

const row = (
  id: string,
  label: string,
  expected: number | boolean | undefined,
  actual: number | boolean | null,
  comparator: MeshBenchmarkVerificationRow["comparator"] = "equals",
  highlightKind?: MeshBenchmarkVerificationRow["highlightKind"]
): MeshBenchmarkVerificationRow[] => {
  if (expected == null) return [];
  return [
    {
      id,
      label,
      expected,
      actual,
      comparator,
      passes: compareBenchmarkValue(actual, expected, comparator),
      highlightKind,
    },
  ];
};

export const buildMeshBenchmarkVerificationRows = (
  expected: MeshBenchmarkExpected | null | undefined,
  actual: MeshBenchmarkActualMetrics
): MeshBenchmarkVerificationRow[] => {
  const exact = expected?.expected;
  const welded = expected?.expectedAfterSpatialWeld;
  if (!exact && !welded) return [];

  return [
    ...row("vertices", "Vertices", welded?.uniqueVertices ?? exact?.vertices, actual.vertices),
    ...row("faces", "Faces", welded?.faces ?? exact?.faces, actual.faces),
    ...row("edges", "Edges", welded?.edges ?? exact?.edges, actual.edges),
    ...row("components", "Components", exact?.components, actual.components),
    ...row("boundaryEdges", "Boundary edges", welded?.boundaryEdges ?? exact?.boundaryEdges, actual.boundaryEdges, "equals", "boundary"),
    ...row("boundaryLoops", "Boundary loops", exact?.boundaryLoops, actual.boundaryLoops, "equals", "boundary"),
    ...row("nonManifoldEdges", "Non-manifold edges", exact?.nonManifoldEdges, actual.nonManifoldEdges),
    ...row("degenerateFaces", "Degenerate faces", exact?.degenerateFacesAtLeast, actual.degenerateFaces, "atLeast"),
    ...row("selfIntersectionPairs", "Self-intersection pairs", exact?.selfIntersectionPairsAtLeast, actual.selfIntersectionPairs, "atLeast"),
    ...row("closed", "Closed", exact?.closed, actual.closed, "equals", "boundary"),
    ...row("orientationConsistent", "Orientation consistent", exact?.orientationConsistent, actual.orientationConsistent),
    ...row("eulerCharacteristic", "Euler characteristic", welded?.eulerCharacteristic ?? exact?.eulerCharacteristic, actual.eulerCharacteristic),
  ];
};

export const meshBenchmarkVerificationPasses = (rows: readonly MeshBenchmarkVerificationRow[]): boolean =>
  rows.length > 0 && rows.every((entry) => entry.passes);
