import type {
  MeshResult,
  SceneDocument,
  SurfaceDefinition,
  WorkerRequest,
  WorkerResponse,
  WorkerCapabilityId,
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

export type Math3DExampleCategory = "implicit" | "graphs" | "minimal" | "periodic" | "classic";

export type Math3DExample = {
  id: string;
  title: string;
  description: string;
  category: Math3DExampleCategory;
  surfaceType: SurfaceDefinition["kind"];
  scene: SceneDocument;
  capabilities: WorkerCapabilityId[];
  learnTopic?: {
    title: string;
    summary: string;
    prompt: string;
    insight: string;
    recommendedOverlay?: "curvature" | "normals" | "boundaries" | "non-manifold";
  };
};

export type MobileStoredSceneProject = {
  id: string;
  title: string;
  updatedAt: number;
  lastOpenedAt: number;
  serializedProject: string;
  source?: {
    kind: "imported" | "shared" | "desktop";
    name: string;
    sourceProjectId: string;
    importedAt: number;
  };
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
