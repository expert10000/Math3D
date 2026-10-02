import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createVolumeDocument, type VolumeDocumentSource } from "@math3d/core";
import { VolumeDocumentAdapter } from "../volume/volumeDocumentAdapter";
import { buildNativeVolumeDataset, nativeVolumeObject, readNativeVolumeValues, validateNativeVolumeReplay, volumeEditorSeed, volumeSourceFromEditor } from "./nativeVolumeRestore";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "./projectResources";
import { inspectProjectCompatibility } from "./projectTransfer";

const spatial: VolumeDocumentSource["spatial"] = { dimensions: [2,2,2], origin: [4,-2,1], spacing: [0.5,2,3], direction: [1,0,0,0,1,0,0,0,1], centering: "cell", coordinateSystem: "RAS", positionUnits: "mm", valueUnits: "density" };
const make = (scalarType = "float32", byteLength = 32) => createVolumeDocument({ stableKey: `dense-${scalarType}`, metadata: { title: "Measured scalar samples" }, source: { representation: "dense-scalar-grid", recipe: { kind: "dense-grid", sourceLabel: "experiment.raw", importRef: "experiment.raw", annotation: "retain" }, spatial, dependencies: [], payload: { handle: `samples-${scalarType}`, byteLength, scalarType, components: 1 } } });
const projectFor = (adapter: VolumeDocumentAdapter) => {
  const replay = adapter.replayBundle();
  return createMath3DProject(createMixedWorkspaceDocument({ entries: [{ module: "volume", checkpoint: replay.checkpoint, expected: adapter.document().identity, replay: { format: "math3d.volume-replay.v1", payload: replay as never } }], activeDocumentIds: [adapter.document().identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }), { stableKey: "dense-contract" });
};

describe("PRJ16 verified dense scalar Volume restoration", () => {
  it("decodes all eight little-endian scalar types without rewriting source or narrowing scientific metadata", () => {
    const codecs = [
      ["float32", 4, "setFloat32"], ["float64", 8, "setFloat64"], ["int32", 4, "setInt32"], ["uint32", 4, "setUint32"],
      ["int16", 2, "setInt16"], ["uint16", 2, "setUint16"], ["int8", 1, "setInt8"], ["uint8", 1, "setUint8"],
    ] as const;
    for (const [type, size, setter] of codecs) {
      const document = make(type, size * 8), before = JSON.stringify(document);
      const backing = new Uint8Array(size * 8 + 1), bytes = backing.subarray(1), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < 8; index++) (view[setter] as (offset: number, value: number, littleEndian: boolean) => void)(index * size, index + 1, true);
      const resources = { bytes: () => bytes.slice() }, dataset = buildNativeVolumeDataset(document, resources);
      expect([...dataset.grid.scalars]).toEqual([1,2,3,4,5,6,7,8]);
      expect(dataset.grid.origin).toEqual(spatial.origin); expect(dataset.grid.centering).toBe("cell");
      const object = nativeVolumeObject(document, dataset, new Map(), resources);
      expect(object.spatial.scalarType).toBe(type); expect(object.storage.byteLength).toBe(size * 8);
      expect(JSON.stringify(document)).toBe(before);
    }
  });
  it("requires checked sidecars and retains original bytes across grid edits, export and independent reopen", () => {
    const document = make(), adapter = new VolumeDocumentAdapter(document), bytes = new Uint8Array(new Float32Array([1,2,3,4,5,6,7,8]).buffer);
    expect(inspectProjectCompatibility(projectFor(adapter)).canOpenWorkspace).toBe(false);
    const resources = captureProjectResources(projectFor(adapter), () => bytes);
    expect(projectResourceInventory(projectFor(adapter))[0]!.required).toBe(true);
    expect(inspectProjectCompatibility(projectFor(adapter), { resources }).canOpenWorkspace).toBe(true);
    const seed = volumeEditorSeed(document); expect(volumeSourceFromEditor(document, seed)).toBe(document.source);
    adapter.commitSource(volumeSourceFromEditor(document, { ...seed, spatial: { ...spatial, origin: [10,20,30], valueUnits: "temperature" } }));
    adapter.undo(); adapter.redo();
    const exported = parseProjectPackage(exportProjectPackage(projectFor(adapter), captureProjectResources(projectFor(adapter), () => bytes)));
    const replay = exported.project.workspace.entries[0]!.replay!.payload;
    const restored = VolumeDocumentAdapter.fromReplayBundle(replay as never);
    expect(restored.document()).toEqual(adapter.document()); expect(restored.document().source.payload).toEqual(document.source.payload);
    expect(restored.document().source.recipe).toEqual(document.source.recipe);
    expect(exported.resources.bytes({ kind: "volume-payload", id: document.source.payload!.handle })).toEqual(bytes);
    validateNativeVolumeReplay(restored.document(), restored.replayBundle(), exported.resources);
    restored.undo(); expect(restored.document().source.spatial).toEqual(spatial); restored.redo();
    expect([...buildNativeVolumeDataset(restored.document(), exported.resources).grid.scalars]).toEqual([1,2,3,4,5,6,7,8]);
  });
  it("rejects resized grids, unsupported samplers and invalid values before an edit or activation", () => {
    const document = make(), seed = volumeEditorSeed(document), adapter = new VolumeDocumentAdapter(document);
    expect(() => volumeSourceFromEditor(document, { ...seed, spatial: { ...spatial, dimensions: [3,2,2] } })).toThrow("fixed");
    expect(() => volumeSourceFromEditor(document, { ...seed, spatial: { ...spatial, direction: [0,-1,0,1,0,0,0,0,1] } })).toThrow("different");
    expect(() => readNativeVolumeValues(document)).toThrow("Missing");
    expect(() => readNativeVolumeValues(document, { bytes: () => new Uint8Array(4) })).toThrow("invalid");
    const invalid = new Uint8Array(new Float32Array([Infinity,2,3,4,5,6,7,8]).buffer);
    const resources = captureProjectResources(projectFor(adapter), () => invalid);
    expect(inspectProjectCompatibility(projectFor(adapter), { resources }).canOpenWorkspace).toBe(false);
    expect(adapter.document()).toEqual(document); expect(adapter.history().undoDepth).toBe(0);
    for (const source of [
      { ...document.source, representation: "dense-vector-grid" as const },
      { ...document.source, recipe: { kind: "import" } },
      { ...document.source, payload: { ...document.source.payload!, components: 3 } },
      { ...document.source, payload: { ...document.source.payload!, scalarType: "constructor" } },
    ]) expect(() => volumeEditorSeed(createVolumeDocument({ source }))).toThrow();
  });
  it("checks missing historical payloads before enabling undo and preserves float64/NaN source samples", () => {
    const document = make("float64", 64), adapter = new VolumeDocumentAdapter(document);
    const values = new Float64Array([1.123456789, NaN, 3,4,5,6,7,8]), bytes = new Uint8Array(values.buffer);
    expect(readNativeVolumeValues(document, { bytes: () => bytes })[0]).toBe(1.123456789);
    expect(buildNativeVolumeDataset(document, { bytes: () => bytes }).grid.scalars[1]).toBeNaN();
    adapter.commitSource({ ...document.source, payload: { ...document.source.payload!, handle: "replacement" } });
    const project = projectFor(adapter), incomplete = captureProjectResources(project, (item) => item.id === "replacement" ? bytes : null, true);
    expect(inspectProjectCompatibility(project, { resources: incomplete }).canOpenWorkspace).toBe(false);
    expect(() => validateNativeVolumeReplay(adapter.document(), adapter.replayBundle(), incomplete)).toThrow("Missing");
  });
});
