import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  sampleVectorField3DScientificArrows, sha256Checksum, verifyVectorField3DVolumes,
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
});
