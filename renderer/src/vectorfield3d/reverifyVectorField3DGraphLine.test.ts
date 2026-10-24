import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument, sha256Checksum,
  validGraph2DScientificDatasetOrigin, type VectorField3DSource } from "@math3d/core";
import { reverifyVectorField3DGraphLine, vectorField3DGraphLineMatches,
  type VectorField3DGraphLineSelection } from "./reverifyVectorField3DGraphLine";

const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url));
const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const names = ["east", "north", "up"] as const;
const locator = { kind: "preset", value: "vortexVolume" } as const;
const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
  locator, "field", name)) as [ReturnType<typeof createGraph2DFieldReference>,
  ReturnType<typeof createGraph2DFieldReference>, ReturnType<typeof createGraph2DFieldReference>];
const source: VectorField3DSource = {
  axes: [{ role: "x", label: "x", unit: "m", min: -4, max: 4 },
    { role: "y", label: "y", unit: "m", min: -4, max: 4 },
    { role: "z", label: "z", unit: "m", min: -3, max: 3 }],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 125, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 },
};
const document = createVectorField3DDocument(source, { stableKey: "vector-line-test" });
type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphVectorVolumeLine" | "closeGraphDataset">;
const bridgeFor = (): Bridge => ({
  openGraphDatasetReference: vi.fn(async () => ({ ok: true as const,
    source: { manifestJson, fingerprint } })),
  closeGraphDataset: vi.fn(async () => true),
  previewGraphVectorVolumeLine: vi.fn(async request => {
    const shape = [21, 21, 17] as [number, number, number];
    const bytes = readFileSync(`${directory}${request.component}.f64`);
    const values = Array.from({ length: shape[request.varyingAxis] }, (_, index) => {
      const axes = [0, 1, 2].map(axis => axis === request.normalAxis ? request.planeFixedIndex :
        axis === request.varyingAxis ? index : request.fixedIndex);
      return bytes.readDoubleLE(((axes[0]! * shape[1] + axes[1]!) * shape[2] + axes[2]!) * 8);
    });
    const encoded = new Uint8Array(values.length * 8), view = new DataView(encoded.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    return { fingerprint, datasetId: "field", component: request.component, shape,
      normalAxis: request.normalAxis, planeFixedIndex: request.planeFixedIndex,
      varyingAxis: request.varyingAxis, fixedIndex: request.fixedIndex,
      resourceSha256: references[names.indexOf(request.component as typeof names[number])]!.resourceSha256,
      sliceSha256: sha256Checksum(encoded).slice(7), values };
  }),
}) as Bridge;

describe("saved 3D vector field to Graph line", () => {
  const selections: VectorField3DGraphLineSelection[] = [
    { component: "east", normalAxis: 2, planeFixedIndex: 4, varyingAxis: 0, fixedIndex: 3 },
    { component: "north", normalAxis: 0, planeFixedIndex: 3, varyingAxis: 1, fixedIndex: 5 },
    { component: "up", normalAxis: 1, planeFixedIndex: 3, varyingAxis: 2, fixedIndex: 5 },
  ];
  it("keeps each component, all three line directions and both fixed coordinates", async () => {
    const bridge = bridgeFor();
    const previews = await Promise.all(selections.map(selection =>
      reverifyVectorField3DGraphLine(document, selection, bridge)));
    expect(previews.map(preview => preview.rows.length)).toEqual([21, 21, 17]);
    expect(previews.map(preview => preview.origin.component)).toEqual(["east", "north", "up"]);
    expect(previews.map(preview => preview.origin.xName)).toEqual(["x", "y", "z"]);
    expect(previews.map(preview => preview.origin.slice)).toMatchObject([
      { fixedAxis: 1, fixedCoordinate: -2.8, plane: { normalAxis: 2, fixedCoordinate: -1.5 } },
      { fixedAxis: 2, fixedCoordinate: -1.125, plane: { normalAxis: 0, fixedCoordinate: -2.8 } },
      { fixedAxis: 0, fixedCoordinate: -2, plane: { normalAxis: 1, fixedCoordinate: -2.8 } },
    ]);
    previews.forEach((preview, index) => {
      expect(preview.origin).toMatchObject({ locator, xUnit: "m", yUnit: "m/s",
        resourceSha256: references[index]!.resourceSha256 });
      expect(validGraph2DScientificDatasetOrigin(preview.origin)).toBe(true);
      expect(vectorField3DGraphLineMatches(selections[index]!, preview.origin)).toBe(true);
      expect(vectorField3DGraphLineMatches({ ...selections[index]!, fixedIndex: 6 }, preview.origin)).toBe(false);
      expect(vectorField3DGraphLineMatches({ ...selections[index]!, planeFixedIndex: 6 }, preview.origin)).toBe(false);
    });
    expect(bridge.openGraphDatasetReference).toHaveBeenCalledTimes(3);
    expect(bridge.closeGraphDataset).toHaveBeenCalledTimes(3);
    expect(bridge.previewGraphVectorVolumeLine).toHaveBeenCalledWith(expect.objectContaining({
      components: ["east", "north", "up"] }));
  });

  it("rejects changed, missing and corrupt components before publishing a line", async () => {
    const changed = bridgeFor();
    vi.mocked(changed.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "changed",
      error: "component north integrity failed" });
    await expect(reverifyVectorField3DGraphLine(document, selections[0]!, changed))
      .rejects.toThrow(/source changed/);
    const missing = bridgeFor();
    vi.mocked(missing.openGraphDatasetReference).mockResolvedValueOnce({ ok: false, status: "missing",
      error: "component up missing" });
    await expect(reverifyVectorField3DGraphLine(document, selections[0]!, missing))
      .rejects.toThrow(/source missing/);
    const tampered = bridgeFor();
    vi.mocked(tampered.previewGraphVectorVolumeLine).mockImplementationOnce(async request => ({
      ...await bridgeFor().previewGraphVectorVolumeLine(request), sliceSha256: "0".repeat(64) }));
    await expect(reverifyVectorField3DGraphLine(document, selections[0]!, tampered))
      .rejects.toThrow(/checksum/);
    expect(tampered.closeGraphDataset).toHaveBeenCalledWith(fingerprint);
  });
});
