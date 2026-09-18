import {
  createScientificJobRequest,
  createStableDocumentId,
  structuralHash,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createExecutionService,
  createInProcessScientificJobService,
  createScientificExecutionBroker,
  type ScientificExecutionBackend,
} from "@math3d/kernel";
import { getMeshBackendCapabilities } from "./meshBackend";
import { vtkCleanNormals, type VtkMeshResponse } from "./vtkMeshClient";

export const LEGACY_VTK_NORMALS_OPERATION = "mesh.normals.compute";
export type LegacyVtkNormalsRunner = (
  positions: Float32Array,
  indices: Uint32Array,
  options?: { computeNormals?: boolean }
) => Promise<VtkMeshResponse>;

type PendingNormals = { response?: VtkMeshResponse };
type LegacyVtkNormalsOptions = {
  run?: LegacyVtkNormalsRunner;
  available?: () => boolean;
};

let sequence = 0;

const failure = (message: string): VtkMeshResponse => ({ ok: false, error: message });

/**
 * Phase-1 compatibility adapter for the existing VTK bridge. The bridge is
 * provided by either Electron IPC or the web proxy; its request protocol is
 * deliberately left unchanged. Typed arrays remain local to this adapter and
 * only compact metadata crosses the canonical scientific-job envelope.
 */
export const runLegacyVtkCleanNormals = async (
  positions: Float32Array,
  indices: Uint32Array,
  options?: { computeNormals?: boolean },
  adapterOptions: LegacyVtkNormalsOptions = {}
): Promise<VtkMeshResponse> => {
  sequence += 1;
  const jobId = `legacy-vtk-normals/${sequence}`;
  const identity = {
    operation: LEGACY_VTK_NORMALS_OPERATION,
    positionBytes: positions.byteLength,
    indexBytes: indices.byteLength,
    vertexCount: Math.floor(positions.length / 3),
    triangleCount: Math.floor(indices.length / 3),
  };
  const source: ScientificSourceGeneration = {
    documentId: createStableDocumentId("mesh-operation", identity),
    revision: 1,
    structuralHash: structuralHash(identity),
    generation: 1,
  };
  const pending: PendingNormals = {};
  const run = adapterOptions.run ?? vtkCleanNormals;
  const available = adapterOptions.available ?? (() => getMeshBackendCapabilities().vtkMeshCleanNormals);
  const service = createInProcessScientificJobService({
    resolveSource: (documentId) => documentId === source.documentId ? source : null,
    adapters: [{
      operationType: LEGACY_VTK_NORMALS_OPERATION,
      execute: async (_input, context) => {
        context.consumeWork(Math.max(1, identity.triangleCount));
        const response = await run(positions, indices, options);
        pending.response = response;
        context.checkpoint();
        if (!response.ok) throw new Error(response.error);
        return {
          vertexCount: response.vertexCount,
          triangleCount: response.triCount,
          normalCount: response.normals ? Math.floor(response.normals.length / 3) : 0,
        };
      },
    }],
  });
  const backend: ScientificExecutionBackend = {
    backendId: "legacy-vtk-bridge",
    backendVersion: "1",
    transport: "worker",
    priority: 100,
    supportsCancellation: false,
    discover: () => available()
      ? { available: true, operations: [{ operationType: LEGACY_VTK_NORMALS_OPERATION, retrySafety: "never", maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: 1024 * 1024 * 1024, maxWorkUnits: 1_000_000_000 }] }
      : { available: false, operations: [], unavailableReason: "VTK compatibility bridge is unavailable." },
    execute: (request) => service.submit(request),
  };
  const execution = createExecutionService(createScientificExecutionBroker({
    resolveSource: (documentId) => documentId === source.documentId ? source : null,
    backends: [backend],
  }));
  const outcome = await execution.submit(createScientificJobRequest({
    jobId,
    source,
    operation: { type: LEGACY_VTK_NORMALS_OPERATION, payload: { ...identity, computeNormals: options?.computeNormals ?? true } },
    limits: {
      deadlineAt: Date.now() + 90_000,
      maxInputBytes: 64 * 1024,
      maxOutputBytes: 64 * 1024,
      maxMemoryBytes: 1024 * 1024 * 1024,
      maxWorkUnits: 1_000_000_000,
    },
  }));
  if (pending.response) return pending.response;
  return failure(outcome.ok ? "VTK compatibility adapter returned no mesh response." : outcome.message);
};
