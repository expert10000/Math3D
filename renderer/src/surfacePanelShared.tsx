import React from "react";
import * as THREE from "three";
import { type SharedInspectorCategory } from "./components/SharedInspectorShell";
import { type MeshOperationResultSummary } from "./components/MeshOperationsPanel";
import { type SurfaceId, type ColorMode, type SurfacePerformanceSnapshot } from "./components/SurfaceViewer";
import { type ParamSurfaceId } from "./components/ParamSurfaceViewer";
import { type GeometryPickKind, type GeometryPickResult, type GeometryTopologyReference } from "./geometry/picking";
import { type ComplexMapSweepSpec } from "./math/complexMapSweep";
import { buildSurfaceMeshFromGeometry, type SurfaceMeshData } from "./mesh/surfaceMesh";
import { computeAdjacency, computeMeanEdgeLength, computeVertexNormals, validateMesh } from "./mesh/meshOps";
import { type EdgeCollapseMode, type FaceSubdivideMode } from "./mesh/meshEditOps";
import { type MeshTopologyEditDefinition } from "./mesh/topologyEditDefinition";
import { type MeshDifferentialGeometryProbe } from "./mesh/meshDifferentialGeometry";
import { type MeshAnalysisFocusedSection } from "./mesh/activeAnalysisResult";
import { type MeshBenchmarkExpected } from "./mesh/meshBenchmarkVerification";
import { type VolumePresetId } from "./scene/volume/volumePresets";

export type MeshOperationLastValidation = {
  meshLabel: string;
  meshKey?: string;
  status: MeshOperationResultSummary["status"];
  validation: NonNullable<MeshOperationResultSummary["validation"]>;
  timestamp: number;
};

export type SurfaceViewerKind = "implicit" | "graph" | "param" | "weierstrass" | "mesh" | "complex";

export type ChartMode = "auto" | "xy" | "uv" | "local";

export type SurfaceMeshAssetPreset = {
  id: string;
  label: string;
  assetUrl: string;
  fileName: string;
};

export type MeshBenchmarkCategory = "basic" | "standard" | "mathematical" | "problematic" | "stress" | "libigl";

export type MeshBenchmarkTestKind = "import" | "topology" | "boundary" | "selection" | "analysis" | "performance";

export type MeshBenchmarkModel = {
  id: string;
  label: string;
  category: MeshBenchmarkCategory;
  relativePath: string;
  fileName: string;
  tests: MeshBenchmarkTestKind[];
  expected?: MeshBenchmarkExpected;
};

export type MeshBenchmarkVerificationContext = {
  model: MeshBenchmarkModel;
};

export type MeshBenchmarkPerformanceResult = {
  id: string;
  label: string;
  fileName: string;
  status: "passed" | "failed";
  error?: string;
  fileReadMs: number | null;
  importMs: number | null;
  fastObjDetectMs: number | null;
  fastObjParseMs: number | null;
  vertexParseMs: number | null;
  faceParseMs: number | null;
  indexBuildMs: number | null;
  vertexWeldMs: number | null;
  normalComputeMs: number | null;
  adjacencyMs: number | null;
  topologyMs: number | null;
  qualityMs: number | null;
  diagnosticsMs: number | null;
  curvatureMs: number | null;
  meshAnalyzeMs: number | null;
  meshBuildMs: number | null;
  memoryBytes: number | null;
  vertices: number | null;
  triangles: number | null;
};

export type MeshBenchmarkPerformanceSuiteState = {
  running: boolean;
  status: string | null;
  results: MeshBenchmarkPerformanceResult[];
  startedAt: number | null;
  completedAt: number | null;
};

export type MeshPipelineProfilePhase = {
  phase: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
};

export type MeshPipelineProfileRun = {
  id: string;
  label: string;
  fileName: string | null;
  status: "loading" | "ready" | "failed";
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  error?: string;
  vertices: number | null;
  triangles: number | null;
  memoryBytes: number | null;
  firstFrameMs: number | null;
  firstFrameSnapshot: SurfacePerformanceSnapshot | null;
  phases: MeshPipelineProfilePhase[];
};

export type MeshDebugMemorySnapshot = {
  sampledAt: number;
  rendererPid: number | null;
  workingSetBytes: number | null;
  workingSetGb: number | null;
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
  gpuEstimateBytes: number | null;
  rendererGeometries: number | null;
  rendererTextures: number | null;
  warning: string | null;
};

export type MeshDebugEvent = {
  id: number;
  ts: number;
  kind:
    | "load"
    | "phase"
    | "alloc"
    | "viewer"
    | "quality"
    | "stall"
    | "memory"
    | "full"
    | "interaction"
    | "window"
    | "error";
  label: string;
  ms?: number;
  details?: Record<string, unknown>;
};

export type MeshDebugMonitorState = {
  enabled: boolean;
  startedAt: number;
  events: MeshDebugEvent[];
  memory: MeshDebugMemorySnapshot | null;
  lastSnapshot: SurfacePerformanceSnapshot | null;
  stallCount: number;
  worstStallMs: number;
};

export const MESH_BENCHMARK_CATEGORY_LABELS: Record<MeshBenchmarkCategory, string> = {
  basic: "Basic",
  standard: "Standard",
  mathematical: "Mathematical",
  problematic: "Problematic",
  stress: "Stress",
  libigl: "Libigl",
};

export const MESH_BENCHMARK_CATEGORY_ORDER: MeshBenchmarkCategory[] = [
  "basic",
  "standard",
  "mathematical",
  "problematic",
  "stress",
  "libigl",
];

export type SurfaceMeshTopologyDemoPreset = {
  id: string;
  label: string;
  operation: SurfaceMeshTopologyOperation;
  summary: string;
  tryHint: string;
  expectedResult: string;
  workflowHint?: string;
  workflowKind?: "operation" | "round-trip";
  build: () => SurfaceMeshData;
  faceIndex: number;
  edge: [number, number];
  subdivideMode?: FaceSubdivideMode;
  splitRatio?: number;
  collapseMode?: EdgeCollapseMode;
  bevelAmount?: number;
};

export type SurfaceMeshTopologyOperation =
  | "Face Subdivide"
  | "Extrude Face"
  | "Inset Face"
  | "Split Edge"
  | "Collapse Edge"
  | "Bevel Edge"
  | "Move Vertex";

export const SURFACE_MESH_TOPOLOGY_OPERATION_OPTIONS: SurfaceMeshTopologyOperation[] = [
  "Face Subdivide",
  "Extrude Face",
  "Inset Face",
  "Split Edge",
  "Collapse Edge",
  "Bevel Edge",
  "Move Vertex",
];

