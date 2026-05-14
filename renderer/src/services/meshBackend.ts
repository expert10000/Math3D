import { electronMeshBackend, type MeshBackendCapabilities } from "@math3d/api-client";

export const meshBackend = electronMeshBackend;

export const getMeshBackendCapabilities = (): MeshBackendCapabilities => meshBackend.getCapabilities();

