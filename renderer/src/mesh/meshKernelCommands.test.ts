import { describe, expect, it } from "vitest";
import {
  MESH_COMMAND_TYPES,
  createCommandEnvelope,
  createMeshCommandState,
  meshCommandDefinitions,
} from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import { MeshDocumentAdapter } from "./meshDocumentAdapter";
import type { SurfaceMeshData } from "./surfaceMesh";

const mesh: SurfaceMeshData = {
  label: "Triangle", source: { kind: "proceduralObjects" },
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
};
const envelope = (id: string, type: string, payload: unknown) => createCommandEnvelope({
  commandId: id, origin: { kind: "interactive", sourceId: "mesh-test" }, command: { type, payload: payload as never },
});

describe("GK08 mesh command transactions", () => {
  it("rejects an invalid mixed batch without changing the document or selection", () => {
    const document = MeshDocumentAdapter.fromMesh(mesh).document();
    const kernel = createInMemoryDocumentKernel({ initialState: createMeshCommandState(document), commandDefinitions: meshCommandDefinitions });
    const before = kernel.query((state) => state);
    const result = kernel.transact({
      transactionId: "mesh/invalid-batch",
      commands: [
        envelope("mesh/valid-selection", MESH_COMMAND_TYPES.commitSelection, { entityIds: [document.source.objectId] }),
        envelope("mesh/invalid-edit", MESH_COMMAND_TYPES.commitResource, { source: document.source, operation: "not-an-edit", parameters: {} }),
      ],
      history: { kind: "irreversible" },
    });
    expect(result.ok).toBe(false);
    expect(kernel.query((state) => state)).toEqual(before);
    expect(kernel.historyStatus().undoDepth).toBe(0);
  });
});
