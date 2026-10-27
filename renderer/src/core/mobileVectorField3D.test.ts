import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument, reviseVectorField3DDocument,
  sha256Checksum, vectorField3DExpression, type VectorField3DSource } from "@math3d/core";
import { mobileVectorField3DDisplayArrows, sampleMobileVectorField3DExpressions,
  verifyMobileVectorField3DBundle } from "../../../apps/mobile/src/models/mobileVectorField3D";
import { buildMobileVectorField3DGeometry } from "../../../apps/mobile/src/models/mobileVectorField3DGeometry";

const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url));
const file = (name: string) => new Uint8Array(readFileSync(`${directory}${name}`));
const manifestJson = new TextDecoder().decode(file("manifest.json"));
const fingerprint = sha256Checksum(file("manifest.json")).slice(7);
const names = ["east", "north", "up"] as const;
const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
  { kind: "preset", value: "vortexVolume" }, "field", name)) as
  [ReturnType<typeof createGraph2DFieldReference>, ReturnType<typeof createGraph2DFieldReference>,
    ReturnType<typeof createGraph2DFieldReference>];
const axes: VectorField3DSource["axes"] = [
  { role: "x", label: "x", unit: "m", min: -4, max: 4 },
  { role: "y", label: "y", unit: "m", min: -4, max: 4 },
  { role: "z", label: "z", unit: "m", min: -3, max: 3 },
];
const source: VectorField3DSource = { axes, timeUnit: "s",
  field: { kind: "scientific-bundle", references, componentUnits: ["m/s", "m/s", "m/s"] },
  seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 100, maxTime: 1 } };
const scientific = createVectorField3DDocument(source, { stableKey: "mobile-vector-verification" });
const files = new Map(["bundle.json", "manifest.json", "east.f64", "north.f64", "up.f64"]
  .map(name => [name, file(name)] as const));
const reader = (contents: ReadonlyMap<string, Uint8Array>) => async (name: string) => contents.get(name) ?? null;

describe("GRA-14 mobile read-only 3D vector viewer", () => {
  it("re-verifies the complete scientific bundle before publishing bounded arrows", async () => {
    const artifact = await verifyMobileVectorField3DBundle(scientific, reader(files));
    expect(artifact).toMatchObject({ evaluated: 125, accepted: 125, rejected: 0,
      componentUnits: ["m/s", "m/s", "m/s"] });
    expect(artifact.source.structuralHash).toBe(scientific.identity.structuralHash);
    expect(artifact.arrows[0]?.position).toEqual([-4, -4, -3]);
    expect(artifact.arrows.at(-1)?.position).toEqual([4, 4, 3]);
    const geometry = buildMobileVectorField3DGeometry(scientific, artifact);
    expect(geometry.shown).toBe(125);
    expect(geometry.positions.length).toBeLessThanOrEqual(125 * 18);
  });

  it("rejects missing, changed and mismatched sources without an artifact", async () => {
    const absentEnvelope = new Map(files); absentEnvelope.delete("bundle.json");
    await expect(verifyMobileVectorField3DBundle(scientific, reader(absentEnvelope))).rejects.toThrow(/missing/);
    const malformedEnvelope = new Map(files);
    malformedEnvelope.set("bundle.json", new TextEncoder().encode('{"schema":"scientific-scene-bundle/v1","manifest":7}'));
    await expect(verifyMobileVectorField3DBundle(scientific, reader(malformedEnvelope))).rejects.toThrow(/Invalid scientific bundle/);
    const missing = new Map(files); missing.delete("north.f64");
    await expect(verifyMobileVectorField3DBundle(scientific, reader(missing))).rejects.toThrow(/missing/);
    const changed = new Map(files), bytes = new Uint8Array(file("up.f64"));
    bytes[24] = bytes[24]! ^ 1; changed.set("up.f64", bytes);
    await expect(verifyMobileVectorField3DBundle(scientific, reader(changed))).rejects.toThrow(/changed|verification/);
    const manifestChanged = new Map(files), modifiedManifest = new Uint8Array(file("manifest.json"));
    modifiedManifest[40] = modifiedManifest[40]! ^ 1;
    manifestChanged.set("manifest.json", modifiedManifest);
    await expect(verifyMobileVectorField3DBundle(scientific, reader(manifestChanged))).rejects.toThrow(/manifest changed/);
    const revised = reviseVectorField3DDocument(scientific, { ...scientific.source,
      display: { ...scientific.source.display, magnitudeScale: 2 } });
    const current = await verifyMobileVectorField3DBundle(scientific, reader(files));
    expect(() => buildMobileVectorField3DGeometry(revised, current)).toThrow(/source revision/);
  });

  it("caps the display at 512 without changing the saved field or its source identity", () => {
    const expression = createVectorField3DDocument({ ...source,
      field: { kind: "expressions", components: [vectorField3DExpression("-y", "m/s"),
        vectorField3DExpression("x", "m/s"), vectorField3DExpression("0", "m/s")] },
      display: { density: [16, 16, 16], maxGlyphs: 4096, magnitudeScale: 1, colorBy: "speed" },
    }, { stableKey: "mobile-vector-cap" });
    const artifact = sampleMobileVectorField3DExpressions(expression);
    expect(artifact.evaluated).toBe(4096);
    expect(mobileVectorField3DDisplayArrows(artifact)).toHaveLength(512);
    expect(buildMobileVectorField3DGeometry(expression, artifact).shown).toBe(512);
    expect(artifact.source.structuralHash).toBe(expression.identity.structuralHash);
    expect(artifact.arrows).toHaveLength(4096);
  });
});
