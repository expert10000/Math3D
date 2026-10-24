import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGraph2DFieldReference, createScientificFieldDocument, sha256Checksum,
  validGraph2DScientificDatasetOrigin } from "@math3d/core";
import { reverifyScientificFieldLine, scientificFieldLineSelectionMatchesSlice } from "./reverifyScientificFieldLine";

const fixture = new URL("../../../tests/fixtures/scientific-scene/thermal-gradient.sscene/", import.meta.url);
const manifestJson = readFileSync(fileURLToPath(new URL("manifest.json", fixture)), "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const bytes = readFileSync(fileURLToPath(new URL("temperature.f64", fixture)));
const values = Array.from({ length: 35 }, (_, index) => bytes.readDoubleLE(index * 8));
const reference = createGraph2DFieldReference(manifestJson, fingerprint,
  { kind: "preset", value: "thermal" }, "temperature", "scalar");
const document = createScientificFieldDocument({ reference,
  quantity: { name: "Temperature", unit: "K" },
  display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "data" } } },
{ stableKey: reference.id });
type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphVolumeLine" | "closeGraphDataset">;
const bridgeFor = () => {
  const closeGraphDataset = vi.fn(async () => true);
  const openGraphDatasetReference = vi.fn(async () => ({ ok: true as const,
    source: { manifestJson, fingerprint } }));
  const previewGraphSlice = vi.fn(async ({ varyingAxis, fixedIndex }: { varyingAxis: 0 | 1; fixedIndex: number }) => {
    const lineValues = varyingAxis === 0 ? Array.from({ length: 5 }, (_, i) => values[i * 7 + fixedIndex]!) :
      Array.from({ length: 7 }, (_, j) => values[fixedIndex * 7 + j]!);
    const raw = new Uint8Array(lineValues.length * 8), view = new DataView(raw.buffer);
    lineValues.forEach((value, index) => view.setFloat64(index * 8, value, true));
    return { fingerprint, datasetId: "temperature", component: "scalar", varyingAxis, fixedIndex,
      shape: [5, 7] as [number, number], resourceSha256: reference.resourceSha256,
      sliceSha256: sha256Checksum(raw).slice(7), values: lineValues };
  });
  return { closeGraphDataset, openGraphDatasetReference, previewGraphSlice } as unknown as Bridge;
};

describe("saved scalar field to Graph line", () => {
  it("reopens the source and preserves both row and column coordinates, units and hashes", async () => {
    const bridge = bridgeFor();
    const column = await reverifyScientificFieldLine(document,
      { kind: "grid2d", varyingAxis: 0, fixedIndex: 1 }, bridge);
    expect(column.rows.map(row => row.x)).toEqual([0, 1, 2, 3, 4]);
    expect(column.origin).toMatchObject({ xName: "time", xUnit: "s", yName: "Temperature", yUnit: "K",
      sceneFingerprint: fingerprint, resourceSha256: reference.resourceSha256,
      slice: { varyingAxis: 0, fixedIndex: 1, fixedCoordinate: 2, fixedName: "distance", fixedUnit: "m" } });
    const row = await reverifyScientificFieldLine(document,
      { kind: "grid2d", varyingAxis: 1, fixedIndex: 2 }, bridge);
    expect(row.rows.map(point => point.x)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(row.origin.slice).toMatchObject({ varyingAxis: 1, fixedIndex: 2, fixedCoordinate: 2,
      fixedName: "time", fixedUnit: "s" });
    expect(bridge.openGraphDatasetReference).toHaveBeenCalledTimes(2);
    expect(bridge.closeGraphDataset).toHaveBeenCalledTimes(2);
  });

  it("withholds changed, missing and tampered slice sources", async () => {
    const changed = bridgeFor();
    vi.mocked(changed.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "changed",
      error: "manifest changed" });
    await expect(reverifyScientificFieldLine(document,
      { kind: "grid2d", varyingAxis: 0, fixedIndex: 1 }, changed)).rejects.toThrow(/source changed/);
    expect(changed.closeGraphDataset).not.toHaveBeenCalled();
    const missing = bridgeFor();
    vi.mocked(missing.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "missing",
      error: "bundle removed" });
    await expect(reverifyScientificFieldLine(document,
      { kind: "grid2d", varyingAxis: 0, fixedIndex: 1 }, missing)).rejects.toThrow(/source missing/);
    const tampered = bridgeFor();
    vi.mocked(tampered.previewGraphSlice).mockImplementationOnce(async request => ({
      fingerprint, datasetId: "temperature", component: "scalar", varyingAxis: request.varyingAxis,
      fixedIndex: request.fixedIndex, shape: [5, 7], resourceSha256: reference.resourceSha256,
      sliceSha256: "0".repeat(64), values: [1, 2, 3, 4, 5] }));
    await expect(reverifyScientificFieldLine(document,
      { kind: "grid2d", varyingAxis: 0, fixedIndex: 1 }, tampered)).rejects.toThrow(/checksum/);
    expect(tampered.closeGraphDataset).toHaveBeenCalledWith(fingerprint);
  });
});