export type MeshPromotionOperationEntry = {
  id: string;
  label: string;
  at: number;
  result?: MeshOperationResultSummary;
};

export type MeshPromotionTraceState = {
  relationId: string;
  sourceGeometryObjectId: string;
  sourceGeometryObjectName: string;
  snapshotIndex: number;
  snapshotLabel: string;
  promotedAt: number;
  frozen: boolean;
  initialMeshSignature: string;
  operationHistory: MeshPromotionOperationEntry[];
  compareMeshObjectId: string | null;
};

export type GraphDomain = { xSpan: number; ySpan: number };

export type ImplicitDomain = { xSpan: number; ySpan: number };

export type ImplicitBakeBounds = { xSpan: number; ySpan: number; zSpan: number };

export type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };

export type ComplexMapLine = { axis: "u" | "v"; value: number } | null;

export type SurfaceWorkflowStepId =
  | "equation"
  | "parse"
  | "domain"
  | "preview"
  | "analyze"
  | "mesh"
  | "promote"
  | "save";

export type SurfaceWorkflowStepState = "done" | "active" | "available" | "disabled";

export type ComplexPreimageMode = "none" | "re" | "im" | "abs" | "arg";

export type ComplexDistortionMode = "none" | "area" | "anisotropy" | "conformal";

export type ComplexMapProbe = {
  u: number;
  v: number;
  w: { re: number; im: number; mag: number; arg: number };
  det: number;
  detAbs: number;
  sigmaMax: number;
  sigmaMin: number;
  ratio: number;
  conformalErr: number;
  localScale: number;
  source: "z" | "w" | "surface";
};

export type ComplexMapProbePin = ComplexMapProbe & { id: string; label?: string };

export type CgalHealthState = {
  ok: boolean;
  statusMessage: string;
  backend?: "python-script" | "bundled-exe";
  version?: string;
  protocol?: string;
  logsPath?: string;
  checkedAt: number;
  error?: string;
  errorCategory?: string;
};

export type GenerateSurfaceStatus = {
  state: "idle" | "success" | "error";
  message: string;
  at: number;
};

export type MeshPerfBenchmarkId =
  | "tri-50k"
  | "tri-250k"
  | "tri-1m"
  | "tri-250k-wireframe"
  | "tri-250k-normals"
  | "tri-250k-picking";

export type MeshPerfBenchmarkPreset = {
  id: MeshPerfBenchmarkId;
  label: string;
  targetTriangles: number;
  enableWireframe?: boolean;
  enableInspect?: boolean;
  enableNormalsOverlay?: boolean;
};

export const MESH_PERF_BENCHMARK_PRESETS: MeshPerfBenchmarkPreset[] = [
  { id: "tri-50k", label: "50k triangles", targetTriangles: 50_000 },
  { id: "tri-250k", label: "250k triangles", targetTriangles: 250_000 },
  { id: "tri-1m", label: "1M triangles", targetTriangles: 1_000_000 },
  { id: "tri-250k-wireframe", label: "250k + wireframe", targetTriangles: 250_000, enableWireframe: true },
  { id: "tri-250k-normals", label: "250k + normals", targetTriangles: 250_000, enableNormalsOverlay: true },
  { id: "tri-250k-picking", label: "250k + face picking", targetTriangles: 250_000, enableInspect: true },
];

export const benchmarkNowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export const serializeMeshPipelineProfileRun = (run: MeshPipelineProfileRun) => ({
  id: run.id,
  label: run.label,
  fileName: run.fileName,
  status: run.status,
  elapsedMs: Math.max(0, (run.completedAt ?? run.updatedAt) - run.startedAt),
  vertices: run.vertices,
  triangles: run.triangles,
  memoryBytes: run.memoryBytes,
  firstFrameMs: run.firstFrameMs,
  firstFrameSnapshot: run.firstFrameSnapshot,
  phases: run.phases.map((phase) => ({
    phase: phase.phase,
    count: phase.count,
    totalMs: Number(phase.totalMs.toFixed(2)),
    maxMs: Number(phase.maxMs.toFixed(2)),
    lastMs: Number(phase.lastMs.toFixed(2)),
  })),
  error: run.error,
});

export const serializeMeshDebugMonitorState = (state: MeshDebugMonitorState, profile: MeshPipelineProfileRun | null) => ({
  capturedAt: new Date().toISOString(),
  monitor: {
    enabled: state.enabled,
    startedAt: new Date(state.startedAt).toISOString(),
    stallCount: state.stallCount,
    worstStallMs: Number(state.worstStallMs.toFixed(2)),
    memory: state.memory,
    lastSnapshot: state.lastSnapshot,
    events: state.events,
  },
  pipelineProfile: profile ? serializeMeshPipelineProfileRun(profile) : null,
});

export const formatBenchmarkBytes = (bytes: number | null | undefined): string => {
  if (bytes == null || !Number.isFinite(bytes)) return "n/a";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
};

export const LARGE_MESH_FAST_LOAD_TRIANGLE_THRESHOLD = 50_000;

export const surfaceMeshTriangleCount = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): number => {
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  return mesh.indices?.length ? Math.floor(mesh.indices.length / 3) : Math.floor(vertexCount / 3);
};

export type DeferredSurfaceSampleSetInfo = {
  label: string | null;
  triangles: number | null;
  sampleCount: number;
  meshDataBytes: number | null;
  storedAt: number;
  firstFrameSeen: boolean;
  releaseReason: "manual";
};

export const applySurfaceMeshOps = (
  mesh: SurfaceMeshData,
  options?: { fastLargeMesh?: boolean; onStage?: (phase: string, ms: number) => void }
): SurfaceMeshData => {
  let next = mesh;
  const triangleCount = surfaceMeshTriangleCount(next);
  const shouldDeferLargeMeshPrep =
    options?.fastLargeMesh === true && triangleCount >= LARGE_MESH_FAST_LOAD_TRIANGLE_THRESHOLD;
  if (!mesh.normals || mesh.normals.length < mesh.positions.length) {
    if (shouldDeferLargeMeshPrep) {
      options?.onStage?.("prep:vertexNormalsDeferred", 0);
    } else {
      const normalStart = benchmarkNowMs();
      next = computeVertexNormals(next);
      options?.onStage?.("prep:vertexNormals", benchmarkNowMs() - normalStart);
    }
  }
  const shouldDeferAdjacency = shouldDeferLargeMeshPrep;
  if (!shouldDeferAdjacency) {
    const adjacencyStart = benchmarkNowMs();
    next = computeAdjacency(next);
    options?.onStage?.("prep:adjacency", benchmarkNowMs() - adjacencyStart);
  } else {
    options?.onStage?.("prep:adjacencySkipped", 0);
  }
  const meanEdgeStart = benchmarkNowMs();
  next = computeMeanEdgeLength(next);
  options?.onStage?.("prep:meanEdge", benchmarkNowMs() - meanEdgeStart);
  if (shouldDeferAdjacency) {
    next = { ...next, validation: null };
    options?.onStage?.("prep:validateDeferred", 0);
  } else {
    const validateStart = benchmarkNowMs();
    next = validateMesh(next);
    options?.onStage?.("prep:validate", benchmarkNowMs() - validateStart);
  }
  return next;
};

