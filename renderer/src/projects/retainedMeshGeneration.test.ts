import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { captureProjectResources, projectResourceInventory } from "./projectResources";
import { subdivideWithRetainedMeshCheckpoint } from "./retainedMeshGeneration";

const square = () => ({ label: "Square", source: { kind: "detachedMesh" as const },
  positions: new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]),
  indices: new Uint32Array([0,1,2, 0,2,3]), normals: null, uvs: null });

describe("PC11 retained Mesh generation", () => {
  it("keeps the exact pre-subdivision source, revision, units and both binary sidecars", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    const { before, after } = subdivideWithRetainedMeshCheckpoint(adapter);
    const replay = adapter.replayBundle();
    expect(after.identity.id).toBe(before.identity.id);
    expect(after.identity.revision).toBe(before.identity.revision + 1);
    expect(after.source.origin).toEqual(before.source.origin);
    expect(replay.checkpoint.document).toEqual(before);
    expect(adapter.mesh().indices).toHaveLength(24);
    const project = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: before,
      expected: after.identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
      activeDocumentIds: [before.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }),
      { stableKey: "pc11-retained-mesh" });
    expect(projectResourceInventory(project).map(item => item.checksum).sort()).toEqual([
      before.source.resource.checksum, after.source.resource.checksum].sort());
    const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
    expect(resources.sidecars()).toHaveLength(2);
    expect(() => captureProjectResources(project, item => item.id === before.source.resource.id ? null : adapter.resources.bytes(item.reference as never))).toThrow("Missing source");
  });

  it("refuses an ambiguous pre-remesh checkpoint after an earlier edit", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    adapter.replaceMesh({ ...adapter.mesh(), positions: new Float32Array([-2,-1,0, 1,-1,0, 1,1,0, -1,1,0]) });
    expect(() => subdivideWithRetainedMeshCheckpoint(adapter)).toThrow("already has edits");
  });
});
