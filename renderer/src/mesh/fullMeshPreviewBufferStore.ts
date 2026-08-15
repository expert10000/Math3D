import type { MeshValidation } from "./surfaceMesh";
import type { GeometryPickPolicy, GeometryRenderableMetadata } from "../geometry/picking";

export type FullMeshPreviewBounds = {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
};

export type FullMeshPreviewBufferPayload = {
  id?: string;
  label?: string;
  positions: Float32Array;
  indices?: Uint32Array | null;
  normals?: Float32Array | null;
  uvs?: Float32Array | null;
  meanEdgeLength?: number | null;
  validation?: MeshValidation | null;
  fullPreviewBounds?: FullMeshPreviewBounds | null;
  color?: number;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  pickPolicy?: GeometryPickPolicy;
  renderableMetadata?: GeometryRenderableMetadata;
  transform?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  };
};

const fullMeshPreviewBuffers = new Map<string, FullMeshPreviewBufferPayload>();
let fullMeshPreviewBufferCounter = 0;

export const storeFullMeshPreviewBuffer = (payload: FullMeshPreviewBufferPayload, preferredKey?: string): string => {
  const key = preferredKey ?? `full-mesh-preview:${++fullMeshPreviewBufferCounter}`;
  fullMeshPreviewBuffers.set(key, payload);
  return key;
};

export const readFullMeshPreviewBuffer = (key: string | null | undefined): FullMeshPreviewBufferPayload | null => {
  if (!key) return null;
  return fullMeshPreviewBuffers.get(key) ?? null;
};

export const releaseFullMeshPreviewBuffer = (key: string | null | undefined): void => {
  if (!key) return;
  fullMeshPreviewBuffers.delete(key);
};
