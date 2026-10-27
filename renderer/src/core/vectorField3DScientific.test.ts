import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  sampleVectorField3DScientificArrows, sha256Checksum, verifyVectorField3DVolumes,
  integrateVectorField3DScientificTrajectories, reviseVectorField3DDocument,
  type Graph2DScientificVolume, type VectorField3DSource } from "@math3d/core";

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
const document = createVectorField3DDocument(source, { stableKey: "vector-scientific-test" });
const volumes = names.map((component, index) => {
  const bytes = readFileSync(`${directory}${component}.f64`);
  const values = Array.from({ length: bytes.length / 8 }, (_, i) => bytes.readDoubleLE(i * 8));
  return { fingerprint, datasetId: "field", component, sourceShape: [21, 21, 17],
    sampleShape: [21, 21, 17], resourceSha256: references[index].resourceSha256,
    sampleSha256: sha256Checksum(bytes).slice(7), values } as Graph2DScientificVolume;
}) as [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];

describe("GRA-14 complete verified scientific 3D transfer", () => {
  it("accepts three matching components and samples the checked grid with source identity", () => {
    expect(verifyVectorField3DVolumes(document, manifestJson, fingerprint, volumes)).toBe(volumes);
    const artifact = sampleVectorField3DScientificArrows(document, manifestJson, fingerprint, volumes);
    expect(artifact).toMatchObject({ evaluated: 125, accepted: 125, rejected: 0,
      density: [5, 5, 5], componentUnits: ["m/s", "m/s", "m/s"] });
    expect(artifact.arrows[0]?.position).toEqual([-4, -4, -3]);
    expect(artifact.arrows.at(-1)?.position).toEqual([4, 4, 3]);
    expect(artifact.source.structuralHash).toBe(document.identity.structuralHash);
  });

  it("rejects changed components, axes, shapes and transfer checksums before sampling", () => {
    const swapped = [volumes[1], volumes[0], volumes[2]] as typeof volumes;
    expect(() => sampleVectorField3DScientificArrows(document, manifestJson, fingerprint, swapped))
      .toThrow(/component|volume/i);
    const values = [...volumes[2].values]; values[0] += 1;
    expect(() => sampleVectorField3DScientificArrows(document, manifestJson, fingerprint,
      [volumes[0], volumes[1], { ...volumes[2], values }])).toThrow(/checksum/);
    expect(() => sampleVectorField3DScientificArrows(document, manifestJson, fingerprint,
      [volumes[0], { ...volumes[1], sourceShape: [21, 20, 17] }, volumes[2]])).toThrow(/volume/i);
    const altered = JSON.parse(manifestJson);
    altered.coordinates[0].spacing[0] = .5;
    const alteredJson = JSON.stringify(altered);
    const alteredFingerprint = sha256Checksum(new TextEncoder().encode(alteredJson)).slice(7);
    expect(() => verifyVectorField3DVolumes(document, alteredJson, alteredFingerprint, volumes))
      .toThrow(/saved complete|changed/i);
  });

  it("integrates a saved seed only after verifying the complete bundle transfer", () => {
    const seeded = reviseVectorField3DDocument(document, { ...document.source,
      seeds: [{ id: "off-axis", position: [2, 0, 0] }],
      solver: { ...document.source.solver, maxSteps: 100, maxTime: 1, maxArcLength: 10 } });
    const result = integrateVectorField3DScientificTrajectories(seeded, manifestJson, fingerprint, volumes);
    expect(result.trajectories[0]!.points.length).toBeGreaterThan(1);
    expect(result.trajectories[0]!.stopReason).toMatch(/time-limit|step-limit|boundary/);
    expect(result.source.structuralHash).toBe(seeded.identity.structuralHash);
    expect(() => integrateVectorField3DScientificTrajectories(seeded, manifestJson, fingerprint,
      [volumes[0], { ...volumes[1], sampleSha256: "0".repeat(64) }, volumes[2]])).toThrow(/checksum/);
  });

  it("interpolates a verified field using unequal axis spacings in world coordinates", () => {
    const shape = [3, 3, 3] as const;
    const encoded = (values: number[]) => {
      const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
      values.forEach((value, index) => view.setFloat64(index * 8, value, true));
      return bytes;
    };
    const manifest = JSON.parse(manifestJson);
    manifest.sceneId = "unequal-axis-regression";
    manifest.datasets[0].shape = shape;
    manifest.coordinates[0].origin = [-20, 10, -1];
    manifest.coordinates[0].spacing = [20, 2, .25];
    // Last axis varies fastest: j is the middle-axis index.
    const values = names.map((_, component) => Array.from({ length: 27 }, (_, index) =>
      component === 0 ? 10 + 2 * (Math.floor(index / 3) % 3) : 0));
    manifest.resources.forEach((resource: { sha256: string; count: number; bytes: number }, index: number) => {
      resource.count = 27; resource.bytes = 27 * 8;
      resource.sha256 = sha256Checksum(encoded(values[index]!)).slice(7);
    });
    const json = JSON.stringify(manifest);
    const hash = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const refs = names.map(name => createGraph2DFieldReference(json, hash, locator, "field", name)) as typeof references;
    const unequal = createVectorField3DDocument({ ...source,
      axes: [{ role: "x", label: "x", unit: "m", min: -20, max: 20 },
        { role: "y", label: "y", unit: "m", min: 10, max: 14 },
        { role: "z", label: "z", unit: "m", min: -1, max: -.5 }],
      field: { kind: "scientific-bundle", references: refs,
        componentUnits: ["m/s", "m/s", "m/s"] },
      seeds: [{ id: "between-rows", position: [0, 11.5, -.75] }],
      solver: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9,
        maxSteps: 100, maxTime: .1, maxArcLength: 10 },
    }, { stableKey: "unequal-axis-regression" });
    const transfer = names.map((component, index) => ({ fingerprint: hash, datasetId: "field", component,
      sourceShape: shape, sampleShape: shape, resourceSha256: refs[index]!.resourceSha256,
      sampleSha256: sha256Checksum(encoded(values[index]!)).slice(7), values: values[index]! })) as
      [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];
    const path = integrateVectorField3DScientificTrajectories(unequal, json, hash, transfer).trajectories[0]!;
    expect(path.stopReason).toBe("time-limit");
    expect(path.points.at(-1)?.position[0]).toBeCloseTo(1.15, 7);
    expect(path.points.at(-1)?.position[1]).toBe(11.5);
    expect(path.points.at(-1)?.position[2]).toBe(-.75);
    expect(path.points.at(-1)?.time).toBeCloseTo(.1, 8);
  });

  it("uses the actual nonuniform decimated positions when a source axis exceeds the transfer cap", () => {
    const shape = [34, 2, 2] as const, sampleShape = [32, 2, 2] as const;
    const encoded = (values: number[]) => {
      const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
      values.forEach((value, index) => view.setFloat64(index * 8, value, true));
      return bytes;
    };
    const manifest = JSON.parse(manifestJson);
    manifest.sceneId = "decimated-axis-regression";
    manifest.datasets[0].shape = shape;
    manifest.coordinates[0].origin = [0, 0, 0];
    manifest.coordinates[0].spacing = [1, 2, .5];
    const sourceValues = names.map((_, component) => Array.from({ length: 34 * 2 * 2 }, (_, index) =>
      component === 0 ? Math.floor(index / 4) : 0));
    const sampledValues = names.map((_, component) => Array.from({ length: 32 * 2 * 2 }, (_, index) =>
      component === 0 ? Math.round(Math.floor(index / 4) * 33 / 31) : 0));
    manifest.resources.forEach((resource: { sha256: string; count: number; bytes: number }, index: number) => {
      resource.count = sourceValues[index]!.length; resource.bytes = resource.count * 8;
      resource.sha256 = sha256Checksum(encoded(sourceValues[index]!)).slice(7);
    });
    const json = JSON.stringify(manifest), hash = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const refs = names.map(name => createGraph2DFieldReference(json, hash, locator, "field", name)) as typeof references;
    const decimated = createVectorField3DDocument({ ...source,
      axes: [{ role: "x", label: "x", unit: "m", min: 0, max: 33 },
        { role: "y", label: "y", unit: "m", min: 0, max: 2 },
        { role: "z", label: "z", unit: "m", min: 0, max: .5 }],
      field: { kind: "scientific-bundle", references: refs,
        componentUnits: ["m/s", "m/s", "m/s"] },
      seeds: [{ id: "between-samples", position: [16.5, 1, .25] }],
      solver: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9,
        maxSteps: 200, maxTime: .1, maxArcLength: 10 },
    }, { stableKey: "decimated-axis-regression" });
    const transfer = names.map((component, index) => ({ fingerprint: hash, datasetId: "field", component,
      sourceShape: shape, sampleShape, resourceSha256: refs[index]!.resourceSha256,
      sampleSha256: sha256Checksum(encoded(sampledValues[index]!)).slice(7),
      values: sampledValues[index]! })) as
      [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];
    const path = integrateVectorField3DScientificTrajectories(decimated, json, hash, transfer).trajectories[0]!;
    expect(path.stopReason).toBe("time-limit");
    expect(path.points.at(-1)?.position[0]).toBeCloseTo(16.5 * Math.exp(.1), 4);
    expect(path.points.at(-1)?.position[1]).toBe(1);
    expect(path.points.at(-1)?.position[2]).toBe(.25);
  });
});
