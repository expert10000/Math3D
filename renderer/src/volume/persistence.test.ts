import { describe, expect, it } from "vitest";
import { adaptAnalyticVolume } from "./infrastructure";
import { getVolumeTransferPreset } from "./transferFunction";
import {
  createVolumeWorkbookBlock,
  createVolumeWorkspaceDocument,
  parseVolumeWorkspace,
  replayVolumeWorkbookBlock,
  restoreVolumeWorkspace,
  serializeVolumeWorkspace,
  VolumeWorkspaceHistory,
  type VolumeArtifactReference,
  type VolumeWorkspaceViewState,
} from "./persistence";

const makeVolume = () => {
  const scalars = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const dataset = { kind: "volume" as const, grid: { dims: [2, 2, 2] as [number, number, number], scalars, spacing: [1, 2, 3] as [number, number, number], origin: [4, 5, 6] as [number, number, number] } };
  return adaptAnalyticVolume({ id: "sphere", label: "Sphere", presetId: "sphere", expression: "x*x+y*y+z*z-1", parameters: { radius: 1 }, dataset, grid: dataset.grid, tracker: new Map(), now: 10 });
};

const view: VolumeWorkspaceViewState = {
  layout: "quad", viewMode: "slices", paneIndices: { x: 1, y: 0, z: 1 }, crosshair: [5, 6, 9], orientation: "scientific",
  linkedNavigation: true, voxelSnap: true, renderMode: "dvr", renderQuality: "balanced", textureSampling: "linear",
  transferFunction: getVolumeTransferPreset("viridis"), renderWindow: [0.1, 0.9], isoValue: 0, crop: null,
  camera: { position: [3, 4, 5], target: [0, 0, 0], up: [0, 1, 0] },
};

const artifact: VolumeArtifactReference = { id: "source", role: "source-grid", storage: "external-file", uri: "scan.npy", contentHash: "fnv1a:abc", byteLength: 32, scalarType: "float32", components: 1 };

describe("Volume workspace persistence", () => {
  it("round-trips canonical recipes, spatial/view state and compact references without expanding voxel bytes", () => {
    const volume = makeVolume();
    const block = createVolumeWorkbookBlock({ id: "slice-1", operation: "slice", title: "Axial review", sourceVolumeId: volume.identity.volumeId, sourceVolumeRevision: volume.identity.volumeRevision, parameters: { axis: "z", index: 1 }, preview: { label: "Z 2/2", summary: "2 × 2" }, artifactIds: [] });
    const document = createVolumeWorkspaceDocument({ volume, view, artifacts: [artifact], operations: [{ id: "sample", kind: "sampling", label: "Sample 2³", volumeRevision: 1, sampledGridRevision: 1, parameters: { nx: 2 }, artifactIds: [], createdAt: 11 }], workbookBlocks: [block], savedAt: 12 });
    const json = serializeVolumeWorkspace(document);
    const parsed = parseVolumeWorkspace(json);
    expect(parsed.volume.spatial).toEqual(volume.spatial);
    expect(parsed.sourceRecipe).toEqual(volume.source);
    expect(parsed.view).toEqual(view);
    expect(parsed.workbookBlocks[0].operation).toBe("slice");
    expect(json).not.toContain("\"scalars\"");
    expect(json.length).toBeLessThan(10_000);
  });

  it("reports missing and changed artifacts as recoverable relink diagnostics", () => {
    const document = createVolumeWorkspaceDocument({ volume: makeVolume(), view, artifacts: [artifact] });
    const missing = restoreVolumeWorkspace(document, () => ({ exists: false }));
    expect(missing.relinkRequired).toBe(true);
    expect(missing.diagnostics[0]).toMatchObject({ code: "missing-artifact", recoverable: true });
    const changed = restoreVolumeWorkspace(document, () => ({ exists: true, contentHash: "other" }));
    expect(changed.diagnostics[0].code).toBe("hash-mismatch");
    const ready = restoreVolumeWorkspace(document, () => ({ exists: true, contentHash: artifact.contentHash }));
    expect(ready.relinkRequired).toBe(false);
  });

  it("prevents history and Workbook replay from resurrecting unresolved payloads", () => {
    const volume = makeVolume();
    const block = createVolumeWorkbookBlock({ id: "segment-1", operation: "segment", title: "Threshold", sourceVolumeId: volume.identity.volumeId, sourceVolumeRevision: 1, parameters: { threshold: 0 }, preview: { label: "Mask", summary: "4 selected" }, artifactIds: [artifact.id] });
    const initial = createVolumeWorkspaceDocument({ volume, view, artifacts: [artifact], workbookBlocks: [block] });
    const next = createVolumeWorkspaceDocument({ volume, view: { ...view, layout: "3d" }, artifacts: [artifact] });
    const history = new VolumeWorkspaceHistory(initial);
    history.push(next);
    expect(() => history.undo(() => false)).toThrow(/relink/i);
    expect(history.undo((id) => id === artifact.id).view.layout).toBe("quad");
    expect(() => replayVolumeWorkbookBlock(block, volume, () => false)).toThrow(/missing artifact/i);
    expect(replayVolumeWorkbookBlock(block, volume, () => true).parameters.threshold).toBe(0);
  });

  it("rejects stale Workbook blocks and malformed artifact graphs", () => {
    const volume = makeVolume();
    const block = createVolumeWorkbookBlock({ id: "analyze", operation: "analyze", title: "Analyze", sourceVolumeId: volume.identity.volumeId, sourceVolumeRevision: 99, parameters: {}, preview: { label: "Stats", summary: "Ready" }, artifactIds: [] });
    expect(() => replayVolumeWorkbookBlock(block, volume, () => true)).toThrow(/stale/i);
    const document = createVolumeWorkspaceDocument({ volume, view, artifacts: [artifact] });
    const raw = JSON.parse(serializeVolumeWorkspace(document));
    raw.results.push({ id: "bad", kind: "analysis", label: "Bad", sourceVolumeId: "sphere", sourceVolumeRevision: 1, parameters: {}, artifactId: "unknown", state: "current" });
    expect(() => parseVolumeWorkspace(JSON.stringify(raw))).toThrow(/unknown artifact/i);
  });
});
