import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createMath3DProject, createMeshDocument, createMixedWorkspaceDocument, createVolumeDocument, createGraph2DWorkspaceProject, getGraph2DPresetCatalog, instantiateGraph2DPreset, Graph2DPointTableStore, sha256Checksum } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { meshReplayState } from "../mesh/meshReplay";
import { captureProjectResources, encodeProjectResourceBytes, exportProjectPackage, parseProjectPackage, projectResourceInventory, VerifiedProjectResources } from "./projectResources";
import { inspectProjectCompatibility, previewProjectImport } from "./projectTransfer";

const triangle = (x = 0) => ({ label: "Resource triangle", source: { kind: "import" as const, format: "obj" as const, filename: "triangle.obj" }, positions: new Float32Array([x,0,0, x+1,0,0, x,1,0]), indices: new Uint32Array([0,1,2]), normals: new Float32Array([0,0,1,0,0,1,0,0,1]), uvs: new Float32Array([0,0,1,0,0,1]) });
const fixture = () => {
  const adapter = MeshDocumentAdapter.fromMesh(triangle());
  adapter.replaceMesh(triangle(2), "object-edit", { translation: [2,0,0] });
  adapter.commitSelection(["mesh-face:0"]); adapter.undo(); adapter.redo();
  const replay = adapter.replayBundle();
  const project = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: replay.checkpoint.document, expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }], activeDocumentIds: [adapter.document().identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }), { stableKey: "resource-fixture" });
  const resources = captureProjectResources(project, (item) => adapter.resources.bytes(item.reference as never));
  return { adapter, project, resources };
};

