import type {
  CameraPreset,
  MeshResult,
  SceneDocument,
  SurfaceDefinition,
  WorkerRequest,
  WorkerResponse,
} from "@math3d/core";

export type MobileSceneSummary = {
  id: string;
  title: string;
  updatedAt: number;
  surfaceCount: number;
};

export type MobileViewerScene = Pick<SceneDocument, "id" | "title" | "surfaces" | "cameras" | "activeCameraId"> & {
  previewMesh?: MeshResult;
};

export type MobileGalleryItem = {
  id: string;
  title: string;
  description: string;
  surface: SurfaceDefinition;
  defaultCamera?: CameraPreset;
};

export type MobileWorkerJob = {
  id: string;
  request: WorkerRequest;
  submittedAt: number;
};

export type MobileWorkerResult = {
  id: string;
  response: WorkerResponse;
  receivedAt: number;
};

