import { describe, expect, it, vi } from "vitest";
import { createCanonicalNormalizationCache } from "../../../packages/core/src/canonicalNormalizationCache";
import { canonicalJsonStringify, createEmptyGraph2DDocument, createGraph2DWorkspaceProject,
  createMath3DProject, normalizeGraph2DDocument, normalizeMath3DProject,
  normalizeVectorField3DDocument, createVectorField3DDocument, vectorField3DExpression,
  structuralHash, sha256Checksum, type VectorField3DSource } from "@math3d/core";

describe("content-keyed normalization reuse", () => {
  it("validates equal content once while returning detached snapshots", () => {
    const validate = vi.fn((value: unknown) => ({ ok: true as const, value: structuredClone(value) }));
    const normalize = createCanonicalNormalizationCache(validate);
    const input = { source: { a: [1, 2] } };
    const first = normalize(input);
    const second = normalize({ source: { a: [1, 2] } });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    if (!first.ok) throw Error("expected success");
    (first.value as typeof input).source.a[0] = 99;
    expect(normalize(input)).toEqual({ ok: true, value: input });
    expect(validate).toHaveBeenCalledTimes(1);
  });
  it("revalidates in-place and shallow-frozen nested mutations", () => {
    const validate = vi.fn((value: unknown) => ({ ok: true as const, value: structuredClone(value) }));
    const normalize = createCanonicalNormalizationCache(validate);
    const input = Object.freeze({ nested: { value: 1 } });
    normalize(input);
    input.nested.value = 2;
    expect(normalize(input)).toEqual({ ok: true, value: input });
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it("does not retain failures or bypass invalid JSON checks", () => {
    const validate = vi.fn(() => ({ ok: false as const, errors: ["invalid"] }));
    const normalize = createCanonicalNormalizationCache(validate);
    normalize({ value: 1 }); normalize({ value: 1 });
    expect(validate).toHaveBeenCalledTimes(2);
    expect(normalize({ value: undefined }).ok).toBe(false);
    expect(validate).toHaveBeenCalledTimes(3);
  });
  it("bounds retention by content size and entry count", () => {
    const validate = vi.fn((value: unknown) => ({ ok: true as const, value }));
    const normalize = createCanonicalNormalizationCache(validate, 100, 1);
    normalize("a"); normalize("b"); normalize("a");
    expect(validate).toHaveBeenCalledTimes(3);
    normalize("x".repeat(100)); normalize("x".repeat(100));
    expect(validate).toHaveBeenCalledTimes(5);
    normalize("a");
    expect(validate).toHaveBeenCalledTimes(5);
  });
  it("preserves the reviewed structural hash and rechecks mutable byte buffers", () => {
    expect(structuralHash({ b: 2, a: 1 })).toBe("sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
    const bytes = new TextEncoder().encode("abc"), before = sha256Checksum(bytes);
    expect(before).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    bytes[0] = 100;
    expect(sha256Checksum(bytes)).not.toBe(before);
  });
  it("Graph2D cached success cannot hide source tampering or returned-object mutation", () => {
    const doc = createEmptyGraph2DDocument("cache-graph");
    const bytes = canonicalJsonStringify(doc);
    const first = normalizeGraph2DDocument(JSON.parse(bytes));
    expect(first).toEqual({ ok: true, value: doc });
    if (!first.ok) throw Error("expected graph");
    (first.value.metadata as { title: string }).title = "poison";
    expect(normalizeGraph2DDocument(JSON.parse(bytes))).toEqual({ ok: true, value: doc });
    const changed = JSON.parse(bytes);
    changed.source.assumptions.push("x > 0");
    expect(normalizeGraph2DDocument(changed).ok).toBe(false);
  });
  it("Project snapshots retain identities, detach nested data and reject forged generations", () => {
    const project = createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("cache-project")),
      { stableKey: "cache-project" });
    const bytes = canonicalJsonStringify(project);
    const first = normalizeMath3DProject(JSON.parse(bytes));
    expect(first).toEqual({ ok: true, value: project });
    if (!first.ok) throw Error("expected project");
    (first.value.workspace.activeDocumentIds as string[]).splice(0);
    const again = normalizeMath3DProject(JSON.parse(bytes));
    expect(again).toEqual({ ok: true, value: project });
    const changed = JSON.parse(bytes);
    changed.workspace.activeDocumentIds = [];
    expect(normalizeMath3DProject(changed).ok).toBe(false);
    changed.identity.structuralHash = structuralHash(changed.workspace);
    expect(normalizeMath3DProject(changed).ok).toBe(true);
    changed.workspace.entries[0].checkpoint.source.assumptions.push("x > 0");
    expect(normalizeMath3DProject(changed).ok).toBe(false);
  });
  it("3D field snapshots preserve workspace defaults and reject changed nested sources", () => {
    const axes = ["x", "y", "z"].map(role => ({ role, label: role, unit: "m", min: -1, max: 1 }));
    const source = { axes, timeUnit: "s", field: { kind: "expressions", components:
      ["1", "0", "0"].map(value => vectorField3DExpression(value, "m/s")) },
      seeds: [{ id: "center", position: [0, 0, 0] }],
      display: { density: [3, 3, 3], maxGlyphs: 27, magnitudeScale: 1, colorBy: "speed" },
      solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 } } as VectorField3DSource;
    const doc = createVectorField3DDocument(source, { stableKey: "cache-field" });
    const { workspace: _workspace, ...legacy } = doc;
    const first = normalizeVectorField3DDocument(legacy);
    expect(first).toEqual({ ok: true, value: doc });
    if (!first.ok) throw Error("expected vector field");
    (first.value.source.seeds[0].position as number[])[0] = 0.5;
    expect(normalizeVectorField3DDocument(legacy)).toEqual({ ok: true, value: doc });
    const changed = structuredClone(doc);
    (changed.source.seeds[0].position as number[])[0] = 0.25;
    expect(normalizeVectorField3DDocument(changed).ok).toBe(false);
  });
});
