import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, readProjectCoordinateFrame, upsertMath3DProjectComposition } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "./projectResources";
import { verifyProjectCompositionEvidenceSources } from "./projectCompositionEvidenceSource";
import { subdivideWithRetainedMeshCheckpoint } from "./retainedMeshGeneration";

const square = () => ({ label: "Square", source: { kind: "detachedMesh" as const, math3dCoordinateFrame: {
  format: "math3d.coordinate-frame/v1", frame: "laboratory xyz", unit: "mm",
  axes: ["x", "y", "z"], handedness: "right" } },
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
    expect(readProjectCoordinateFrame(before)).toEqual(readProjectCoordinateFrame(after));
    expect(readProjectCoordinateFrame(after)).toMatchObject({ status: "declared", value: { unit: "mm" } });
    expect(replay.checkpoint.document).toEqual(before);
    expect(adapter.mesh().indices).toHaveLength(24);
    const base = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: before,
      expected: after.identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
      activeDocumentIds: [before.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }),
      { stableKey: "pc11-retained-mesh" });
    const project = upsertMath3DProjectComposition(base, { id: "pc11-before-after", title: "Pre/post subdivision",
      mode: "side-by-side", members: [before, after].map((document, index) => ({ documentId: document.identity.id,
        expected: document.identity, visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as never });
    expect(projectResourceInventory(project).map(item => item.checksum).sort()).toEqual([
      before.source.resource.checksum, after.source.resource.checksum].sort());
    const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
    expect(resources.sidecars()).toHaveLength(2);
    const restored = parseProjectPackage(exportProjectPackage(project, resources));
    const comparison = restored.project.compositions![0]!;
    expect(verifyProjectCompositionEvidenceSources(restored.project, comparison,
      item => restored.resources.bytes(item)).map(item => [item.revision, item.hash, item.vertexCount]))
      .toEqual([[before.identity.revision, before.identity.structuralHash, 4],
        [after.identity.revision, after.identity.structuralHash, adapter.mesh().positions.length / 3]]);
    expect(() => verifyProjectCompositionEvidenceSources(project, project.compositions![0]!, item => {
      const bytes = adapter.resources.bytes(item.reference as never);
      if (!bytes) return null;
      const changed = bytes.slice(); changed[0] ^= 1; return changed;
    })).toThrow("checksum");
    expect(() => captureProjectResources(project, item => item.id === before.source.resource.id ? null : adapter.resources.bytes(item.reference as never))).toThrow("Missing source");
  });

  it("refuses an ambiguous pre-remesh checkpoint after an earlier edit", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    adapter.replaceMesh({ ...adapter.mesh(), positions: new Float32Array([-2,-1,0, 1,-1,0, 1,1,0, -1,1,0]) });
    expect(() => subdivideWithRetainedMeshCheckpoint(adapter)).toThrow("already has edits");
  });
});
