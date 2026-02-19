import type { DatasetKind } from "../scene/datasets";
import type { SurfaceId, ColorMode } from "../components/SurfaceViewer";
import type { ParamSurfaceId } from "../components/ParamSurfaceViewer";
import type { ColorPalette } from "../components/colorPalette";

export type WorkbookStageId = "define" | "compute" | "visualize" | "explain";
export type WorkbookBlockType =
  | "text"
  | "formula"
  | "visualize"
  | "compute"
  | "assert"
  | "interaction";
export type WorkbookValueType =
  | "text"
  | "formula"
  | "dataset"
  | "view"
  | "snapshot"
  | "overlay"
  | "curve"
  | "mask"
  | "params"
  | "mesh"
  | "volume"
  | "selection"
  | "scalar"
  | "vector"
  | "points";

export type WorkbookPort = {
  id: string;
  label: string;
  type: WorkbookValueType;
  optional?: boolean;
};

export type WorkbookParamKind = "number" | "select" | "toggle";
export type WorkbookParamValue = number | string | boolean;
export type WorkbookParamOption = { value: string; label: string };
export type WorkbookParamDef = {
  id: string;
  label: string;
  kind: WorkbookParamKind;
  min?: number;
  max?: number;
  step?: number;
  options?: WorkbookParamOption[];
  defaultValue?: WorkbookParamValue;
};
export type WorkbookParamKeyframe = {
  id: string;
  label?: string;
  values: Record<string, WorkbookParamValue>;
  createdAt: number;
};
export type WorkbookParamState = {
  defs: WorkbookParamDef[];
  values: Record<string, WorkbookParamValue>;
  scrub?: boolean;
  keyframes?: WorkbookParamKeyframe[];
};

export type WorkbookInteractionKind =
  | "pick_point"
  | "draw_curve"
  | "select_region"
  | "pick_direction";
export type WorkbookInteractionStatus = "idle" | "armed" | "captured";
export type WorkbookPointOutput = {
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
  xy?: { x: number; y: number };
  tangentU?: { x: number; y: number; z: number };
  tangentV?: { x: number; y: number; z: number };
  meshKey?: string;
  vertexIndex?: number;
  faceIndex?: number;
  bary?: [number, number, number];
};
export type WorkbookCurveOutput = {
  points: { x: number; y: number; z: number }[];
  closed?: boolean;
};
export type WorkbookMaskOutput = {
  meshKey?: string;
  indices: number[];
  count: number;
};
export type WorkbookDirectionOutput = {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  tangentU?: { x: number; y: number; z: number };
  tangentV?: { x: number; y: number; z: number };
};
export type WorkbookInteractionData = {
  kind: WorkbookInteractionKind;
  status?: WorkbookInteractionStatus;
  summary?: string;
  point?: WorkbookPointOutput | null;
  curve?: WorkbookCurveOutput | null;
  mask?: WorkbookMaskOutput | null;
  direction?: WorkbookDirectionOutput | null;
  points?: { x: number; y: number; z: number }[];
  directionAngle?: number;
};

export type WorkbookCameraState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};

export type WorkbookViewSnapshot = {
  datasetRef: string;
  datasetKind: DatasetKind;
  viewerKind: string;
  surfaceId?: SurfaceId;
  paramId?: ParamSurfaceId;
  graphExpr?: string;
  implicitExpr?: string;
  paramXExpr?: string;
  paramYExpr?: string;
  paramZExpr?: string;
  weierstrassGExpr?: string;
  weierstrassPhiExpr?: string;
  weierstrassRecenter?: boolean;
  graphDomain?: { xSpan: number; ySpan: number };
  implicitDomain?: { xSpan: number; ySpan: number };
  paramDomain?: { uMin: number; uMax: number; vMin: number; vMax: number };
  weierstrassDomain?: { uMin: number; uMax: number; vMin: number; vMax: number };
  graphResolution?: number;
  implicitResolution?: number;
  paramResolution?: number;
  weierstrassResolution?: number;
  colorMode?: ColorMode;
  colorPalette?: ColorPalette;
  showWireframe?: boolean;
  showContours?: boolean;
  showChartGrid?: boolean;
  probeEnabled?: boolean;
  showProbeNormal?: boolean;
  showProbeTangentPlane?: boolean;
  showProbeTangents?: boolean;
  showPrincipalDirections?: boolean;
  showPrincipalGlyphs?: boolean;
  showPrincipalLines?: boolean;
  showCurvatureLines?: boolean;
  showRidges?: boolean;
  showValleys?: boolean;
  showGaussMap?: boolean;
  showBoundingBox?: boolean;
  showPlanes?: boolean;
  volumeViewMode?: "slices" | "3d";
  volumeIsoValue?: number;
  volumeShowIsosurface?: boolean;
  volumeShowStreamlines?: boolean;
  camera?: WorkbookCameraState | null;
  thumbnail?: string | null;
  capturedAt: number;
};

