import { describe, expect, it } from "vitest";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { SAVED_MESH_STUDIES, studyEndpoints } from "./savedMeshStudies";
import { createMixedWorkspaceDocument } from "@math3d/core";

describe("guided saved Mesh studies", () => {
  it("publishes existing numerical operations with exact provenance and idempotent repeat runs", () => {
    const mesh = MeshDocumentAdapter.fromMesh({ label: "Unit square", positions: Float32Array.from([0,0,0, 1,0,0, 0,1,0, 1,1,0]), indices: Uint32Array.from([0,1,2, 1,3,2]), source: { kind: "bakedFromParam" } });
    let workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: mesh.document(), expected: mesh.document().identity, replay: null }], activeDocumentIds: [mesh.document().identity.id], results: [], relations: [], artifacts: [], constructions: [], committedSelection: null });
    for (const study of SAVED_MESH_STUDIES) {
      const result = analyzeSavedMesh(mesh, study.id, study.id === "edge-path" ? studyEndpoints("0", "", 4) : undefined);
      expect(result.provenance.source).toMatchObject({ documentId: mesh.document().identity.id, revision: mesh.document().identity.revision, structuralHash: mesh.document().identity.structuralHash });
      expect(result.warnings.length).toBeGreaterThan(0);
      workspace = appendSavedMeshAnalysis(workspace, result);
      expect(appendSavedMeshAnalysis(workspace, analyzeSavedMesh(mesh, study.id, study.id === "edge-path" ? studyEndpoints("0", "", 4) : undefined))).toBe(workspace);
    }
    expect(workspace.results).toHaveLength(3);
    expect(workspace.results.find(result => result.provenance.operation.type === "mesh.saved.edge-path")?.summary).toMatchObject({ length: 2, vertexIndices: [0, 1, 3] });
    expect(() => studyEndpoints("-1", "2", 4)).toThrow();
    expect(() => studyEndpoints("1.5", "2", 4)).toThrow();
    expect(() => studyEndpoints("", "2", 4)).toThrow();
  });
});
