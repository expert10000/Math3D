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