export type WorkbookSnapshotSlot = "A" | "B";

export type WorkbookComputeOutputs = {
  viewPatch?: {
    colorMode?: ColorMode;
    showWireframe?: boolean;
    showContours?: boolean;
    showChartGrid?: boolean;
    probeEnabled?: boolean;
    showProbeNormal?: boolean;
    showProbeTangentPlane?: boolean;
    showProbeTangents?: boolean;
    showPrincipalDirections?: boolean;
    showPrincipalGlyphs?: boolean;
  };
  geodesicHeat?: {
    polylines: { x: number; y: number; z: number }[][] | null;
    length: number | null;
    phi?: number[] | null;
    meshToken?: number | null;
    meshKey?: string | null;
    message?: string | null;
  };
  curveOverlay?: {
    polylines: { x: number; y: number; z: number }[][] | null;
  };
  directionOverlay?: {
    polylines: { x: number; y: number; z: number }[][] | null;
  };
  selectionMask?: WorkbookMaskOutput | null;
};

export type WorkbookComputeCacheEntry = {
  inputHash: string;
  outputHash: string;
  status: "ok" | "failed";
  summary?: string;
  outputs?: WorkbookComputeOutputs;
  createdAt: number;
};

export type WorkbookBlock = {
  id: string;
  type: WorkbookBlockType;
  title: string;
  inputs?: WorkbookPort[];
  outputs?: WorkbookPort[];
  text?: string;
  formula?: string;
  params?: WorkbookParamState;
  visualize?: {
    live: boolean;
    snapshot?: WorkbookViewSnapshot | null;
    snapshotA?: WorkbookViewSnapshot | null;
    snapshotB?: WorkbookViewSnapshot | null;
    notes?: string;
  };
  compute?: {
    operatorId?: string;
    status?: "idle" | "ok" | "stale" | "failed";
    summary?: string;
    datasetRef?: string;
    lastRunAt?: number;
    inputHash?: string;
    outputHash?: string;
    cache?: Record<string, WorkbookComputeCacheEntry>;
  };
  interaction?: WorkbookInteractionData;
  assert?: {
    expected?: string;
    status?: "pending" | "pass" | "fail";
  };
};

export type WorkbookStage = {
  id: WorkbookStageId;
  title: string;
  blocks: WorkbookBlock[];
};

export type Workbook = {
  id: string;
  title: string;
  updatedAt: number;
  stages: WorkbookStage[];
};

export type WorkbookTemplateBlockSpec = {
  type: WorkbookBlockType;
  title: string;
  text?: string;
  formula?: string;
  computeOperatorId?: string;
  interactionKind?: WorkbookInteractionKind;
  visualizeLive?: boolean;
  visualizeNotes?: string;
  assertExpected?: string;
  params?: WorkbookParamState;
};

export type WorkbookTemplateSpec = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  requiredOperators?: string[];
  suggestedStages?: WorkbookStageId[];
  stages: Array<{
    id: WorkbookStageId;
    title?: string;
    blocks: WorkbookTemplateBlockSpec[];
  }>;
};

export type WorkbookProblemPack = {
  id: string;
  title: string;
  description: string;
  topic: string;
  difficulty: "intro" | "intermediate" | "advanced";
  prerequisites: string[];
  requiredOperators: string[];
  suggestedStages: WorkbookStageId[];
  tags: string[];
  templateIds: string[];
};

export const WORKBOOK_STAGE_ORDER: { id: WorkbookStageId; title: string }[] = [
  { id: "define", title: "Define" },
  { id: "compute", title: "Compute" },
  { id: "visualize", title: "Visualize" },
  { id: "explain", title: "Explain / Check" },
];

