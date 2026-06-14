import type { Vec3 } from "./math";
import type { GeometryObject, GeometryScene } from "./sceneObjects";
import type { ConstructionGraph } from "./constructionGraph";

export type SurfaceDefinition =
  | {
      id: string;
      kind: "explicit";
      expression: string;
      domain?: { xSpan: number; ySpan: number };
      resolution?: number;
    }
  | {
      id: string;
      kind: "implicit";
      expression: string;
      domain?: { xSpan: number; ySpan: number; zSpan?: number };
      resolution?: number;
    }
  | {
      id: string;
      kind: "parametric";
      xExpr: string;
      yExpr: string;
      zExpr: string;
      domain?: { uMin: number; uMax: number; vMin: number; vMax: number };
      resolution?: number;
    }
  | {
      id: string;
      kind: "weierstrass";
      gExpr: string;
      phiExpr: string;
      recenter?: boolean;
      domain?: { uMin: number; uMax: number; vMin: number; vMax: number };
      resolution?: number;
    }
  | {
      id: string;
      kind: "mesh";
      source: string;
      meshToken?: string;
    };

export type OverlayDefinition = {
  id: string;
  kind:
    | "label"
    | "grid"
    | "axis"
    | "wireframe"
    | "contours"
    | "probe"
    | "principalDirections"
    | "principalLines"
    | "curvatureLines"
    | "ridges"
    | "valleys"
    | "gaussMap"
    | "boundingBox";
  visible: boolean;
  style?: Record<string, string | number | boolean | null>;
};

export type CameraPreset = {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
  up?: Vec3;
  fovDeg?: number;
};

export const SCENE_DOCUMENT_EXTENSION_KEY = "math3d.sceneDocument" as const;
export const SCENE_DOCUMENT_EXTENSION_VERSION = 1 as const;

export type SceneDocumentScriptKind = "scene" | "construction" | "procedural" | "workbook";

export type SceneDocumentScript = {
  id: string;
  title?: string;
  kind: SceneDocumentScriptKind;
  language: string;
  source: string;
  createdAt?: number;
  updatedAt?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SceneDocumentExtensionV1 = {
  version: typeof SCENE_DOCUMENT_EXTENSION_VERSION;
  constructionGraph?: ConstructionGraph;
  scripts?: SceneDocumentScript[];
  workbookWorkspace?: unknown;
};

export type SceneDocument = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  geometry?: GeometryScene;
  objects?: GeometryObject[];
  surfaces?: SurfaceDefinition[];
  overlays?: OverlayDefinition[];
  cameras?: CameraPreset[];
  activeCameraId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  extensions?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const getSceneDocumentExtension = (scene: SceneDocument): SceneDocumentExtensionV1 | undefined => {
  const extension = scene.extensions?.[SCENE_DOCUMENT_EXTENSION_KEY];
  if (!isRecord(extension) || extension.version !== SCENE_DOCUMENT_EXTENSION_VERSION) return undefined;
  return extension as SceneDocumentExtensionV1;
};

export const withSceneDocumentExtension = (
  scene: SceneDocument,
  extension: Omit<SceneDocumentExtensionV1, "version"> | SceneDocumentExtensionV1
): SceneDocument => ({
  ...scene,
  extensions: {
    ...(scene.extensions ?? {}),
    [SCENE_DOCUMENT_EXTENSION_KEY]: {
      ...extension,
      version: SCENE_DOCUMENT_EXTENSION_VERSION,
    },
  },
});

export const getSceneDocumentConstructionGraph = (scene: SceneDocument): ConstructionGraph | undefined =>
  getSceneDocumentExtension(scene)?.constructionGraph;

export const withSceneDocumentConstructionGraph = (
  scene: SceneDocument,
  constructionGraph: ConstructionGraph
): SceneDocument => {
  const extension = getSceneDocumentExtension(scene);
  return withSceneDocumentExtension(scene, {
    ...(extension ?? {}),
    constructionGraph,
  });
};
