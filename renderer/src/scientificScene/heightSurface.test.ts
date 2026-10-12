import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildScientificHeightMesh } from "./heightSurface";

const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/sincos.sscene/", import.meta.url));

describe("SSR-03 existing SurfaceViewer display adapter", () => {
  it("maps stored grid nodes to one bounded, pickable surface without evaluating a formula", async () => {
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    const bundle = JSON.parse(await readFile(join(directory, "bundle.json"), "utf8"));
    const bytes = await readFile(join(directory, "values.f64"));
    const values = Array.from({ length: bytes.length / 8 }, (_, index) => bytes.readDoubleLE(index * 8));
    const mesh = buildScientificHeightMesh({ manifest, fingerprint: bundle.manifest.sha256, datasetId: "f", values });
    expect(mesh.id).toBe("f");
    expect(mesh.source).toMatchObject({ kind: "scientificSceneField", sceneId: "sincos-grid", datasetId: "f" });
    expect(mesh.positions.length).toBe(289 * 3);
    expect(mesh.indices?.length).toBe(16 * 16 * 6);
    expect(mesh.positions[212 * 3]).toBeCloseTo(Math.PI / 2, 6);
    expect(mesh.positions[212 * 3 + 1]).toBe(0);
    expect(mesh.positions[212 * 3 + 2]).toBe(1);
    expect(Array.from(mesh.indices!.slice(0, 6))).toEqual([0, 17, 1, 17, 18, 1]);
  });

  it("refuses a forged dataset, non-finite sample or unbounded display", async () => {
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    const values = Array(289).fill(0);
    const source = { manifest, fingerprint: "a".repeat(64), datasetId: "f", values };
    expect(() => buildScientificHeightMesh({ ...source, datasetId: "missing" })).toThrow(/Unsupported/);
    const bad = [...values]; bad[0] = Number.NaN;
    expect(() => buildScientificHeightMesh({ ...source, values: bad })).toThrow(/Invalid bounded/);
    expect(() => buildScientificHeightMesh({ ...source, values: Array(4097).fill(0) })).toThrow(/Invalid bounded/);
  });
});
