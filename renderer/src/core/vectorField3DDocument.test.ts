import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, normalizeVectorField3DDocument,
  parseVectorField3DDocument, reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  sampleVectorField3DArrows, serializeVectorField3DDocument,
  vectorField3DExpression, type Graph2DFieldReference, type VectorField3DSource } from "@math3d/core";

const axes = [
  { role: "x", label: "x", unit: "m", min: -1, max: 1 },
  { role: "y", label: "y", unit: "m", min: -1, max: 1 },
  { role: "z", label: "z", unit: "m", min: -1, max: 1 },
] as const;
const source = (p = "1", q = "0", r = "0"): VectorField3DSource => ({
  axes, timeUnit: "s", field: { kind: "expressions", components: [
    vectorField3DExpression(p, "m/s"), vectorField3DExpression(q, "m/s"),
    vectorField3DExpression(r, "m/s") ] },
  seeds: [{ id: "center", position: [0, 0, 0] }],
  display: { density: [3, 3, 3], maxGlyphs: 27, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 },
});
const document = (p?: string, q?: string, r?: string) =>
  createVectorField3DDocument(source(p, q, r), { stableKey: ["vector-test", p ?? "1", q ?? "0", r ?? "0"] });

describe("GRA-14 separate 3D vector-field document and deterministic arrow artifacts", () => {
  it("round-trips a cross-layer physical point without changing source identity", () => {
    const original = document();
    const linked = reviseVectorField3DWorkspace(original, { ...original.workspace!,
      linkedProbe: { point: [0.25, 0.5, 3], units: ["m", "m", "m"] } });
    expect(linked.identity).toEqual(original.identity);
    expect(parseVectorField3DDocument(serializeVectorField3DDocument(linked)).workspace?.linkedProbe)
      .toEqual({ point: [0.25, 0.5, 3], units: ["m", "m", "m"] });
    const legacy = JSON.parse(serializeVectorField3DDocument(original));
    delete legacy.workspace.linkedProbe;
    expect(normalizeVectorField3DDocument(legacy)).toMatchObject({ ok: true,
      value: { workspace: { linkedProbe: null } } });
  });
  it("round-trips a versioned constant field and samples camera-independent vectors", () => {
    const saved = document();
    const restored = parseVectorField3DDocument(serializeVectorField3DDocument(saved));
    expect(restored).toEqual(saved);
    expect(saved.identity.structuralHash).toMatch(/^sha256:/);
    const artifact = sampleVectorField3DArrows(restored);
    expect(artifact.source).toMatchObject({ documentId: saved.identity.id,
      revision: saved.identity.revision, structuralHash: saved.identity.structuralHash });
    expect(artifact).toMatchObject({ evaluated: 27, accepted: 27, rejected: 0, stationary: 0,
      density: [3, 3, 3], magnitudeScale: 1, colorBy: "speed",
      coordinateUnits: ["m", "m", "m"], componentUnits: ["m/s", "m/s", "m/s"], timeUnit: "s" });
    expect(artifact.arrows).toHaveLength(27);
    expect(artifact.arrows[0]).toEqual({ position: [-1, -1, -1], vector: [1, 0, 0],
      magnitude: 1, kind: "arrow" });
    expect(artifact.arrows.at(-1)?.position).toEqual([1, 1, 1]);
    expect(sampleVectorField3DArrows(restored)).toEqual(artifact);
  });

  it("samples a rotational field against independent endpoint and center references", () => {
    const artifact = sampleVectorField3DArrows(document("-y", "x", "0"));
    expect(artifact).toMatchObject({ evaluated: 27, accepted: 27, rejected: 0, stationary: 3 });
    const at = (x: number, y: number, z: number) => artifact.arrows.find(item =>
      item.position[0] === x && item.position[1] === y && item.position[2] === z);
    expect(at(1, 0, 0)).toMatchObject({ vector: [0, 1, 0], magnitude: 1, kind: "arrow" });
    expect(at(0, 1, 0)).toMatchObject({ vector: [-1, 0, 0], magnitude: 1, kind: "arrow" });
    expect(at(0, 0, 0)).toMatchObject({ vector: [0, 0, 0], kind: "stationary" });
  });

  it("advances source identity on revision and binds derived samples to that revision", () => {
    const first = document();
    const second = reviseVectorField3DDocument(first, source("-y", "x", "0"));
    expect(second.identity.id).toBe(first.identity.id);
    expect(second.identity.revision).toBe(first.identity.revision + 1);
    expect(second.identity.structuralHash).not.toBe(first.identity.structuralHash);
    expect(sampleVectorField3DArrows(second).source.structuralHash).toBe(second.identity.structuralHash);
    expect(reviseVectorField3DDocument(second, second.source)).toEqual(second);
  });

  it("rejects invalid coordinates, units, edited AST and glyph-budget overrun", () => {
    expect(() => createVectorField3DDocument({ ...source(), axes: [axes[1], axes[0], axes[2]] },
      { stableKey: "reordered" })).toThrow(/Invalid 3D vector-field/);
    expect(() => createVectorField3DDocument({ ...source(), seeds: [{ id: "outside", position: [2, 0, 0] }] },
      { stableKey: "outside" })).toThrow(/Invalid 3D vector-field/);
    const mismatch = source();
    if (mismatch.field.kind !== "expressions") throw new Error("Expected expressions");
    expect(() => createVectorField3DDocument({ ...mismatch, field: { kind: "expressions",
      components: [{ ...mismatch.field.components[0], unit: "kg/s" }, ...mismatch.field.components.slice(1)] as
        unknown as typeof mismatch.field.components } }, { stableKey: "bad-unit" })).toThrow(/Invalid 3D vector-field/);
    const saved = document();
    const changed = { ...saved, source: { ...saved.source, display: { ...saved.source.display, maxGlyphs: 8 } } };
    expect(normalizeVectorField3DDocument(changed).ok).toBe(false);
    const limited = createVectorField3DDocument(changed.source, { stableKey: "limited" });
    expect(() => sampleVectorField3DArrows(limited)).toThrow(/glyph budget/);
    const forged = JSON.parse(serializeVectorField3DDocument(saved));
    forged.source.field.components[0].source = "2";
    expect(normalizeVectorField3DDocument(forged).ok).toBe(false);
  });

  it("counts zero and undefined samples without inventing arrows", () => {
    expect(sampleVectorField3DArrows(document("0", "0", "0")))
      .toMatchObject({ evaluated: 27, accepted: 27, rejected: 0, stationary: 27 });
    const singular = sampleVectorField3DArrows(document("1/x", "0", "0"));
    expect(singular).toMatchObject({ evaluated: 27, accepted: 18, rejected: 9, stationary: 0 });
    expect(singular.arrows).toHaveLength(18);
  });

  it("validates complete 3D bundle metadata but refuses sampling without live reverification", () => {
    const fieldAxes = axes.map(axis => ({ name: axis.label, unit: axis.unit,
      origin: axis.min, spacing: 1, periodic: false }));
    const reference = (component: string, hash: string): Graph2DFieldReference => ({
      id: `field_${hash.slice(0, 24)}`, locator: { kind: "preset", value: "vortexFlow" },
      sceneFingerprint: "a".repeat(64), sceneId: "flow", datasetId: "velocity", component,
      semanticType: "vector-field", shape: [3, 3, 3], axes: fieldAxes,
      resourceSha256: hash,
    });
    const refs = [reference("vx", "b".repeat(64)), reference("vy", "c".repeat(64)),
      reference("vz", "d".repeat(64))] as const;
    const bundled = createVectorField3DDocument({ ...source(), field: { kind: "scientific-bundle",
      references: refs, componentUnits: ["m/s", "m/s", "m/s"] } }, { stableKey: "bundle" });
    expect(parseVectorField3DDocument(serializeVectorField3DDocument(bundled))).toEqual(bundled);
    expect(() => sampleVectorField3DArrows(bundled)).toThrow(/Reverify all three/);
    expect(() => createVectorField3DDocument({ ...source(), field: { kind: "scientific-bundle",
      references: [refs[0], refs[1], { ...refs[2], shape: [3, 4, 3] }],
      componentUnits: ["m/s", "m/s", "m/s"] } },
      { stableKey: "mismatch" })).toThrow(/Invalid 3D vector-field/);
    expect(() => createVectorField3DDocument({ ...source(), field: { kind: "scientific-bundle",
      references: refs, componentUnits: ["m/s", "kg/s", "m/s"] } },
      { stableKey: "unit-mismatch" })).toThrow(/Invalid 3D vector-field/);
  });
});