export function createDefaultWorkbook(makeId: () => string): Workbook {
  const now = Date.now();
  return {
    id: makeId(),
    title: "Untitled Workbook",
    updatedAt: now,
    stages: [
      {
        id: "define",
        title: "Define",
        blocks: [
          {
            id: makeId(),
            type: "text",
            title: "Problem statement",
            text: "Describe the surface or problem setup here.",
            outputs: [{ id: "text", label: "Text", type: "text" }],
          },
          {
            id: makeId(),
            type: "formula",
            title: "Surface formula",
            formula: "x(u,v), y(u,v), z(u,v)",
            outputs: [{ id: "formula", label: "Formula", type: "formula" }],
          },
        ],
      },
      {
        id: "compute",
        title: "Compute",
        blocks: [],
      },
      {
        id: "visualize",
        title: "Visualize",
        blocks: [
          {
            id: makeId(),
            type: "visualize",
            title: "Base view",
            inputs: [{ id: "dataset", label: "Dataset", type: "dataset" }],
            outputs: [{ id: "snapshot", label: "Snapshot", type: "snapshot" }],
            visualize: { live: true, snapshotA: null, snapshotB: null },
          },
        ],
      },
      {
        id: "explain",
        title: "Explain / Check",
        blocks: [
          {
            id: makeId(),
            type: "text",
            title: "Notes",
            text: "Explain what the visualization shows and add sanity checks.",
            outputs: [{ id: "text", label: "Text", type: "text" }],
          },
          {
            id: makeId(),
            type: "assert",
            title: "Expected checks",
            inputs: [{ id: "dataset", label: "Dataset", type: "dataset" }],
            assert: { expected: "", status: "pending" },
          },
        ],
      },
    ],
  };
}

const buildBlockFromSpec = (spec: WorkbookTemplateBlockSpec, makeId: () => string): WorkbookBlock => {
  const base: WorkbookBlock = { id: makeId(), type: spec.type, title: spec.title };
  if (spec.params) base.params = spec.params;
  if (spec.type === "text") return { ...base, text: spec.text ?? "" };
  if (spec.type === "formula") return { ...base, formula: spec.formula ?? "" };
  if (spec.type === "visualize")
    return {
      ...base,
      visualize: {
        live: spec.visualizeLive ?? true,
        snapshotA: null,
        snapshotB: null,
        notes: spec.visualizeNotes,
      },
    };
  if (spec.type === "compute")
    return {
      ...base,
      compute: { status: "stale", operatorId: spec.computeOperatorId, cache: {} },
    };
  if (spec.type === "interaction")
    return {
      ...base,
      interaction: { kind: spec.interactionKind ?? "pick_point", status: "idle" },
    };
  return {
    ...base,
    assert: { expected: spec.assertExpected ?? "", status: "pending" },
  };
};

const buildWorkbookFromTemplate = (spec: WorkbookTemplateSpec, makeId: () => string): Workbook => {
  const now = Date.now();
  const stageMap = new Map(spec.stages.map((stage) => [stage.id, stage]));
  const stages: WorkbookStage[] = WORKBOOK_STAGE_ORDER.map((stage) => {
    const fromSpec = stageMap.get(stage.id);
    return {
      id: stage.id,
      title: fromSpec?.title ?? stage.title,
      blocks: (fromSpec?.blocks ?? []).map((block) => buildBlockFromSpec(block, makeId)),
    };
  });
  return {
    id: makeId(),
    title: spec.title,
    updatedAt: now,
    stages,
  };
};