export const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type GeometryProbeSelectionMode = GeometryPickKind;

export type GeometryProbePoint = { x: number; y: number; z: number };

export type GeometryProbeSelectionDetails = {
  mode: GeometryProbeSelectionMode;
  pick: GeometryPickResult | null;
  meshKey: string | null;
  objectId: string | null;
  objectLabel: string;
  objectType: string;
  topologyVersion: number | null;
  label: string;
  stale: boolean;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  faceNormal: { x: number; y: number; z: number } | null;
  surfaceNormal: { x: number; y: number; z: number } | null;
  vertexNormal: { x: number; y: number; z: number } | null;
  tangent: { x: number; y: number; z: number } | null;
  bitangent: { x: number; y: number; z: number } | null;
  tangentKind: GeometryPickResult["tangentKind"] | null;
  barycentric: [number, number, number] | null;
  sourceTriangle: [number, number, number] | null;
  edgeLength: number | null;
  faceArea: number | null;
  vertexTopology: GeometryPickResult["vertexTopology"] | null;
  edgeTopology: GeometryPickResult["edgeTopology"] | null;
  faceTopology: GeometryPickResult["faceTopology"] | null;
  faceIndex: number | null;
  vertexIndex: number | null;
  edgeVertexPair: [number, number] | null;
  edgeKey: string | null;
  topologyReference: GeometryTopologyReference | null;
  edgePoints: [GeometryProbePoint, GeometryProbePoint] | null;
  faceVertices: GeometryProbePoint[] | null;
};

export type MeshWorkspaceInspectorSummary = {
  meshCount: number;
  linkedGeometryCount: number;
  selectedCount: number;
  vertexCount: number;
  faceCount: number;
  bounds: BBox3 | null;
  stateLabel: string;
};

export type SurfaceMeshTopologyPickMode = "object" | "face" | "edge" | "vertex";

export type MeshAnalyzeProbeHistoryEntry = {
  id: string;
  stamp: number;
  vertexIndex: number;
  point: GeometryProbePoint;
  K: number;
  H: number;
  k1: number;
  k2: number;
};

export type UnifiedSelectionTopologyFilterMode = "all" | "boundary" | "interior" | "non-manifold";

export type UnifiedSelectionKindFilterState = Record<SurfaceMeshTopologyPickMode, boolean>;

export const SURFACE_MESH_TOPOLOGY_PICK_MODES: readonly SurfaceMeshTopologyPickMode[] = ["object", "face", "edge", "vertex"];

export type SurfaceMeshTopologyHistoryEntry = {
  id: string;
  at: number;
  actionLabel: string;
  sourceLabel: string;
  targetLabel: string;
  paramsLabel: string;
  definition: MeshTopologyEditDefinition;
  resultLabel: string;
  beforeCounts: { vertexCount: number; faceCount: number };
  afterCounts: { vertexCount: number; faceCount: number };
  selectedResultLabel: string;
  beforeSnapshot: SurfaceMeshData;
  snapshot: SurfaceMeshData;
};

export type TopologySerializedSurfaceMeshData = {
  label: string;
  positions: number[];
  indices: number[] | null;
  normals?: number[] | null;
  uvs?: number[] | null;
  source: SurfaceMeshData["source"];
  adjacency?: number[][] | null;
  meanEdgeLength?: number | null;
  validation?: SurfaceMeshData["validation"] | null;
};

export type StoredSurfaceMeshTopologyHistoryEntry = Omit<
  SurfaceMeshTopologyHistoryEntry,
  "beforeSnapshot" | "snapshot"
> & {
  beforeSnapshot: TopologySerializedSurfaceMeshData;
  snapshot: TopologySerializedSurfaceMeshData;
};

export type SurfaceMeshTopologySavedPreset = {
  id: string;
  name: string;
  createdAt: number;
  summary: string;
  mesh: TopologySerializedSurfaceMeshData;
  history: StoredSurfaceMeshTopologyHistoryEntry[];
  includesTransform?: boolean;
  detailsLabel?: string;
};

export const WEIERSTRASS_DEFAULTS = {
  gExpr: "z",
  phiExpr: "1",
  domain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
  resolution: 80,
  recenter: true,
};

export const COMPLEX_MAP_PRESETS = [
  { id: "z", label: "w = z", reExpr: "u", imExpr: "v" },
  { id: "z2", label: "w = z^2", reExpr: "u^2 - v^2", imExpr: "2*u*v" },
  { id: "z3", label: "w = z^3", reExpr: "u^3 - 3*u*v^2", imExpr: "3*u^2*v - v^3" },
  { id: "exp", label: "w = exp(z)", reExpr: "exp(u) * cos(v)", imExpr: "exp(u) * sin(v)" },
];

export const COMPLEX_MAP_CUSTOM_ID = "custom";

export const COMPLEX_MAP_LABEL = "Complex Map Sweep (z→w)";

export const COMPLEX_MAP_OUTPUT_LABELS: Record<ComplexMapSweepSpec["outputMode"], string> = {
  sweep: COMPLEX_MAP_LABEL,
  re: "Complex Map Surface (Re)",
  im: "Complex Map Surface (Im)",
  both: "Complex Map Surfaces (Re + Im)",
};

export const COMPLEX_MAP_LABEL_SET = new Set(Object.values(COMPLEX_MAP_OUTPUT_LABELS));

export const RIEMANN_SURFACE_PREFIX = "Riemann surface";

export const isComplexMapSurfaceLabel = (label?: string | null) =>
  !!label && (COMPLEX_MAP_LABEL_SET.has(label) || label.startsWith(RIEMANN_SURFACE_PREFIX));

export const COMPLEX_GRID_COLORS = {
  u: "#1f77b4",
  v: "#e67e22",
};

export const DEFAULT_VOLUME_PRESET_ID: VolumePresetId = "sphere";

export const createSurfaceMeshTopologyDemoMesh = (
  label: string,
  positions: number[],
  indices: number[],
  id: string
): SurfaceMeshData =>
  applySurfaceMeshOps({
    label,
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    normals: null,
    uvs: null,
    source: { kind: "polyhedronPreset", id, label },
  });

