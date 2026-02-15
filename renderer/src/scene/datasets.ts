import type { Image2D, PolylineSet, SurfaceMesh } from "./renderPrimitives";

export type DatasetKind = "surface" | "mesh" | "volume";

export type SurfaceScalarField = {
  name: string;
  values: Float32Array | number[];
};

export type SurfaceFields = {
  scalars?: SurfaceScalarField[];
};

export type MeshDataset = {
  kind: "mesh";
  mesh: SurfaceMesh;
  fields?: SurfaceFields | null;
};

export type VolumeGrid = {
  dims: [number, number, number];
  scalars: Float32Array;
  spacing?: [number, number, number];
  origin?: [number, number, number];
};

export type VectorGrid = {
  dims: [number, number, number];
  vectors: Float32Array;
  spacing?: [number, number, number];
  origin?: [number, number, number];
};

export type VolumeFields = {
  scalars?: { name: string; values: Float32Array | number[] }[];
};

export type VolumeDataset = {
  kind: "volume";
  grid: VolumeGrid;
  fields?: VolumeFields | null;
  derived?: { slice?: Image2D | null } | null;
  label?: string;
  note?: string;
  distanceSigned?: boolean;
  sourceId?: string;
};

export type Dataset = MeshDataset | VolumeDataset;

export type SurfaceDerivedView =
  | { kind: "polylines"; data: PolylineSet }
  | { kind: "scalarField"; data: SurfaceScalarField }
  | { kind: "image"; data: Image2D };
