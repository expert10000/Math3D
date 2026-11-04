import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeScientificComplexPlane, sha256Checksum,
  type Graph2DScientificPlane } from "@math3d/core";

const fixture = new URL("../fixtures/scientific-scene/complex-wave.sscene/manifest.json", import.meta.url);
const bytes = (values: readonly number[]) => {
  const data = new Uint8Array(values.length * 8), view = new DataView(data.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return data;
};
const verified = (real: readonly number[], imaginary: readonly number[]) => {
  const manifest = JSON.parse(readFileSync(fixture, "utf8"));
  manifest.datasets[0].shape = [9, 9];
  manifest.coordinates[0].origin = [-4, -4];
  manifest.coordinates[0].spacing = [1, 1];
  manifest.resources = manifest.resources.map((resource: { id: string }) => {
    const values = resource.id === "real" ? real : imaginary;
    return { ...resource, count: 81, bytes: 648,
      sha256: sha256Checksum(bytes(values)).slice(7) };
  });
  const manifestJson = JSON.stringify(manifest);
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const plane = (component: "real" | "imaginary", values: readonly number[]): Graph2DScientificPlane => ({
    fingerprint, datasetId: "field", component, sourceShape: [9, 9],
    normalAxis: null, fixedIndex: null, planeAxes: [0, 1], shape: [9, 9],
    resourceSha256: manifest.resources.find((item: { id: string }) => item.id === component).sha256,
    planeSha256: sha256Checksum(bytes(values)).slice(7), values });
  return { manifestJson, fingerprint, real: plane("real", real),
    imaginary: plane("imaginary", imaginary) };
};
const grid = (component: "x" | "y") => Array.from({ length: 81 }, (_, index) =>
  component === "x" ? index % 9 - 4 : Math.floor(index / 9) - 4);

describe("GF-19 verified complex plane", () => {
  it("computes density, domain color and converged winding around a zero", () => {
    const field = verified(grid("x"), grid("y"));
    const result = analyzeScientificComplexPlane(field.manifestJson, field.fingerprint,
      field.real, field.imaginary, { left: 1, right: 7, top: 1, bottom: 7 });
    expect(result.shape).toEqual([9, 9]);
    expect(result.density[4 * 9 + 4]).toBeNull();
    expect(result.density[4 * 9 + 5]).toBe(1);
    expect(result.rgba.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 4)).toEqual([0, 0, 0, 0]);
    expect(result.definedCount).toBe(80);
    expect(result.winding).toMatchObject({ status: "resolved", integer: 1 });
    expect(result.source.realResourceSha256).toBe(field.real.resourceSha256);
  });

  it("withholds winding on undefined contour and rejects mismatched verified transfers", () => {
    const real = grid("x"), imaginary = grid("y");
    real[1 * 9 + 1] = 0; imaginary[1 * 9 + 1] = 0;
    const field = verified(real, imaginary);
    const result = analyzeScientificComplexPlane(field.manifestJson, field.fingerprint,
      field.real, field.imaginary, { left: 1, right: 7, top: 1, bottom: 7 });
    expect(result.winding).toMatchObject({ status: "undefined", integer: null });
    expect(() => analyzeScientificComplexPlane(field.manifestJson, field.fingerprint,
      field.real, { ...field.imaginary, planeSha256: field.real.planeSha256 },
      { left: 1, right: 7, top: 1, bottom: 7 })).toThrow(/checksum/);
  });
});