export const buildTopologyDemoCubeMesh = (label = "Topology demo cube"): SurfaceMeshData =>
  createSurfaceMeshTopologyDemoMesh(
    label,
    [
      -1, -1, -1,
      1, -1, -1,
      1, 1, -1,
      -1, 1, -1,
      -1, -1, 1,
      1, -1, 1,
      1, 1, 1,
      -1, 1, 1,
    ],
    [
      0, 2, 1,
      0, 3, 2,
      4, 5, 6,
      4, 6, 7,
      0, 1, 5,
      0, 5, 4,
      3, 6, 2,
      3, 7, 6,
      1, 2, 6,
      1, 6, 5,
      0, 4, 7,
      0, 7, 3,
    ],
    "mesh-topology-demo-cube"
  );

export const buildTopologyDemoPyramidMesh = (label = "Topology demo pyramid"): SurfaceMeshData =>
  createSurfaceMeshTopologyDemoMesh(
    label,
    [
      -1.1, -0.8, -1.1,
      1.1, -0.8, -1.1,
      1.1, -0.8, 1.1,
      -1.1, -0.8, 1.1,
      0, 1.2, 0,
    ],
    [
      0, 1, 2,
      0, 2, 3,
      0, 4, 1,
      1, 4, 2,
      2, 4, 3,
      3, 4, 0,
    ],
    "mesh-topology-demo-pyramid"
  );

export const buildTopologyDemoPrismMesh = (label = "Topology demo prism cap"): SurfaceMeshData =>
  createSurfaceMeshTopologyDemoMesh(
    label,
    [
      -1, -0.9, -0.7,
      1, -0.9, -0.7,
      1.25, -0.9, 0.7,
      0, -0.9, 1.35,
      -1.25, -0.9, 0.7,
      -1, 0.9, -0.7,
      1, 0.9, -0.7,
      1.25, 0.9, 0.7,
      0, 0.9, 1.35,
      -1.25, 0.9, 0.7,
    ],
    [
      0, 1, 2,
      0, 2, 3,
      0, 3, 4,
      5, 7, 6,
      5, 8, 7,
      5, 9, 8,
      0, 5, 6,
      0, 6, 1,
      1, 6, 7,
      1, 7, 2,
      2, 7, 8,
      2, 8, 3,
      3, 8, 9,
      3, 9, 4,
      4, 9, 5,
      4, 5, 0,
    ],
    "mesh-topology-demo-prism"
  );

export const buildTopologyRoundTripBoxMesh = (label = "Round-trip segmented box"): SurfaceMeshData =>
  buildSurfaceMeshFromGeometry(
    new THREE.BoxGeometry(1.8, 1.8, 1.8, 10, 10, 10),
    label,
    { kind: "polyhedronPreset", id: "mesh_box", label },
    { mergeVertices: true }
  );

export const SURFACE_MESH_TOPOLOGY_DEMO_PRESETS: SurfaceMeshTopologyDemoPreset[] = [
  {
    id: "topology_roundtrip_box_subdivide",
    label: "Round-trip box subdivide",
    operation: "Face Subdivide",
    summary: "Segmented Box face -> Mesh edit -> Promote -> restore/apply back.",
    tryHint: "Load the Box face, subdivide it, then Open in Geometry and use Restore Before/After.",
    expectedResult: "Face 848 becomes a center fan; Geometry can restore before/after and apply that Mesh state back.",
    workflowHint: "Workflow: Mesh object -> Face Subdivide -> Promote -> Restore/Apply to Geometry.",
    workflowKind: "round-trip",
    build: () => buildTopologyRoundTripBoxMesh("Round-trip: Box face subdivide"),
    faceIndex: 848,
    edge: [0, 1],
    subdivideMode: "center-fan",
  },
  {
    id: "topology_roundtrip_cube_split",
    label: "Round-trip cube split",
    operation: "Split Edge",
    summary: "Cube edge split -> promoted Geometry object -> apply selected Mesh state back.",
    tryHint: "Load the cube edge, split it, Promote, then return through the linked Mesh source card.",
    expectedResult: "Edge 4-5 gains a midpoint vertex; the promoted Geometry object keeps the source history.",
    workflowHint: "Workflow: Mesh object -> Split Edge -> Promote -> Open Mesh Source -> Apply back.",
    workflowKind: "round-trip",
    build: () => buildTopologyDemoCubeMesh("Round-trip: cube split edge"),
    faceIndex: 2,
    edge: [4, 5],
    splitRatio: 0.5,
  },
  {
    id: "topology_roundtrip_cube_bevel",
    label: "Round-trip cube bevel",
    operation: "Bevel Edge",
    summary: "Cube bevel band -> promoted Geometry object -> before/after Mesh source preview.",
    tryHint: "Load the bevel edge, run Bevel, Promote, then compare Restore Before vs Restore After.",
    expectedResult: "Edge 1-2 opens into a bevel band; Geometry shows linked Mesh edit source and restore actions.",
    workflowHint: "Workflow: Mesh object -> Bevel Edge -> Promote -> Restore Before/After -> Apply back.",
    workflowKind: "round-trip",
    build: () => buildTopologyDemoCubeMesh("Round-trip: cube bevel edge"),
    faceIndex: 8,
    edge: [1, 2],
    bevelAmount: 0.12,
  },
  {
    id: "topology_demo_face_fan",
    label: "Face fan demo",
    operation: "Face Subdivide",
    summary: "Triangular face -> center fan triangles.",
    tryHint: "Load a pyramid, then press Subdivide Face.",
    expectedResult: "Face 2 becomes a center fan with one new vertex and two extra faces.",
    build: () => buildTopologyDemoPyramidMesh("Demo: face subdivide fan"),
    faceIndex: 2,
    edge: [0, 4],
    subdivideMode: "center-fan",
  },
  {
    id: "topology_demo_split_edge",
    label: "Split edge demo",
    operation: "Split Edge",
    summary: "Shared cube edge -> midpoint vertex.",
    tryHint: "Load a cube with Edge 4-5 selected, then press Split Edge.",
    expectedResult: "Edge 4-5 gains a midpoint vertex and the adjacent faces are split.",
    build: () => buildTopologyDemoCubeMesh("Demo: split edge"),
    faceIndex: 2,
    edge: [4, 5],
    splitRatio: 0.5,
  },
  {
    id: "topology_demo_collapse_edge",
    label: "Collapse cleanup",
    operation: "Collapse Edge",
    summary: "Cap edge -> merged midpoint vertex.",
    tryHint: "Load a prism cap edge, then press Collapse Edge.",
    expectedResult: "Edge 1-2 merges to a midpoint vertex and removes the adjacent cap triangles.",
    build: () => buildTopologyDemoPrismMesh("Demo: collapse edge"),
    faceIndex: 0,
    edge: [1, 2],
    collapseMode: "midpoint",
  },
  {
    id: "topology_demo_bevel_edge",
    label: "Bevel rim",
    operation: "Bevel Edge",
    summary: "Cube edge -> narrow bevel band.",
    tryHint: "Load a cube rim edge, then press Bevel Edge.",
    expectedResult: "Edge 1-2 opens into a narrow bevel band with new support faces.",
    build: () => buildTopologyDemoCubeMesh("Demo: bevel edge"),
    faceIndex: 8,
    edge: [1, 2],
    bevelAmount: 0.12,
  },
];

