import { describe, expect, it } from "vitest";
import { adoptMixedWorkspaceProject, createMixedWorkspaceDocument, createVolumeDocument, type VolumeDocumentSource } from "@math3d/core";
import { VolumeDocumentAdapter } from "../volume/volumeDocumentAdapter";
import { buildNativeVolumeDataset, nativeVolumeObject, volumeDocumentEditable, volumeEditorSeed, volumeSourceFromEditor } from "./nativeVolumeRestore";
import { inspectProjectCompatibility } from "./projectTransfer";
import { verifyMixedWorkspaceReplay, MIXED_REPLAY_FORMATS } from "../kernel/mixedWorkspaceReplay";

const source: VolumeDocumentSource = {
  representation: "analytic-scalar-field", recipe: { kind: "analytic-preset", presetId: "sphere", expression: "F = x^2 + y^2 + z^2 - R^2", parameters: { R: 2 }, annotation: "preserve this" },
  spatial: { dimensions: [3, 2, 2], origin: [4, -2, 1], spacing: [0.5, 2, 3], direction: [1,0,0,0,1,0,0,0,1], centering: "cell", coordinateSystem: "RAS", positionUnits: "mm", valueUnits: "density" },
  dependencies: [], payload: { handle: "cache:unavailable", byteLength: 48, scalarType: "float32", components: 1 },
};
const make = (next = source) => createVolumeDocument({ source: next, stableKey: "prj14", metadata: { title: "Saved sphere", analysisSettings: { iso: 2 } } });
const project = (document = make()) => adoptMixedWorkspaceProject(createMixedWorkspaceDocument({ entries: [{ module: "volume", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }), "Volume study");

describe("PRJ14 native Volume restoration", () => {
  it("samples the saved formula and parameters at exact point/cell coordinates without rewriting cached source", () => {
    for (const centering of ["point", "cell"] as const) {
      const document = make({ ...source, spatial: { ...source.spatial, centering } }), before = JSON.stringify(document);
      const dataset = buildNativeVolumeDataset(document), object = nativeVolumeObject(document, dataset, new Map());
      expect(dataset.grid.scalars[0]).toBe(17); expect(dataset.grid.scalars[2]).toBe(26);
      expect(dataset.grid.scalars[11]).toBe(37);
      expect(object.spatial).toMatchObject(document.source.spatial);
      expect(object.spatial.centering).toBe(centering);
      expect(JSON.stringify(document)).toBe(before);
      const seed = volumeEditorSeed(document);
      expect(seed.sampling.center[0]).toBe(4.5);
      expect(seed.sampling.extents[0]).toBe(centering === "point" ? 0.5 : 0.75);
    }
  });
  it("keeps unknown annotations, units and no-op source; discards obsolete caches only on validated edits", () => {
    const document = make(), seed = volumeEditorSeed(document);
    expect(volumeSourceFromEditor(document, seed)).toBe(document.source);
    const next = volumeSourceFromEditor(document, { ...seed, expression: "x+y+z+R" });
    expect(next.payload).toBeNull(); expect(next.recipe.annotation).toBe("preserve this"); expect(next.spatial).toEqual(source.spatial);
    const adapter = new VolumeDocumentAdapter(document);
    expect(() => volumeSourceFromEditor(document, { ...seed, expression: "unknown(x)" })).toThrow();
    expect(adapter.document()).toEqual(document); expect(adapter.history().undoDepth).toBe(0);
  });
  it("qualifies procedural cache references as unverified optional resources and rejects missing dense or unsupported recipes", () => {
    const report = inspectProjectCompatibility(project());
    expect(report.canOpenWorkspace).toBe(true);
    expect(report.sidecars).toEqual([{ id: "cache:unavailable", kind: "volume-payload", checksum: null, byteLength: 48, requiredForSource: false, available: false }]);
    const dense = make({ ...source, representation: "dense-scalar-grid", recipe: { kind: "dense-grid" } });
    expect(inspectProjectCompatibility(project(dense)).canOpenWorkspace).toBe(false);
    expect(inspectProjectCompatibility(project(dense)).sidecars[0]!.requiredForSource).toBe(true);
    for (const next of [
      { ...source, spatial: { ...source.spatial, direction: [0,-1,0,1,0,0,0,0,1] } },
      { ...source, recipe: { ...source.recipe, expression: "Mandelbulb iteration" } },
      { ...source, recipe: { ...source.recipe, expression: "__proto__(x)" } },
      { ...source, recipe: { ...source.recipe, expression: "F = " } },
      { ...source, recipe: { ...source.recipe, expression: "x+" } },
      { ...source, spatial: { ...source.spatial, dimensions: [129, 2, 2] as const } },
      { ...source, dependencies: [{ module: "mesh", objectId: "missing", revision: 1, relation: "source" }] },
    ]) expect(volumeDocumentEditable(make(next))).toBe(false);
  });
  it("retains exact replay identity across undo/redo, pruned branches, failed edits and continued editing", () => {
    const adapter = new VolumeDocumentAdapter(make());
    const edit = (expression: string) => adapter.commitSource(volumeSourceFromEditor(adapter.document(), { ...volumeEditorSeed(adapter.document()), expression }));
    edit("x+R"); edit("y+R"); adapter.undo();
    const before = adapter.document();
    expect(() => adapter.commitSource({ ...before.source, spatial: { ...before.source.spatial, dimensions: [0, 2, 2] } })).toThrow();
    expect(adapter.history().redoDepth).toBe(1); adapter.redo(); adapter.undo(); edit("z+R");
    adapter.undo(); adapter.redo(); adapter.setAnalysisSettings({ iso: 7 });
    const bundle = adapter.replayBundle(), reopened = VolumeDocumentAdapter.fromReplayBundle(JSON.parse(JSON.stringify(bundle)));
    expect(Object.isFrozen(bundle.checkpoint)).toBe(true);
    expect(Object.isFrozen(bundle.transactions[0])).toBe(true);
    expect(reopened.document()).toEqual(adapter.document()); expect(reopened.history()).toEqual(adapter.history());
    reopened.undo(); reopened.redo(); reopened.commitSource({ ...reopened.document().source, recipe: { ...reopened.document().source.recipe, expression: "x+y+R" } });
    expect(VolumeDocumentAdapter.fromReplayBundle(reopened.replayBundle()).document()).toEqual(reopened.document());
    const workspace = createMixedWorkspaceDocument({ ...project().workspace, entries: [{ module: "volume", checkpoint: reopened.replayBundle().checkpoint, expected: reopened.document().identity, replay: { format: MIXED_REPLAY_FORMATS.volume, payload: reopened.replayBundle() as any } }] });
    expect(verifyMixedWorkspaceReplay(workspace).get(before.identity.id)).toEqual(reopened.document());
  });
  it("bounds long history to 100 edits without losing source generations or reusing command IDs", () => {
    const adapter = new VolumeDocumentAdapter(make());
    for (let i = 0; i < 107; i++) adapter.commitSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: `x+${i}` } });
    adapter.undo(); adapter.undo();
    const bundle = adapter.replayBundle(); expect(bundle.transactions).toHaveLength(100);
    const restored = VolumeDocumentAdapter.fromReplayBundle(bundle); expect(restored.document()).toEqual(adapter.document());
    restored.redo(); restored.commitSource({ ...restored.document().source, recipe: { ...restored.document().source.recipe, expression: "x+200" } });
    const ids = restored.replayBundle().transactions.map((entry) => entry.forward.commandId);
    expect(new Set(ids).size).toBe(ids.length); expect(ids.at(-1)).toBe("volume/edit/108/forward");
    expect(VolumeDocumentAdapter.fromReplayBundle(restored.replayBundle()).document()).toEqual(restored.document());
    expect(() => VolumeDocumentAdapter.fromReplayBundle({ ...bundle, cursor: -1 })).toThrow();
  });
  it("folds a legacy unbounded export into the existing native history window", () => {
    const adapter = new VolumeDocumentAdapter(make()), transactions = [];
    for (let i = 0; i < 105; i++) {
      adapter.commitSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: `x+${i}` } });
      transactions.push(adapter.replayBundle().transactions.at(-1)!);
    }
    adapter.undo();
    const restored = VolumeDocumentAdapter.fromReplayBundle({ checkpoint: make(), transactions, cursor: 104 });
    expect(restored.document()).toEqual(adapter.document());
    expect(restored.replayBundle().transactions).toHaveLength(100);
    expect(restored.history()).toEqual(adapter.history());
  }, 30_000);
});