export const WORKBOOK_TEMPLATES: WorkbookTemplateSpec[] = [
  {
    id: "compute_curvature",
    title: "Compute curvature",
    description: "Enable curvature coloring and interpret K/H/k1/k2 with a focused compute block.",
    tags: ["curvature", "gauss map", "analysis"],
    requiredOperators: ["curvature_field"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          {
            type: "text",
            title: "Goal",
            text: "Compute curvature invariants and explain where curvature is high or changes sign.",
          },
          {
            type: "formula",
            title: "Surface definition",
            formula: "z = f(x,y) or σ(u,v) = (x,y,z)",
          },
        ],
      },
      {
        id: "compute",
        blocks: [
          {
            type: "compute",
            title: "Curvature field",
            computeOperatorId: "curvature_field",
          },
        ],
      },
      {
        id: "visualize",
        blocks: [
          {
            type: "visualize",
            title: "Curvature snapshot",
            visualizeNotes: "Capture A/B with different domains or resolutions.",
          },
        ],
      },
      {
        id: "explain",
        blocks: [
          {
            type: "text",
            title: "Interpretation",
            text: "Describe where curvature concentrates and how it matches intuition.",
          },
        ],
      },
    ],
  },
  {
    id: "geodesics_from_point",
    title: "Geodesics from point",
    description: "Pick two points and compute a geodesic heat path and a shortest path.",
    tags: ["geodesics", "paths", "distance"],
    requiredOperators: ["geodesic_heat", "geodesic_path"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          {
            type: "text",
            title: "Goal",
            text: "Compare heat‑method and shortest‑path geodesics between two points.",
          },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "interaction", title: "Pick start point", interactionKind: "pick_point" },
          { type: "interaction", title: "Pick end point", interactionKind: "pick_point" },
          { type: "compute", title: "Geodesic heat", computeOperatorId: "geodesic_heat" },
          { type: "compute", title: "Geodesic path", computeOperatorId: "geodesic_path" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Geodesic snapshots" },
        ],
      },
      {
        id: "explain",
        blocks: [
          {
            type: "text",
            title: "Observations",
            text: "Compare the two geodesics and note any discrepancies or mesh artifacts.",
          },
        ],
      },
    ],
  },
  {
    id: "chart_and_basis",
    title: "Chart + basis",
    description: "Turn on chart grids and probe tangents to build intuition about surface coordinates.",
    tags: ["atlas", "charts", "tangent basis"],
    requiredOperators: ["chart_grid"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          { type: "text", title: "Goal", text: "Inspect chart grids and tangent directions on the surface." },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "compute", title: "Chart grid + basis", computeOperatorId: "chart_grid" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Chart grid snapshot" },
        ],
      },
      {
        id: "explain",
        blocks: [
          {
            type: "text",
            title: "Notes",
            text: "Describe how the chart grid aligns with principal directions or symmetry.",
          },
        ],
      },
    ],
  },
  {
    id: "transport_demo",
    title: "Transport demo",
    description: "Pick a direction and overlay transported directions along the surface.",
    tags: ["transport", "direction field", "geodesics"],
    requiredOperators: ["direction_overlay"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          { type: "text", title: "Goal", text: "Compare direction fields after transport." },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "interaction", title: "Pick direction", interactionKind: "pick_direction" },
          { type: "compute", title: "Direction overlay", computeOperatorId: "direction_overlay" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Transport snapshots" },
        ],
      },
      {
        id: "explain",
        blocks: [
          {
            type: "text",
            title: "Observations",
            text: "Note how the transported direction aligns or twists across the surface.",
          },
        ],
      },
    ],
  },
  {
    id: "selection_stats",
    title: "Selection + stats",
    description: "Select a region and inspect selection stats, curvature histograms, and overlays.",
    tags: ["selection", "stats", "curvature"],
    requiredOperators: ["selection_overlay"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          {
            type: "text",
            title: "Goal",
            text: "Select a meaningful region and summarize its curvature statistics.",
          },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "interaction", title: "Select region", interactionKind: "select_region" },
          { type: "compute", title: "Selection overlay", computeOperatorId: "selection_overlay" },
          { type: "compute", title: "Curvature field", computeOperatorId: "curvature_field" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Selection snapshot" },
        ],
      },
      {
        id: "explain",
        blocks: [
          {
            type: "text",
            title: "Stats summary",
            text: "Record count, mean curvature, and any anomalies.",
          },
        ],
      },
    ],
  },
  {
    id: "principal_directions",
    title: "Principal directions",
    description: "Overlay principal direction glyphs and interpret curvature directions.",
    tags: ["principal directions", "curvature", "analysis"],
    requiredOperators: ["principal_dirs", "curvature_field"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          { type: "text", title: "Goal", text: "Visualize principal directions and relate them to curvature." },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "compute", title: "Curvature field", computeOperatorId: "curvature_field" },
          { type: "compute", title: "Principal directions", computeOperatorId: "principal_dirs" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Principal direction snapshot" },
        ],
      },
      {
        id: "explain",
        blocks: [
          { type: "text", title: "Interpretation", text: "Explain alignment and direction changes across the surface." },
        ],
      },
    ],
  },
  {
    id: "curve_overlay_demo",
    title: "Curve overlay demo",
    description: "Draw a curve on the surface and compare multiple overlays with ghosting.",
    tags: ["curves", "overlays", "ghost overlays"],
    requiredOperators: ["curve_overlay"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    stages: [
      {
        id: "define",
        blocks: [
          { type: "text", title: "Goal", text: "Draw curves and compare how overlays differ." },
        ],
      },
      {
        id: "compute",
        blocks: [
          { type: "interaction", title: "Draw curve", interactionKind: "draw_curve" },
          { type: "compute", title: "Curve overlay", computeOperatorId: "curve_overlay" },
        ],
      },
      {
        id: "visualize",
        blocks: [
          { type: "visualize", title: "Overlay snapshots", visualizeNotes: "Use Ghost overlays to compare iterations." },
        ],
      },
      {
        id: "explain",
        blocks: [
          { type: "text", title: "Notes", text: "Describe how the curve overlay changed between attempts." },
        ],
      },
    ],
  },
];

