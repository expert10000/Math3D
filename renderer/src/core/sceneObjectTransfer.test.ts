import { describe, expect, it } from "vitest";
import validExplicit from "../../../packages/core/fixtures/scene-object/valid-explicit-v1.json";
import legacyExplicit from "../../../packages/core/fixtures/scene-object/legacy-explicit-v0.json";
import futureVersion from "../../../packages/core/fixtures/scene-object/invalid-future-version.json";
import externalDependency from "../../../packages/core/fixtures/scene-object/invalid-external-dependency.json";
import invalidContentHash from "../../../packages/core/fixtures/scene-object/invalid-content-hash.json";
import {
  SCENE_OBJECT_SUPPORTED_KINDS,
  createSceneObjectEnvelope,
  deserializeSceneObjectEnvelope,
  serializeSceneObjectEnvelope,
  structuralHash,
  validateSceneObjectEnvelope,
  type SceneObjectEnvelopeInput,
} from "@math3d/core";

const input = (expression = "x*x-y*y"): SceneObjectEnvelopeInput => ({
  producer: { name: "Math3D", version: "1.5.1", platform: "desktop" },
  object: {
    id: "surface-saddle",
    kind: "explicit",
    definition: { id: "surface-saddle", kind: "explicit", expression, domain: { xSpan: 2, ySpan: 2 }, resolution: 64 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    visible: true,
    style: { color: "#3366cc", opacity: 0.9 },
  },
  geometry: null,
  provenance: { sourceFormat: "math3d.scene-project", sourceProjectId: "project-saddle", sourceObjectId: "surface-saddle", importedAt: null },
  analysisMetadata: { compatible: true, analysisKind: "curvature" },
});

describe("semantic scene-object transfer contract", () => {
  it("accepts the reviewed v1 fixture and serializes it canonically", () => {
    const result = deserializeSceneObjectEnvelope(JSON.stringify(validExplicit));
    expect(result).toMatchObject({ ok: true, migrated: false, sourceVersion: 1 });
    if (!result.ok) return;
    const serialized = serializeSceneObjectEnvelope(result.value);
    const reparsed = deserializeSceneObjectEnvelope(serialized);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(serializeSceneObjectEnvelope(reparsed.value)).toBe(serialized);
    expect(serialized.startsWith('{"analysisMetadata"')).toBe(true);
  });

  it("computes deterministic content hashes from semantic content only", () => {
    const first = createSceneObjectEnvelope(input());
    const reordered = createSceneObjectEnvelope({
      ...input(),
      producer: { platform: "desktop", version: "1.5.1", name: "Math3D" },
      analysisMetadata: { analysisKind: "curvature", compatible: true },
    });
    expect(first.contentHash).toBe(reordered.contentHash);
    expect(first.contentHash).toBe(validExplicit.contentHash);
    expect(createSceneObjectEnvelope(input("x*x+y*y")).contentHash).not.toBe(first.contentHash);
    expect(first.contentHash).toBe(structuralHash({
      analysisMetadata: first.analysisMetadata,
      geometry: first.geometry,
      object: first.object,
    }));
  });

  it("migrates the v0 semantic fixture with explicit limited defaults", () => {
    const result = deserializeSceneObjectEnvelope(JSON.stringify(legacyExplicit));
    expect(result).toMatchObject({
      ok: true,
      migrated: true,
      sourceVersion: 0,
      value: {
        version: 1,
        object: { id: "legacy-graph", kind: "explicit", visible: true },
        geometry: null,
        provenance: { sourceProjectId: "legacy-project", importedAt: null },
      },
    });
  });

  it("supports bounded embedded mesh data and declared computed-result references", () => {
    const embedded = createSceneObjectEnvelope({
      ...input(),
      object: {
        ...input().object,
        id: "mesh-1",
        kind: "mesh",
        definition: { id: "mesh-1", kind: "mesh", source: "math3d-object:embedded" },
      },
      geometry: { kind: "embedded-mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    });
    expect(validateSceneObjectEnvelope(embedded).ok).toBe(true);

    const referenced = createSceneObjectEnvelope({
      ...input(),
      object: {
        ...input().object,
        id: "implicit-1",
        kind: "implicit",
        definition: { id: "implicit-1", kind: "implicit", expression: "x*x+y*y+z*z-1" },
      },
      geometry: { kind: "computed-result-reference", resultId: "vtk-result:1", contentHash: structuralHash({ mesh: 1 }) },
    });
    expect(validateSceneObjectEnvelope(referenced).ok).toBe(true);
  });

  it("rejects future versions, external dependencies, tampering, and invalid mesh indices", () => {
    expect(deserializeSceneObjectEnvelope(JSON.stringify(futureVersion))).toMatchObject({ ok: false, errors: [expect.stringContaining("version")] });
    expect(deserializeSceneObjectEnvelope(JSON.stringify(externalDependency))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("external URI")]) });
    expect(deserializeSceneObjectEnvelope(JSON.stringify(invalidContentHash))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("contentHash")]) });
    expect(() => createSceneObjectEnvelope({
      ...input(),
      object: { ...input().object, id: "mesh-bad", kind: "mesh", definition: { id: "mesh-bad", kind: "mesh", source: "math3d-object:embedded" } },
      geometry: { kind: "embedded-mesh", positions: [0, 0, 0], indices: [0, 1, 2] },
    })).toThrow(/invalid vertex index/);
  });

  it("documents the supported kinds and rejects undeclared dependency fields", () => {
    expect(SCENE_OBJECT_SUPPORTED_KINDS).toEqual(["explicit", "parametric", "implicit", "weierstrass", "mesh"]);
    const envelope = createSceneObjectEnvelope(input());
    expect(validateSceneObjectEnvelope({ ...envelope, dependencies: [{ uri: "https://example.test/mesh.bin" }] })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("unsupported fields")]),
    });
  });
});
