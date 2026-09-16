import { describe, expect, it } from "vitest";
import { runDomainAdapterConformance } from "@math3d/kernel";
import { normalizeVolumeDocument } from "@math3d/core";
import { adaptAnalyticVolume } from "./infrastructure";
import { VolumeDocumentAdapter, volumeDocumentFromLegacyObject } from "./volumeDocumentAdapter";

const makeVolume = () => {
  const scalars = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const dataset = { kind: "volume" as const, grid: { dims: [2, 2, 2] as [number, number, number], scalars, spacing: [1, 2, 3] as [number, number, number], origin: [4, 5, 6] as [number, number, number] } };
  return adaptAnalyticVolume({ id: "sphere", label: "Sphere", presetId: "sphere", expression: "x*x+y*y+z*z-1", parameters: { radius: 1 }, dataset, grid: dataset.grid, tracker: new Map(), now: 10 });
};
const makeAdapter = () => new VolumeDocumentAdapter(volumeDocumentFromLegacyObject(makeVolume()));

describe("GK14 VolumeDocument adapter", () => {
  it("keeps dense payload bytes out of structural history and makes view-only edits hash-stable", () => {
    const adapter = makeAdapter();
    const original = adapter.sourceGeneration();
    expect(JSON.stringify(adapter.document())).not.toContain("scalars");
    expect(adapter.document().source.payload?.handle).toMatch(/^volume-buffer:/);
    adapter.setVisible(false);
    adapter.setAnalysisSettings({ isoValue: 0.3, sampling: { nx: 32, ny: 32, nz: 32 } });
    expect(adapter.sourceGeneration()).toEqual(original);
    expect(VolumeDocumentAdapter.parse(adapter.serialize()).document()).toEqual(adapter.document());
  });

  it("passes the shared GK03 conformance matrix", async () => {
    const report = await runDomainAdapterConformance<VolumeDocumentAdapter>({
      name: "VolumeDocumentAdapter", create: makeAdapter,
      snapshot: (adapter) => {
        const document = adapter.document(); const history = adapter.history();
        return { identity: document.identity, structuralState: document.source, persistentState: document,
          history: { undoDepth: history.undoDepth, redoDepth: history.redoDepth } };
      },
      preview: (adapter) => { adapter.previewSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: "x+y+z" } }); },
      commitStructuralEdit: (adapter) => { adapter.commitSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: "x+y+z" } }); },
      attemptInvalidEdit: (adapter) => { adapter.commitSource({ ...adapter.document().source, spatial: { ...adapter.document().source.spatial, dimensions: [0, 2, 2] } }); },
      undo: (adapter) => { adapter.undo(); }, redo: (adapter) => { adapter.redo(); },
      replay: (adapter) => VolumeDocumentAdapter.fromReplayBundle(JSON.parse(JSON.stringify(adapter.replayBundle()))),
      reopen: (adapter) => VolumeDocumentAdapter.parse(adapter.serialize()),
      queryIsolation: (adapter) => {
        const before = adapter.serialize();
        try { (adapter.document().source.spatial.dimensions as number[])[0] = 99; } catch { /* immutable query */ }
        return adapter.serialize() === before;
      },
    });
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });

  it("rejects invalid identity, oversized source, and corrupted payload references", () => {
    const document = makeAdapter().document();
    expect(normalizeVolumeDocument({ ...document, source: { ...document.source, payload: { ...document.source.payload, byteLength: -1 } } }).ok).toBe(false);
    expect(normalizeVolumeDocument({ ...document, source: { ...document.source, recipe: { expression: "x".repeat(70_000) } } }).ok).toBe(false);
    expect(normalizeVolumeDocument({ ...document, identity: { ...document.identity, structuralHash: "sha256:bad" } }).ok).toBe(false);
  });
});