export const findSurfaceMeshTopologyDemoPresetByOperation = (
  operation: SurfaceMeshTopologyDemoPreset["operation"]
): SurfaceMeshTopologyDemoPreset | null =>
  SURFACE_MESH_TOPOLOGY_DEMO_PRESETS.find(
    (preset) => preset.operation === operation && preset.workflowKind !== "round-trip"
  ) ??
  SURFACE_MESH_TOPOLOGY_DEMO_PRESETS.find((preset) => preset.operation === operation) ??
  null;

export const SURFACES_EQ_META: {
  id: SurfaceId;
  label: string;
  formula: string;
  note: string;
}[] = [
    { id: "sphere", label: "Sphere", formula: "x² + y² + z² = R²", note: "Perfectly symmetric in all directions." },
    { id: "hyperboloid", label: "Hyperboloid", formula: "x² + y² − z² = 1  (one sheet)", note: "Ruled surface; circles + hyperbolas." },
    { id: "paraboloid", label: "Paraboloid", formula: "z = x² + y²  (elliptic)", note: "Like a satellite dish; vertical sections are parabolas." },
    { id: "cone", label: "Cone", formula: "x² + y² = z²", note: "Double cone with vertex at the origin." },
    { id: "cylinder", label: "Cylinder", formula: "x² + y² = R²", note: "Circle extruded along an axis." },

    { id: "hyperboloid_twoSheet", label: "Two-sheet hyperboloid", formula: "z^2/c^2 - x^2/a^2 - y^2/b^2 = 1", note: "Two disconnected bowls along z." },
    { id: "ellipsoid", label: "Ellipsoid", formula: "x^2/a^2 + y^2/b^2 + z^2/c^2 = 1", note: "Stretched sphere with three radii." },
    { id: "torus_implicit", label: "Torus (implicit)", formula: "(sqrt(x^2+y^2)-R)^2 + z^2 = r^2", note: "Implicit donut surface." },
    { id: "gyroid", label: "Gyroid", formula: "sin x cos y + sin y cos z + sin z cos x = 0", note: "Triply periodic minimal surface." },
    { id: "superquadric", label: "Superquadric", formula: "|x|^n + |y|^n + |z|^n = 1", note: "Boxy to round as n varies." },
    { id: "roman", label: "Roman (Steiner) surface", formula: "x^2 y^2 + y^2 z^2 + z^2 x^2 - 2xyz = 0", note: "Classical self-intersecting quartic." },
    { id: "scherk", label: "Scherk minimal surface", formula: "sin z - sinh x sinh y = 0", note: "Periodic minimal surface with saddle sheets." },

    // graph surfaces
    { id: "graph_saddle", label: "Saddle graph", formula: "z = x² − y²", note: "Classical saddle; negative curvature at the origin." },
    { id: "graph_rotatedSaddle", label: "Rotated saddle", formula: "z = 2xy", note: "Same as x² − y² rotated by 45°." },
    { id: "graph_monkey", label: "Monkey saddle", formula: "z = x³ − 3xy²", note: "Saddle with 3 valleys; higher-order critical point." },
    { id: "graph_wave", label: "Wave", formula: "z = sin x · cos y", note: "Periodic surface; good for gradients." },
    { id: "graph_paraboloid", label: "Paraboloid graph", formula: "z = 0.3(x^2+y^2)", note: "Convex bowl; positive curvature." },
    { id: "graph_gaussian", label: "Gaussian bump", formula: "z = exp(-(x^2+y^2))", note: "Bell-shaped bump with fast decay." },
    { id: "graph_ripple", label: "Ripple", formula: "z = sin(3r)/(3r)", note: "Radial ripples, r = sqrt(x^2+y^2)." },
    { id: "graph_mexican", label: "Mexican hat", formula: "z = (1-r^2) exp(-r^2/2)", note: "Ring with a central peak." },
    { id: "graph_sinSum", label: "Sin+Cos", formula: "z = sin x + cos y", note: "Simple sinusoidal grid." },
    { id: "graph_sinc", label: "Sinc", formula: "z = sin r / r", note: "Radial sinc with gentle decay." },
    { id: "graph_sinc2", label: "Sinc (decay)", formula: "z = sin(2r) / (1 + r^2)", note: "Higher frequency with decay." },
    { id: "graph_custom", label: "Custom graph", formula: "z = f(x, y)", note: "User-defined graph expression in x,y." },

    // implicit custom
    { id: "implicit_custom", label: "Implicit surface", formula: "f(x, y, z) = 0", note: "Level set of an equation." },
  ];

export const GRAPH_SURFACE_IDS: SurfaceId[] = [
  "graph_saddle",
  "graph_rotatedSaddle",
  "graph_monkey",
  "graph_wave",
  "graph_paraboloid",
  "graph_gaussian",
  "graph_ripple",
  "graph_mexican",
  "graph_sinSum",
  "graph_sinc",
  "graph_sinc2",
  "graph_custom",
];

export const IMPLICIT_EXPR_PRESETS: { id: SurfaceId; label: string; expr: string }[] = [
  { id: "sphere", label: "Sphere", expr: "x*x + y*y + z*z - 1" },
  { id: "hyperboloid", label: "Hyperboloid", expr: "x*x/(0.8^2) + z*z/(0.8^2) - y*y/(0.6^2) - 1" },
  { id: "paraboloid", label: "Paraboloid", expr: "y - (x*x + z*z)" },
  { id: "cone", label: "Cone", expr: "x*x + z*z - (0.5*(1.2 - y))^2" },
  { id: "cylinder", label: "Cylinder", expr: "x*x + z*z - 1" },
  { id: "hyperboloid_twoSheet", label: "Two-sheet hyperboloid", expr: "z*z/(0.9^2) - x*x/(0.7^2) - y*y/(0.7^2) - 1" },
  { id: "ellipsoid", label: "Ellipsoid", expr: "x*x/(1.3^2) + y*y/(0.9^2) + z*z/(0.7^2) - 1" },
  { id: "torus_implicit", label: "Torus", expr: "(sqrt(x*x + y*y) - 1.05)^2 + z*z - 0.45^2" },
  { id: "gyroid", label: "Gyroid", expr: "sin(x*1.4)*cos(y*1.4) + sin(y*1.4)*cos(z*1.4) + sin(z*1.4)*cos(x*1.4)" },
  { id: "superquadric", label: "Superquadric", expr: "abs(x)^4 + abs(y)^4 + abs(z)^4 - 1.2" },
  { id: "roman", label: "Roman surface", expr: "x*x*y*y + y*y*z*z + z*z*x*x - 2*x*y*z" },
  { id: "scherk", label: "Scherk surface", expr: "sin(z) - (0.5*(exp(x) - exp(-x)))*(0.5*(exp(y) - exp(-y)))" },
];

