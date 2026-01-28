import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type SurfaceMesh = SurfaceMeshData;

export type Polyline3 = { x: number; y: number; z: number };
export type PolylineSet = Polyline3[][];

export type Image2DFormat = "rgba8" | "r8" | "r32f";

export type Image2D = {
  width: number;
  height: number;
  format: Image2DFormat;
  data: Uint8Array | Uint8ClampedArray | Float32Array;
  worldPlane?: {
    center: [number, number, number];
    normal: [number, number, number];
    u: [number, number, number];
    v: [number, number, number];
    width: number;
    height: number;
  };
};

export type RenderPrimitive = SurfaceMesh | PolylineSet | Image2D;