const volumeFixture = new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url);
const volumeManifest = JSON.parse(readFileSync(fileURLToPath(new URL("manifest.json", volumeFixture)), "utf8"));
volumeManifest.resources = volumeManifest.resources.filter((item: { id: string }) => item.id === "north");
volumeManifest.datasets[0].semanticType = "scalar-field";
volumeManifest.datasets[0].quantity = { name: "Potential", unit: "V" };
volumeManifest.datasets[0].real = "north";
delete volumeManifest.datasets[0].components;
const volumeJson = JSON.stringify(volumeManifest);
const volumeFingerprint = sha256Checksum(new TextEncoder().encode(volumeJson)).slice(7);
const volumeBytes = readFileSync(fileURLToPath(new URL("north.f64", volumeFixture)));
const volumeReference = createGraph2DFieldReference(volumeJson, volumeFingerprint,
  { kind: "preset", value: "scalar-volume" }, "field", "scalar");
const volumeDocument = createScientificFieldDocument({ reference: volumeReference,
  quantity: { name: "Potential", unit: "V" },
  display: { view: "plane", normalAxis: 2, fixedIndex: 4, transfer: { mode: "data" } } },
{ stableKey: volumeReference.id });
const volumeBridge = () => {
  const closeGraphDataset = vi.fn(async () => true);
  const openGraphDatasetReference = vi.fn(async () => ({ ok: true as const,
    source: { manifestJson: volumeJson, fingerprint: volumeFingerprint } }));
  const previewGraphVolumeLine = vi.fn(async ({ normalAxis, planeFixedIndex, varyingAxis, fixedIndex }:
    { normalAxis: 0 | 1 | 2; planeFixedIndex: number; varyingAxis: 0 | 1 | 2; fixedIndex: number }) => {
    const shape = [21, 21, 17] as [number, number, number];
    const values = Array.from({ length: shape[varyingAxis] }, (_, index) => {
      const axes = [0, 1, 2].map(axis => axis === normalAxis ? planeFixedIndex :
        axis === varyingAxis ? index : fixedIndex);
      return volumeBytes.readDoubleLE(((axes[0]! * shape[1] + axes[1]!) * shape[2] + axes[2]!) * 8);
    });
    const raw = new Uint8Array(values.length * 8), view = new DataView(raw.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    return { fingerprint: volumeFingerprint, datasetId: "field", component: "scalar" as const,
      shape, normalAxis, planeFixedIndex, varyingAxis, fixedIndex,
      resourceSha256: volumeReference.resourceSha256,
      sliceSha256: sha256Checksum(raw).slice(7), values };
  });
  return { closeGraphDataset, openGraphDatasetReference, previewGraphVolumeLine } as unknown as Bridge;
};

describe("saved 3D scalar plane to Graph line", () => {
  const selection = { kind: "plane3d" as const, normalAxis: 2 as const, planeFixedIndex: 4,
    varyingAxis: 0 as const, fixedIndex: 3 };
  it("records plane and in-plane coordinates, units, axes and full-resource checksum", async () => {
    const bridge = volumeBridge();
    const preview = await reverifyScientificFieldLine(volumeDocument, selection, bridge);
    expect(preview.rows).toHaveLength(21);
    expect(preview.rows[0]?.x).toBe(-4);
    expect(preview.rows.at(-1)?.x).toBe(4);
    expect(preview.origin).toMatchObject({ xName: "x", xUnit: "m", yName: "Potential", yUnit: "V",
      sceneFingerprint: volumeFingerprint, resourceSha256: volumeReference.resourceSha256,
      slice: { varyingAxis: 0, fixedAxis: 1, fixedIndex: 3, fixedCoordinate: -2.8,
        fixedName: "y", fixedUnit: "m", plane: { normalAxis: 2, fixedIndex: 4,
          fixedCoordinate: -1.5, fixedName: "z", fixedUnit: "m" } } });
    expect(validGraph2DScientificDatasetOrigin(preview.origin)).toBe(true);
    expect(scientificFieldLineSelectionMatchesSlice(selection, preview.origin.slice)).toBe(true);
    expect(scientificFieldLineSelectionMatchesSlice({ ...selection, planeFixedIndex: 5 }, preview.origin.slice)).toBe(false);
    expect(scientificFieldLineSelectionMatchesSlice({ ...selection, fixedIndex: 4 }, preview.origin.slice)).toBe(false);
    expect(bridge.openGraphDatasetReference).toHaveBeenCalledTimes(1);
    expect(bridge.closeGraphDataset).toHaveBeenCalledWith(volumeFingerprint);
  });

  it("withholds missing, changed and checksum-corrupt 3D transfers", async () => {
    const missing = volumeBridge();
    vi.mocked(missing.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "missing",
      error: "bundle removed" });
    await expect(reverifyScientificFieldLine(volumeDocument, selection, missing)).rejects.toThrow(/source missing/);
    const changed = volumeBridge();
    vi.mocked(changed.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "changed",
      error: "resource integrity failed" });
    await expect(reverifyScientificFieldLine(volumeDocument, selection, changed)).rejects.toThrow(/source changed/);
    const tampered = volumeBridge();
    vi.mocked(tampered.previewGraphVolumeLine).mockImplementationOnce(async request => ({
      ...await volumeBridge().previewGraphVolumeLine(request), sliceSha256: "0".repeat(64) }));
    await expect(reverifyScientificFieldLine(volumeDocument, selection, tampered)).rejects.toThrow(/checksum/);
    expect(tampered.closeGraphDataset).toHaveBeenCalledWith(volumeFingerprint);
  });
});