export function getEditableImplicitCustomExpr(id: SurfaceId, fallback: string): string | null {
  if (id === "implicit_custom") {
    const trimmed = fallback.trim();
    return trimmed.length ? trimmed : "x*x + y*y + z*z - 1";
  }
  const preset = IMPLICIT_EXPR_PRESETS.find((p) => p.id === id);
  if (preset?.expr?.trim()) return preset.expr.trim();
  const trimmed = fallback.trim();
  return trimmed.length ? trimmed : null;
}

export const pillRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

export const pill = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid " + (active ? "var(--workspace-control-active-border)" : "var(--workspace-control-border)"),
  background: active ? "var(--workspace-control-active-bg)" : "var(--workspace-control-bg)",
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  userSelect: "none",
  fontSize: 12,
});

export const PARAM_CURVATURE_COLOR_MODES: ColorMode[] = ["gaussian", "mean", "k1", "k2"];

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  solid: "Solid",
  height: "Height",
  radius: "Radius",
  phase: "Phase",
  curvature: "Curvature",
  gaussian: "K",
  mean: "H",
  k1: "k1",
  k2: "k2",
};

export const colorModesForSurfaceViewer = (
  viewerKind: SurfaceViewerKind,
  surfaceMeshLabel?: string | null
): ColorMode[] => {
  const phaseAllowed =
    (viewerKind === "mesh" || viewerKind === "complex") &&
    isComplexMapSurfaceLabel(surfaceMeshLabel);
  if (viewerKind === "param" || viewerKind === "weierstrass") {
    return ["solid", "height", "radius", ...PARAM_CURVATURE_COLOR_MODES];
  }
  if (viewerKind === "graph") {
    return ["solid", "height", "radius", "curvature"];
  }
  if (viewerKind === "mesh") {
    return ["solid", "height", "radius", ...PARAM_CURVATURE_COLOR_MODES];
  }
  if (phaseAllowed) {
    return ["solid", "height", "radius", "phase"];
  }
  return ["solid", "height", "radius"];
};

export function isGraphSurface(id: SurfaceId): boolean {
  return GRAPH_SURFACE_IDS.includes(id);
}

export function isMeshSurface(id: SurfaceId): boolean {
  return id === "surface_mesh";
}

export function isImplicitSurface(id: SurfaceId): boolean {
  return !isGraphSurface(id) && !isMeshSurface(id);
}

export function normalizeImplicitDomain(d: ImplicitDomain, fallback: ImplicitDomain): ImplicitDomain {
  const xSpan = Math.max(0.2, Number(d.xSpan));
  const ySpan = Math.max(0.2, Number(d.ySpan));
  return {
    xSpan: Number.isFinite(xSpan) && xSpan > 0 ? xSpan : fallback.xSpan,
    ySpan: Number.isFinite(ySpan) && ySpan > 0 ? ySpan : fallback.ySpan,
  };
}

export function getDefaultGraphSpan(id: SurfaceId): GraphDomain {
  switch (id) {
    case "graph_saddle":
    case "graph_rotatedSaddle":
      return { xSpan: 1.5, ySpan: 1.5 };
    case "graph_monkey":
      return { xSpan: 1.4, ySpan: 1.4 };
    case "graph_wave":
      return { xSpan: Math.PI, ySpan: Math.PI };
    case "graph_paraboloid":
      return { xSpan: 1.7, ySpan: 1.7 };
    case "graph_gaussian":
      return { xSpan: 2.0, ySpan: 2.0 };
    case "graph_ripple":
      return { xSpan: 2.4, ySpan: 2.4 };
    case "graph_mexican":
      return { xSpan: 2.2, ySpan: 2.2 };
    case "graph_sinSum":
      return { xSpan: Math.PI, ySpan: Math.PI };
    case "graph_sinc":
    case "graph_sinc2":
      return { xSpan: 5, ySpan: 5 };
    case "graph_custom":
      return { xSpan: 2, ySpan: 2 };
    default:
      return { xSpan: 2, ySpan: 2 };
  }
}

export function getDefaultImplicitDomain(id: SurfaceId): ImplicitDomain {
  const toSpan = (size: number) => ({ xSpan: size, ySpan: size });
  switch (id) {
    case "torus_implicit":
      return toSpan(2.1);
    case "hyperboloid_twoSheet":
      return toSpan(2.3);
    case "roman":
      return toSpan(1.8);
    case "scherk":
      return toSpan(1.6);
    case "implicit_custom":
      return toSpan(2.1);
    case "gyroid":
    case "superquadric":
    case "ellipsoid":
      return toSpan(2.2);
    default:
      return toSpan(2.2);
  }
}

