import { describe, expect, it } from "vitest";
import {
  SCENE_DOCUMENT_FIELD_POLICY,
  advanceDocumentIdentity,
  canonicalJsonStringify,
  createDocumentIdentity,
  createSceneProjectDocument,
  createStableDocumentId,
  defineDocumentFieldPolicy,
  deserializeSceneProject,
  isDocumentIdentity,
  selectPersistentDocumentFields,
  selectStructuralDocumentFields,
  serializeSceneProject,
  structuralDocumentHash,
  structuralHash,
  validateSceneDocument,
  type SceneDocument,
} from "@math3d/core";

const asRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;

describe("shared document identity and structural hashes", () => {
  it("canonicalizes recursively and produces a reviewed SHA-256 fingerprint", () => {
    const left = { b: 2, nested: { z: true, a: [3, 2, 1] }, a: 1 };
    const right = { a: 1, nested: { a: [3, 2, 1], z: true }, b: 2 };

    expect(canonicalJsonStringify(left)).toBe(
      '{"a":1,"b":2,"nested":{"a":[3,2,1],"z":true}}'
    );
    expect(structuralHash(left)).toBe(structuralHash(right));
    expect(structuralHash({ b: 2, a: 1 })).toBe(
      "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777"
    );
    expect(structuralHash({ a: 1, b: 3 })).not.toBe(structuralHash(left));
  });

  it("rejects values that cannot be canonical persistent JSON", () => {
    expect(() => canonicalJsonStringify({ value: Number.NaN })).toThrow(/finite JSON numbers/);
    expect(() => canonicalJsonStringify({ value: undefined })).toThrow(/unsupported JSON value/);
    expect(() => canonicalJsonStringify(new Date(0))).toThrow(/plain JSON objects/);
    expect(() => canonicalJsonStringify(Array(2))).toThrow(/dense JSON array/);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJsonStringify(cyclic)).toThrow(/circular reference/);
  });

  it("derives stable IDs from stable keys without time or random dependencies", () => {
    const first = createStableDocumentId("topology", { importKey: "fixture/torus" });
    const second = createStableDocumentId("topology", { importKey: "fixture/torus" });
    const other = createStableDocumentId("topology", { importKey: "fixture/cylinder" });

    expect(first).toBe(second);
    expect(first).toMatch(/^math3d:topology:[0-9a-f]{32}$/);
    expect(other).not.toBe(first);
  });

  it("advances a monotonic revision only when mathematical source changes", () => {
    const id = createStableDocumentId("complex", { savedKey: "example-1" });
    const initial = createDocumentIdentity(id, { expression: "z^2", assumptions: [] }, 7);
    const unchanged = advanceDocumentIdentity(initial, { assumptions: [], expression: "z^2" });
    const changed = advanceDocumentIdentity(initial, { expression: "z^3", assumptions: [] });

    expect(unchanged).toBe(initial);
    expect(changed.id).toBe(initial.id);
    expect(changed.revision).toBe(8);
    expect(changed.structuralHash).not.toBe(initial.structuralHash);
    expect(isDocumentIdentity(changed)).toBe(true);
  });

  it("keeps persistent and transient display state outside the structural hash", () => {
    const policy = defineDocumentFieldPolicy({
      identity: "persistent-metadata",
      definition: "structural",
      assumptions: "structural",
      title: "persistent-metadata",
      camera: "persistent-display",
      hover: "transient-display",
    });
    const base = {
      definition: { expression: "sin(z)" },
      assumptions: ["principal branch"],
      title: "Sine",
      camera: { zoom: 1 },
      hover: { x: 10, y: 20 },
    };
    const viewChanged = {
      ...base,
      title: "Renamed",
      camera: { zoom: 4 },
      hover: { x: 90, y: 30 },
    };

    expect(structuralDocumentHash(base, policy)).toBe(structuralDocumentHash(viewChanged, policy));
    expect(
      structuralDocumentHash({ ...base, definition: { expression: "cos(z)" } }, policy)
    ).not.toBe(structuralDocumentHash(base, policy));
    expect(selectPersistentDocumentFields(base, policy)).toEqual({
      definition: base.definition,
      assumptions: base.assumptions,
      title: "Sine",
      camera: { zoom: 1 },
    });
    expect(() => structuralDocumentHash({ ...base, unclassified: true }, policy)).toThrow(
      /does not classify: unclassified/
    );
    expect(() => structuralDocumentHash({ ...base, toString: "not classified" }, policy)).toThrow(
      /does not classify: toString/
    );
  });

  it("reads legacy scenes unchanged and round-trips optional identity when explicitly saved", () => {
    const legacy: SceneDocument = {
      id: "scene-legacy",
      title: "Legacy scene",
      createdAt: 100,
      updatedAt: 200,
      geometry: { points: [{ x: 0, y: 0, z: 0 }] },
      cameras: [{
        id: "camera-1",
        name: "Default",
        position: { x: 1, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
      }],
      activeCameraId: "camera-1",
    };
    const legacySerialized = serializeSceneProject(createSceneProjectDocument(legacy));
    const legacyLoaded = deserializeSceneProject(legacySerialized);
    expect(legacyLoaded.ok).toBe(true);
    if (!legacyLoaded.ok) return;
    expect(legacyLoaded.value.scene).toEqual(legacy);
    expect(legacyLoaded.value.scene.identity).toBeUndefined();

    const source = selectStructuralDocumentFields(asRecord(legacy), SCENE_DOCUMENT_FIELD_POLICY);
    const identity = createDocumentIdentity(
      createStableDocumentId("scene", { persistentKey: legacy.id }),
      source
    );
    const versioned: SceneDocument = { ...legacy, identity };
    const versionedLoaded = deserializeSceneProject(
      serializeSceneProject(createSceneProjectDocument(versioned))
    );
    expect(versionedLoaded.ok && versionedLoaded.value.scene.identity).toEqual(identity);
    expect(validateSceneDocument({ ...legacy, identity: { ...identity, revision: 0 } }).ok).toBe(false);
  });

  it("classifies current scene fields so camera-only edits cannot invalidate mathematics", () => {
    const base: SceneDocument = {
      id: "scene-1",
      title: "Surface",
      createdAt: 1,
      updatedAt: 1,
      surfaces: [{ id: "surface-1", kind: "explicit", expression: "x^2+y^2" }],
      cameras: [{
        id: "camera-1",
        name: "Front",
        position: { x: 0, y: 0, z: 5 },
        target: { x: 0, y: 0, z: 0 },
      }],
      activeCameraId: "camera-1",
    };
    const viewChanged: SceneDocument = {
      ...base,
      title: "Presentation title",
      updatedAt: 99,
      cameras: [{
        id: "camera-2",
        name: "Side",
        position: { x: 5, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 0 },
      }],
      activeCameraId: "camera-2",
    };

    expect(structuralDocumentHash(asRecord(base), SCENE_DOCUMENT_FIELD_POLICY)).toBe(
      structuralDocumentHash(asRecord(viewChanged), SCENE_DOCUMENT_FIELD_POLICY)
    );
    expect(
      structuralDocumentHash(
        asRecord({
          ...base,
          surfaces: [{ id: "surface-1", kind: "explicit", expression: "x^2-y^2" }],
        }),
        SCENE_DOCUMENT_FIELD_POLICY
      )
    ).not.toBe(structuralDocumentHash(asRecord(base), SCENE_DOCUMENT_FIELD_POLICY));
  });
});
