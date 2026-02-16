import type { DatasetKind } from "../scene/datasets";
import type { SurfaceId, ColorMode } from "../components/SurfaceViewer";
import type { ParamSurfaceId } from "../components/ParamSurfaceViewer";
import type { ColorPalette } from "../components/colorPalette";

export type WorkbookStageId = "define" | "compute" | "visualize" | "explain";
export type WorkbookBlockType = "text" | "formula" | "visualize" | "compute" | "assert";
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
  visualize?: {
    live: boolean;
    snapshot?: WorkbookViewSnapshot | null;
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
            visualize: { live: true, snapshot: null },
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
