import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, inspectProjectCompositionAvailability, readProjectCoordinateFrame, retainedMeshGenerationDocuments, upsertMath3DProjectComposition } from "@math3d/core";
import { resolveProjectCompositionMember } from "../components/ProjectCompositionView";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "./projectResources";
import { verifyProjectCompositionEvidenceSources } from "./projectCompositionEvidenceSource";
import { subdivideWithRetainedMeshCheckpoint, transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";

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

  it("retains successive explicit generations and refuses unmarked history", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    const first = subdivideWithRetainedMeshCheckpoint(adapter);
    const second = subdivideWithRetainedMeshCheckpoint(adapter);
    const third = transformWithRetainedMeshSnapshot(adapter, [1, 0, 0], 1.5);
    const replay = adapter.replayBundle();
    const entry = { module: "mesh" as const, checkpoint: replay.checkpoint.document,
      expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } };
    expect(retainedMeshGenerationDocuments(entry).map(document => document.identity)).toEqual([
      first.before.identity, second.before.identity, third.before.identity,
    ]);
    expect(third.after.source.origin).toEqual(first.before.source.origin);
    expect(readProjectCoordinateFrame(third.after)).toMatchObject({ status: "declared", value: { unit: "mm" } });
    const unmarked = MeshDocumentAdapter.fromMesh(square());
    unmarked.replaceMesh({ ...unmarked.mesh(), positions: new Float32Array([-2,-1,0, 1,-1,0, 1,1,0, -1,1,0]) });
    const marked = transformWithRetainedMeshSnapshot(unmarked, [0, 1, 0], 1);
    const later = unmarked.replayBundle();
    expect(retainedMeshGenerationDocuments({ module: "mesh", checkpoint: later.checkpoint.document,
      expected: unmarked.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: later as never } })
      .map(document => document.identity)).toEqual([marked.before.identity]);
    const legacyEntry = { module: "mesh" as const, checkpoint: later.checkpoint.document,
      expected: unmarked.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: later as never } };
    const legacyWorkspace = createMixedWorkspaceDocument({ entries: [legacyEntry], activeDocumentIds: [legacyEntry.expected.id],
      constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
    const legacyComparison = { id: "pc12-replay-checkpoint", title: "Existing checkpoint", mode: "side-by-side" as const,
      members: [legacyEntry.checkpoint.identity, legacyEntry.expected].map((expected, index) => ({ documentId: expected.id,
        expected, visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as never };
    expect(inspectProjectCompositionAvailability(legacyComparison, legacyWorkspace)).toEqual(["retained-checkpoint", "current"]);
    const legacyProject = createMath3DProject(legacyWorkspace, { stableKey: "pc12-legacy-checkpoint" });
    expect(resolveProjectCompositionMember(legacyProject, legacyComparison.members[0], item =>
      unmarked.resources.bytes(item.reference as never)).generation).toBe("retained checkpoint");
  });

  it("round-trips an intermediate/current comparison and refuses missing, changed, or invented sources", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    subdivideWithRetainedMeshCheckpoint(adapter);
    const middle = transformWithRetainedMeshSnapshot(adapter, [0.25, 0, 0], 1);
    transformWithRetainedMeshSnapshot(adapter, [0, 0.5, 0], 1);
    const replay = adapter.replayBundle();
    const entry = { module: "mesh" as const, checkpoint: replay.checkpoint.document,
      expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } };
    const retained = retainedMeshGenerationDocuments(entry);
    expect(retained.map(document => document.identity.revision)).toEqual([
      replay.checkpoint.document.identity.revision, middle.before.identity.revision, middle.after.identity.revision,
    ]);
    const workspace = createMixedWorkspaceDocument({ entries: [entry], activeDocumentIds: [entry.expected.id],
      constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
    const base = createMath3DProject(workspace, { stableKey: "pc12-multi-mesh" });
    const comparison = { id: "pc12-intermediate-current", title: "Intermediate/current Mesh", mode: "side-by-side" as const,
      members: [retained[1]!.identity, entry.expected].map((expected, index) => ({ documentId: expected.id,
        expected, visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as never };
    const project = upsertMath3DProjectComposition(base, comparison);
    expect(inspectProjectCompositionAvailability(comparison, project.workspace)).toEqual(["retained-mesh", "current"]);
    expect(projectResourceInventory(project)).toHaveLength(4);
    const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
    const restored = parseProjectPackage(exportProjectPackage(project, resources));
    const read = (item: Parameters<typeof restored.resources.bytes>[0]) => restored.resources.bytes(item);
    const saved = restored.project.compositions![0]!;
    expect(verifyProjectCompositionEvidenceSources(restored.project, saved, read)
      .map(source => [source.revision, source.hash, source.generation, source.unit])).toEqual([
        [middle.before.identity.revision, middle.before.identity.structuralHash, "retained snapshot", "mm"],
        [entry.expected.revision, entry.expected.structuralHash, "current", "mm"],
      ]);
    expect(resolveProjectCompositionMember(restored.project, saved.members[0], read).revision).toBe(middle.before.identity.revision);
    expect(() => verifyProjectCompositionEvidenceSources(restored.project, saved, item =>
      item.id === middle.before.source.resource.id ? null : read(item))).toThrow("unavailable");
    expect(() => verifyProjectCompositionEvidenceSources(restored.project, saved, item => {
      const bytes = read(item);
      if (!bytes || item.id !== middle.before.source.resource.id) return bytes;
      const changed = bytes.slice(); changed[0] ^= 1; return changed;
    })).toThrow("checksum");
    const invented = { ...saved.members[0], expected: { ...saved.members[0].expected, revision: 999 } };
    expect(() => resolveProjectCompositionMember(restored.project, invented, read)).toThrow("no matching retained");
    const forgedReplay = JSON.parse(JSON.stringify(replay));
    forgedReplay.transactions[1].commands[0].command.payload.parameters.retainedBefore = "sha256:wrong";
    expect(() => retainedMeshGenerationDocuments({ ...entry, replay: { format: "math3d.mesh-replay.v1", payload: forgedReplay } }))
      .toThrow("marker does not match");
  });

  it("caps explicitly retained generations at eight", () => {
    const adapter = MeshDocumentAdapter.fromMesh(square());
    for (let index = 0; index < 8; index++) transformWithRetainedMeshSnapshot(adapter, [0.01, 0, 0], 1);
    expect(() => transformWithRetainedMeshSnapshot(adapter, [0.01, 0, 0], 1)).toThrow("At most 8");
  });
});
