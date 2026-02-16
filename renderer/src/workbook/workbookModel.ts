import type { DatasetKind } from "../scene/datasets";
import type { SurfaceId, ColorMode } from "../components/SurfaceViewer";
import type { ParamSurfaceId } from "../components/ParamSurfaceViewer";
import type { ColorPalette } from "../components/colorPalette";

export type WorkbookStageId = "define" | "compute" | "visualize" | "explain";
export type WorkbookBlockType = "text" | "formula" | "visualize" | "compute" | "assert";

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

export type WorkbookBlock = {
  id: string;
  type: WorkbookBlockType;
  title: string;
  text?: string;
  formula?: string;
  visualize?: {
    live: boolean;
    snapshot?: WorkbookViewSnapshot | null;
    notes?: string;
  };
  compute?: {
    operatorId?: string;
    status?: "idle" | "ok" | "stale";
    summary?: string;
    datasetRef?: string;
    lastRunAt?: number;
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
          },
          {
            id: makeId(),
            type: "formula",
            title: "Surface formula",
            formula: "x(u,v), y(u,v), z(u,v)",
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
          },
          {
            id: makeId(),
            type: "assert",
            title: "Expected checks",
            assert: { expected: "", status: "pending" },
          },
        ],
      },
    ],
  };
}