export const WORKBOOK_PROBLEM_PACKS: WorkbookProblemPack[] = [
  {
    id: "pack_minimal_surfaces",
    title: "Minimal surfaces starter pack",
    description: "Weierstrass-friendly templates for studying minimal surfaces and curvature.",
    topic: "Minimal surfaces",
    difficulty: "intermediate",
    prerequisites: ["Basic parametric surfaces", "Weierstrass mode"],
    requiredOperators: ["curvature_field", "chart_grid"],
    suggestedStages: ["define", "visualize", "compute", "explain"],
    tags: ["minimal surfaces", "weierstrass", "curvature"],
    templateIds: ["compute_curvature", "chart_and_basis"],
  },
  {
    id: "pack_geodesics",
    title: "Geodesics toolkit",
    description: "Geodesic heat + shortest path workflows with guided point picking.",
    topic: "Geodesics",
    difficulty: "intermediate",
    prerequisites: ["Surface sampling", "Mesh-based geodesics"],
    requiredOperators: ["geodesic_heat", "geodesic_path"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    tags: ["geodesics", "paths", "distance"],
    templateIds: ["geodesics_from_point", "transport_demo"],
  },
  {
    id: "pack_gauss_map",
    title: "Gauss map + curvature",
    description: "Use curvature and chart grids to read the Gauss map structure.",
    topic: "Gauss map",
    difficulty: "intro",
    prerequisites: ["Basic curvature intuition"],
    requiredOperators: ["curvature_field", "chart_grid"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    tags: ["gauss map", "curvature"],
    templateIds: ["compute_curvature", "chart_and_basis"],
  },
  {
    id: "pack_atlas",
    title: "Atlas builder",
    description: "Chart + basis templates for building a local atlas on surfaces.",
    topic: "Atlas",
    difficulty: "intro",
    prerequisites: ["Parametric surfaces"],
    requiredOperators: ["chart_grid"],
    suggestedStages: ["define", "visualize", "compute", "explain"],
    tags: ["atlas", "charts", "basis"],
    templateIds: ["chart_and_basis"],
  },
  {
    id: "pack_selection",
    title: "Selection + overlays",
    description: "Selection workflows that combine masks, curvature, and curve overlays.",
    topic: "Selection",
    difficulty: "intro",
    prerequisites: ["Selection tools"],
    requiredOperators: ["selection_overlay", "curvature_field", "curve_overlay"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    tags: ["selection", "overlays", "curves"],
    templateIds: ["selection_stats", "curve_overlay_demo"],
  },
  {
    id: "pack_principal_dirs",
    title: "Principal directions",
    description: "Curvature + principal direction overlays for surface analysis.",
    topic: "Principal directions",
    difficulty: "intermediate",
    prerequisites: ["Curvature basics"],
    requiredOperators: ["curvature_field", "principal_dirs"],
    suggestedStages: ["define", "compute", "visualize", "explain"],
    tags: ["principal directions", "curvature"],
    templateIds: ["principal_directions"],
  },
];

export function createWorkbookFromTemplate(templateId: string, makeId: () => string): Workbook | null {
  const spec = WORKBOOK_TEMPLATES.find((t) => t.id === templateId);
  if (!spec) return null;
  return buildWorkbookFromTemplate(spec, makeId);
}