export const PARAM_SURFACES_META: {
  id: ParamSurfaceId;
  label: string;
  formula: string;
  note: string;
}[] = [
  { id: "plane", label: "Plane", formula: "σ(u,v) = (u, v, 0)", note: "Developable; K = 0." },
  {
    id: "bezierSurface",
    label: "Bezier surface",
    formula: "σ(u,v) = Σ_i Σ_j B_i^m(u) B_j^n(v) P_ij",
    note: "Tensor-product Bezier patch from a control grid.",
  },
  {
    id: "bSplineSurface",
    label: "B-spline surface",
    formula: "σ(u,v) = Σ_i Σ_j N_i,p(u) M_j,q(v) P_ij",
    note: "Tensor-product B-spline patch with clamped knot vectors.",
  },
  {
    id: "nurbsSurface",
    label: "NURBS surface",
    formula: "σ(u,v) = (Σ_i Σ_j N_i,p M_j,q w_ij P_ij) / (Σ_i Σ_j N_i,p M_j,q w_ij)",
    note: "Rational B-spline patch using per-control-point weights.",
  },
  {
    id: "rotationalDevelopable",
    label: "Rotational linear profile",
    formula: "σ(u,v) = ((a + b v) cos u, (a + b v) sin u, c + d v)",
    note: "Linear profile (r(v), z(v)); cylinder/cone/frustum family.",
  },
  {
    id: "rotationalGraph",
    label: "Rotational graph",
    formula: "σ(u,v) = (f(v) cos u, f(v) sin u, v)",
    note: "Function-profile form with r(v)=f(v), z(v)=v.",
  },
  {
    id: "rotationalBell",
    label: "Bell / vase rotational",
    formula: "σ(u,v) = ((1 + 0.2 sin 3v) cos u, (1 + 0.2 sin 3v) sin u, v)",
    note: "Oscillating profile around axis (vase-like family).",
  },
  {
    id: "rotationalSpheroid",
    label: "Spheroid of revolution",
    formula: "σ(u,v) = (a sin v cos u, a sin v sin u, c cos v)",
    note: "Ellipsoid of revolution around the z-axis.",
  },
  {
    id: "rotationalHyperboloid",
    label: "Hyperboloid rotational",
    formula: "σ(u,v) = (a cosh v cos u, a cosh v sin u, c sinh v)",
    note: "One-sheet hyperboloid as a rotational classical surface.",
  },
  {
    id: "rotationalFreeProfile",
    label: "Free-profile rotational",
    formula: "σ(u,v) = (r(v) cos u, r(v) sin u, z(v))",
    note: "General parametric profile (r(v), z(v)); most general rotational form.",
  },
  { id: "cylinder", label: "Circular cylinder", formula: "σ(u,v) = (cos u, sin u, v)", note: "One principal curvature is 0." },
  { id: "cone", label: "Cone (away from tip)", formula: "σ(u,v) = (v cos u, v sin u, v)", note: "Rulings through a vertex; tip is singular." },
  { id: "helicoid", label: "Helicoid", formula: "σ(u,v) = (v cos u, v sin u, a u)", note: "Minimal ruled surface." },
  { id: "catenoid", label: "Catenoid", formula: "σ(u,v) = (cosh v cos u, cosh v sin u, v)", note: "Minimal rotational surface." },
  { id: "sphere", label: "Sphere", formula: "σ(u,v) = (R sin v cos u, R sin v sin u, R cos v)", note: "Spherical coordinates." },
  { id: "ellipsoid", label: "Ellipsoid", formula: "σ(u,v) = (a sin v cos u, b sin v sin u, c cos v)", note: "Scaled sphere with three axes." },
  { id: "paraboloid", label: "Paraboloid (param)", formula: "σ(u,v) = (v cos u, v sin u, v^2)", note: "Rotational graph surface." },
  { id: "pseudosphere", label: "Pseudosphere", formula: "σ(u,v) = (cos u sech v, sin u sech v, v - tanh v)", note: "Classical rotational negative-curvature surface." },
  { id: "dini", label: "Dini surface", formula: "σ(u,v) = (cos u sin v, sin u sin v, cos v + log tan(v/2) + b u)", note: "Twisted pseudosphere." },
  { id: "twistedStrip", label: "Twisted strip", formula: "σ(u,v) = ((1+v cos 2u) cos u, (1+v cos 2u) sin u, v sin 2u)", note: "Strip with two twists." },
  { id: "torus", label: "Torus", formula: "σ(u,v) = ((R + r cos v) cos u, (R + r cos v) sin u, r sin v)", note: "Torus as special rotational family." },
  { id: "mobius", label: "Möbius strip", formula: "σ(u,v) ≈ ((1 + v/2 cos(u/2)) cos u, …)", note: "Non-orientable strip." },
  { id: "kleinBottle", label: "Klein bottle", formula: "σ(u,v) = immersion in ℝ³ (self-intersecting)", note: "Embedding needs ℝ⁴." },
  { id: "hyperbolicParaboloid", label: "Hyperbolic paraboloid", formula: "σ(u,v) = (u, v, u v)", note: "Saddle; ruled (two families)." },
  { id: "enneper", label: "Enneper surface", formula: "σ(u,v) = (u − u³/3 + u v², v − v³/3 + v u², u² − v²)", note: "Minimal; self-intersections." },
  { id: "sweepLinearExtrusion", label: "Linear extrusion", formula: "σ(u,v) = (p_x(u), p_y(u), v)", note: "Sweep profile along a straight axis." },
  { id: "sweepDirectional", label: "Directional sweep", formula: "σ(u,v) = p(u) + v d", note: "Profile translated in a fixed direction vector d." },
  { id: "sweepPath", label: "Path sweep", formula: "σ(u,v) = C(v) + frame(v) · p(u)", note: "Profile swept along a spatial path C(v)." },
  { id: "sweepHelical", label: "Helical sweep", formula: "σ(u,v) = C_helix(v) + frame(v) · p(u)", note: "Profile swept along a helical centerline." },
  { id: "sweepScaled", label: "Scaled sweep", formula: "σ(u,v) = C(v) + s(v) p(u)", note: "Sweep with profile scale varying along v." },
  { id: "sweepTwisted", label: "Twisted sweep", formula: "σ(u,v) = C(v) + R(θ(v)) p(u)", note: "Sweep with profile twist angle varying along v." },
  { id: "ribbonRMF", label: "Ribbon (RMF)", formula: "σ(u,v) = C(v) + w u n_RMF(v, θ(v))", note: "Rotation-minimizing-frame ribbon with optional twist." },
  { id: "tubeConstant", label: "Constant-radius tube", formula: "σ(u,v) = C(v) + r (cos u n(v) + sin u b(v))", note: "Tube with fixed radius around a centerline." },
  { id: "tubeVariable", label: "Variable-radius tube", formula: "σ(u,v) = C(v) + r(v) (cos u n(v) + sin u b(v))", note: "Tube with radius changing along v." },
  { id: "tubeClosed", label: "Closed tube", formula: "σ(u,v) = ((R + r cos u) cos v, (R + r cos u) sin v, r sin u)", note: "Closed-centerline tube (torus-like)." },
  { id: "tubeOpen", label: "Open tube", formula: "σ(u,v) = C_open(v) + r (cos u n(v) + sin u b(v))", note: "Tube over an open centerline segment." },
  { id: "expCone", label: "Exp cone / funnel", formula: "σ(u,v) = (v cos u, v sin u, log v)", note: "Graph-type rotational funnel (v>0)." },
  { id: "helicoidUV", label: "Helicoid (u,v)", formula: "σ(u,v) = (u cos v, u sin v, v)", note: "v is angle + height; use a few turns (no wrapV)." },
  { id: "boy", label: "Boy's surface", formula: "σ(u,v) = Bryant-Kusner param", note: "Immersion of RP2; self-intersections." },
  { id: "custom", label: "Custom σ(u,v)", formula: "σ(u,v) = (X(u,v), Y(u,v), Z(u,v))", note: "User-defined parametrisation." },
];

