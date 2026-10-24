import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGraph2DFieldReference, createScientificFieldDocument, sha256Checksum } from "@math3d/core";
import { reverifyScientificFieldLine } from "./reverifyScientificFieldLine";

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
  "openGraphDatasetReference" | "previewGraphSlice" | "closeGraphDataset">;
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
    const column = await reverifyScientificFieldLine(document, 0, 1, bridge);
    expect(column.rows.map(row => row.x)).toEqual([0, 1, 2, 3, 4]);
    expect(column.origin).toMatchObject({ xName: "time", xUnit: "s", yName: "Temperature", yUnit: "K",
      sceneFingerprint: fingerprint, resourceSha256: reference.resourceSha256,
      slice: { varyingAxis: 0, fixedIndex: 1, fixedCoordinate: 2, fixedName: "distance", fixedUnit: "m" } });
    const row = await reverifyScientificFieldLine(document, 1, 2, bridge);
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
    await expect(reverifyScientificFieldLine(document, 0, 1, changed)).rejects.toThrow(/source changed/);
    expect(changed.closeGraphDataset).not.toHaveBeenCalled();
    const missing = bridgeFor();
    vi.mocked(missing.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "missing",
      error: "bundle removed" });
    await expect(reverifyScientificFieldLine(document, 0, 1, missing)).rejects.toThrow(/source missing/);
    const tampered = bridgeFor();
    vi.mocked(tampered.previewGraphSlice).mockImplementationOnce(async request => ({
      fingerprint, datasetId: "temperature", component: "scalar", varyingAxis: request.varyingAxis,
      fixedIndex: request.fixedIndex, shape: [5, 7], resourceSha256: reference.resourceSha256,
      sliceSha256: "0".repeat(64), values: [1, 2, 3, 4, 5] }));
    await expect(reverifyScientificFieldLine(document, 0, 1, tampered)).rejects.toThrow(/checksum/);
    expect(tampered.closeGraphDataset).toHaveBeenCalledWith(fingerprint);
  });
});
