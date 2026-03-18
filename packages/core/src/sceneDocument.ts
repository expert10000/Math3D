import type { Vec3 } from "./math";
import type { GeometryObject, GeometryScene } from "./sceneObjects";

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