export function getParamDomainPreviewBounds(id: ParamSurfaceId) {
  // keep these consistent with ParamSurfaceViewer's domain switch
  switch (id) {
    case "bezierSurface":
    case "bSplineSurface":
    case "nurbsSurface":
      return { uMin: 0, uMax: 1, vMin: 0, vMax: 1 };
    case "rotationalDevelopable":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.8, vMax: 1.8 };
    case "rotationalGraph":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "rotationalBell":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.4, vMax: 2.4 };
    case "rotationalSpheroid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: Math.PI };
    case "rotationalHyperboloid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.2, vMax: 1.2 };
    case "rotationalFreeProfile":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "expCone":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0.15, vMax: 2.8 };

    case "helicoidUV":
      return { uMin: 0, uMax: 1.8, vMin: 0, vMax: 6 * Math.PI };
    case "boy":
      return { uMin: 0, uMax: Math.PI, vMin: 0, vMax: Math.PI };

    case "paraboloid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 };

    case "pseudosphere":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2.6 };

    case "dini":
      return { uMin: 0, uMax: 4 * Math.PI, vMin: 0.25, vMax: 1.35 };

    case "twistedStrip":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -0.6, vMax: 0.6 };
    case "sweepLinearExtrusion":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "sweepDirectional":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "sweepPath":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "sweepHelical":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 4 * Math.PI };
    case "sweepScaled":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "sweepTwisted":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.2, vMax: 2.2 };
    case "ribbonRMF":
      return { uMin: -1, uMax: 1, vMin: -2.5, vMax: 2.5 };
    case "tubeConstant":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "tubeVariable":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "tubeClosed":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 * Math.PI };
    case "tubeOpen":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.2, vMax: 1.2 };

    // defaults for everything else (safe generic)
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -1, vMax: 1 };
  }
}

export type GraphDomainPreset = {
  id: string;
  surfaceId: SurfaceId;
  label: string;
  xSpan: number;
  ySpan: number;
  createdAt: number;
};

export type ParamDomainPreset = {
  id: string;
  surfaceId: ParamSurfaceId;
  label: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  createdAt: number;
};

export type ImplicitDomainPreset = {
  id: string;
  surfaceId: SurfaceId;
  label: string;
  xSpan: number;
  ySpan: number;
  createdAt: number;
};

export type GeodesicPathEndpoint = {
  meshKey: string;
  vertexIndex: number;
  faceIndex?: number;
  bary?: [number, number, number];
  point?: { x: number; y: number; z: number };
};

export type GeodesicPathMethod = "graph" | "surface";

export type GeodesicPathSourceMode = "selected-vertex" | "selected-point" | "selection-set";

export type GeodesicHeatEndpoint = {
  meshKey: string;
  faceIndex: number;
  bary: [number, number, number];
  point: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
};

export type GeodesicDiskCenter = {
  meshKey: string;
  faceIndex: number;
  bary: [number, number, number];
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
};

export type BBox3 = { min: [number, number, number]; max: [number, number, number] };

export function normalizeGraphDomain(d: GraphDomain, fallback: GraphDomain): GraphDomain {
  const x = Number.isFinite(d.xSpan) ? Math.max(0.2, d.xSpan) : fallback.xSpan;
  const y = Number.isFinite(d.ySpan) ? Math.max(0.2, d.ySpan) : fallback.ySpan;
  return { xSpan: x, ySpan: y };
}

export function normalizeParamDomain(d: ParamDomain, fallback: ParamDomain): ParamDomain {
  const uMin = Number.isFinite(d.uMin) ? d.uMin : fallback.uMin;
  const uMax = Number.isFinite(d.uMax) ? d.uMax : fallback.uMax;
  const vMin = Number.isFinite(d.vMin) ? d.vMin : fallback.vMin;
  const vMax = Number.isFinite(d.vMax) ? d.vMax : fallback.vMax;

  let u0 = uMin;
  let u1 = uMax;
  let v0 = vMin;
  let v1 = vMax;
  if (u0 === u1) u1 = u0 + 0.1;
  if (v0 === v1) v1 = v0 + 0.1;
  if (u0 > u1) [u0, u1] = [u1, u0];
  if (v0 > v1) [v0, v1] = [v1, v0];
  return { uMin: u0, uMax: u1, vMin: v0, vMax: v1 };
}

export function estimateTargetEdgeFromBudget(diag: number, triBudget: number) {
  const budget = Math.max(200, triBudget);
  const edge = diag * Math.sqrt(6.25 / budget);
  return Math.max(1e-6, Math.min(diag, edge));
}

export const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));

export const fmt3 = (v: { x: number; y: number; z: number }) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;

export type Vec3 = { x: number; y: number; z: number };

export const DEFAULT_ROTATIONAL_PROFILE_POINTS_TEXT = [
  "-2.0, 0.24, -1.8",
  "-1.2, 0.5, -1.1",
  "-0.2, 0.85, -0.2",
  "0.8, 0.6, 0.9",
  "1.8, 0.34, 1.7",
].join("\n");

export const ROTATIONAL_AXIS_DIRECTIONS: Record<"x" | "y" | "z", Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

export const vLen = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export const vDot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const vScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });

export const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const vCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const vNormalize = (v: Vec3): Vec3 => {
  const len = vLen(v);
  return len > 1e-12 ? vScale(v, 1 / len) : { x: 0, y: 0, z: 0 };
};

export const detectPrincipalAxisDirection = (direction: Vec3): "x" | "y" | "z" | null => {
  if (vLen(direction) <= 1e-12) return null;
  const n = vNormalize(direction);
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const max = Math.max(ax, ay, az);
  if (max < 0.999) return null;
  if (ax === max) return "x";
  if (ay === max) return "y";
  return "z";
};

export const buildTangentBasis = (normal: Vec3) => {
  const n = vNormalize(normal);
  const ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = vNormalize(vCross(ref, n));
  const t2 = vNormalize(vCross(n, t1));
  return { t1, t2 };
};

export type SurfaceInspectMetrics = Partial<
  Pick<
    MeshDifferentialGeometryProbe,
    "K" | "H" | "k1" | "k2" | "shapeIndex" | "curvedness" | "d1" | "d2" | "directionValid" | "warnings"
  >
>;

export type SurfacesLeftTab = "controls" | "scene" | "object" | "view" | "analysis" | "services" | "theory";

export type AnalysisFocusedSection = MeshAnalysisFocusedSection;

export type InspectorPanelTab = SharedInspectorCategory | "object" | "result" | "probe" | "warnings";

export const cardStyle: React.CSSProperties = {
  marginTop: 8,
  background: "#fff",
  border: "1px solid #e6e6e6",
  borderRadius: 12,
  padding: 10,
};