describe("PRJ15 verified project resources", () => {
  it("transfers original and edited Mesh buffers to an independent store with exact selection and history", () => {
    const { adapter, project, resources } = fixture(), original = JSON.stringify(project);
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const preview = previewProjectImport(exportProjectPackage(project, resources));
    expect(preview.canOpenWorkspace).toBe(true); expect(imported.project).toEqual(project);
    expect(projectResourceInventory(project)).toHaveLength(2);
    const store = imported.resources.meshStore(imported.project);
    const replay = project.workspace.entries[0]!.replay!.payload as never;
    const reopened = MeshDocumentAdapter.restoreReplay({ ...adapter.replayBundle(), resources: projectResourceInventory(project).map((item) => ({ reference: item.reference as never, bytes: store.bytes(item.reference as never)! })) });
    expect(meshReplayState(replay).document).toEqual(adapter.document());
    expect(reopened.document()).toEqual(adapter.document()); expect(reopened.selection()).toEqual(["mesh-face:0"]);
    expect(reopened.mesh().positions).toEqual(triangle(2).positions); expect(reopened.mesh().normals).toEqual(triangle().normals); expect(reopened.mesh().uvs).toEqual(triangle().uvs);
    reopened.undo(); reopened.undo(); expect(reopened.mesh().positions).toEqual(triangle().positions);
    reopened.redo(); expect(reopened.mesh().positions).toEqual(triangle(2).positions);
    expect(JSON.stringify(project)).toBe(original); expect(JSON.stringify(project)).not.toContain('"positions"');
  });
  it("rejects changed bytes, lengths, encoding, ownership, shape, duplicates and unowned resources during staging", () => {
    const { project, resources } = fixture(), sidecars = resources.sidecars();
    for (const mutate of [
      (row: any) => { row.data = "AAAA" + row.data.slice(4); },
      (row: any) => { row.byteLength++; }, (row: any) => { row.encoding = "future"; },
      (row: any) => { row.owners = ["another-document"]; }, (row: any) => { row.shape[0]++; },
      (row: any) => { row.id = "unowned"; },
    ]) {
      const copy = JSON.parse(JSON.stringify(sidecars)); mutate(copy[0]);
      expect(() => new VerifiedProjectResources(project, copy)).toThrow();
    }
    expect(() => new VerifiedProjectResources(project, [...sidecars, sidecars[0]!])).toThrow();
    const detached = resources.bytes(sidecars[0]!)!; detached[0] ^= 1;
    expect(resources.bytes(sidecars[0]!)![0]).not.toBe(detached[0]);
  });
  it("rebases host cache ownership for plain JSON and excludes another project's unreferenced resources", () => {
    const { project, resources } = fixture();
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "unrelated-graph").document;
    const target = createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "unrelated" });
    const preview = previewProjectImport(JSON.stringify(target), { resources });
    expect(preview.canOpenWorkspace).toBe(true); expect(preview.resources!.sidecars()).toEqual([]);
    const independent = createMath3DProject(project.workspace, { stableKey: "another-container" });
    const withResources = previewProjectImport(JSON.stringify(independent), { resources });
    expect(withResources.resources!.sidecars()).toEqual(resources.sidecars());
    expect(withResources.canOpenWorkspace).toBe(true);
  });
  it("keeps missing historical buffers explicit and blocks activation even when the visible mesh exists", () => {
    const { project, resources } = fixture(), current = project.workspace.entries[0]!.expected;
    const document = meshReplayState(project.workspace.entries[0]!.replay!.payload as never).document;
    const incomplete = new VerifiedProjectResources(project, resources.sidecars().filter((item) => item.id === document.source.resource.id));
    const preview = inspectProjectCompatibility(project, { resources: incomplete });
    expect(preview.canOpenWorkspace).toBe(false); expect(preview.sidecars.some((item) => item.requiredForSource && !item.available)).toBe(true);
    expect(preview.checkpoint.entries[0]!.expected).toEqual(current);
    expect(() => captureProjectResources(project, (item) => incomplete.bytes(item))).toThrow("Missing source");
  });
  it("rejects an inverse command that would restore a different source despite a valid forward state hash", () => {
    const { adapter } = fixture(), replay = JSON.parse(JSON.stringify(adapter.replayBundle()));
    replay.transactions[0].inverseCommands[0].command.payload.source = adapter.document().source;
    expect(() => meshReplayState(replay)).toThrow("inverse");
  });
  it("rejects self-consistent malformed buffers and keeps unsafe host origins preview-only", () => {
    for (const change of [(mesh: ReturnType<typeof triangle>) => { mesh.indices[2] = 99; }, (mesh: ReturnType<typeof triangle>) => { mesh.positions[0] = Number.NaN; }]) {
      const mesh = triangle(); change(mesh); const adapter = MeshDocumentAdapter.fromMesh(mesh), document = adapter.document();
      const project = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [], results: [], artifacts: [], relations: [], committedSelection: null }), { stableKey: "malformed" });
      expect(() => captureProjectResources(project, (item) => adapter.resources.bytes(item.reference as never))).toThrow("shape or values");
    }
    const { adapter } = fixture(), document = createMeshDocument({ source: { ...adapter.document().source, origin: { kind: "geometryObject", objects: { wrong: "array required" } } }, stableKey: "unsafe-origin", label: "Unsafe origin" });
    const project = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [], results: [], artifacts: [], relations: [], committedSelection: null }), { stableKey: "malformed" });
    const resources = captureProjectResources(project, (item) => adapter.resources.bytes(item.reference as never));
    expect(inspectProjectCompatibility(project, { resources }).canOpenWorkspace).toBe(false);
  });
  it("transfers point tables with gaps and verifies row counts/content hashes independently", () => {
    const tables = new Graph2DPointTableStore();
    const preset = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "prj15-data");
    for (const table of preset.sidecars) tables.publish(table.rows);
    const project = createMath3DProject(createGraph2DWorkspaceProject(preset.document), { stableKey: "data-resources" });
    const resources = captureProjectResources(project, (item) => {
      const rows = tables.resolve(item.reference as never); return rows ? new TextEncoder().encode(canonicalJsonStringify(rows)) : null;
    });
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    expect(inspectProjectCompatibility(imported.project, { resources: imported.resources }).canOpenWorkspace).toBe(true);
    const item = projectResourceInventory(project)[0]!, content = new TextDecoder().decode(imported.resources.bytes(item)!);
    expect(JSON.parse(content).some((row: any) => row.y === null)).toBe(true);
    const changed = resources.sidecars(); const rows = JSON.parse(content); rows.pop();
    const bytes = new TextEncoder().encode(canonicalJsonStringify(rows)); changed[0] = { ...changed[0]!, data: encodeProjectResourceBytes(bytes), byteLength: bytes.length, checksum: sha256Checksum(bytes) };
    expect(() => new VerifiedProjectResources(project, changed)).toThrow();
  });
  it("verifies imported Volume dimensions and components without qualifying an unsupported native sampler", () => {
    const document = createVolumeDocument({ stableKey: "dense-transfer", source: { representation: "dense-scalar-grid", recipe: { kind: "import", importRef: "dense.raw" }, spatial: { dimensions: [2,2,2], origin: [0,0,0], spacing: [1,1,1], direction: [1,0,0,0,1,0,0,0,1], centering: "point", coordinateSystem: "world", positionUnits: "mm", valueUnits: "density" }, dependencies: [], payload: { handle: "dense-source", byteLength: 32, scalarType: "float32", components: 1 } } });
    const project = createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "volume", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], results: [], relations: [], artifacts: [], constructions: [], committedSelection: null }), { stableKey: "dense-project" });
    const bytes = new Uint8Array(new Float32Array([1,2,3,4,5,6,7,8]).buffer);
    const resources = captureProjectResources(project, () => bytes), imported = parseProjectPackage(exportProjectPackage(project, resources));
    const preview = inspectProjectCompatibility(imported.project, { resources: imported.resources });
    expect(preview.sidecars).toMatchObject([{ kind: "volume-payload", available: true, requiredForSource: true }]);
    expect(preview.canOpenWorkspace).toBe(false); expect(preview.documents[0]!.editable).toBe(false);
    expect(imported.resources.bytes({ kind: "volume-payload", id: "dense-source" })).toEqual(bytes);
    expect(() => captureProjectResources(project, () => bytes.slice(4))).toThrow("dimensions");
  });
  it("preserves generations after a pruned redo branch, continues IDs, and folds checkpoint selections at the 100-edit bound", () => {
    const adapter = MeshDocumentAdapter.fromMesh(triangle());
    adapter.replaceMesh(triangle(1)); adapter.undo(); adapter.replaceMesh(triangle(3));
    let restored = MeshDocumentAdapter.restoreReplay(adapter.exportReplay());
    expect(restored.document()).toEqual(adapter.document()); restored.replaceMesh(triangle(4));
    expect(restored.exportReplay().transactions.at(-1)!.transactionId).toBe("mesh/edit/3");
    restored.commitSelection(["mesh-face:0"]);
    for (let index = 0; index < 102; index++) restored.replaceMesh(triangle(index + 10));
    const bundle = restored.exportReplay(); expect(bundle.transactions).toHaveLength(100); expect(bundle.resources).toHaveLength(101);
    restored = MeshDocumentAdapter.restoreReplay(bundle); expect(restored.selection()).toEqual(["mesh-face:0"]);
    expect(restored.document()).toEqual(meshReplayState(restored.replayBundle()).document);
    expect(Object.isFrozen(restored.replayBundle().transactions)).toBe(true);
  }, 30_000);
});
