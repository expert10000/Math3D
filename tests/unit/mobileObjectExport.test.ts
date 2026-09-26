import { describe, expect, it } from "vitest";
import { deserializeSceneObjectEnvelope, type SceneDocument } from "@math3d/core";
import {
  MOBILE_DERIVED_MESH_SEMANTICS_WARNING,
  prepareMobileDerivedMeshExport,
  prepareMobileSemanticObjectExport,
  validateMobileSemanticObjectArtifact,
} from "../../apps/mobile/src/models/mobileObjectExport";
import { prepareMobileMeshImport } from "../../apps/mobile/src/models/mobileMeshImport";

const scene: SceneDocument = {
  id: "project/export",
  title: "Object export",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{
    id: "wave-surface",
    kind: "explicit",
    expression: "sin(x) * cos(y)",
    domain: { xSpan: 3, ySpan: 4 },
    resolution: 48,
  }],
};

const mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint16Array([0, 1, 2]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  vertexCount: 3,
  triCount: 1,
};

describe("mobile object export", () => {
  it("serializes, validates, and reads back a semantic Math3D object", () => {
    const artifact = prepareMobileSemanticObjectExport({
      scene,
      objectId: "wave-surface",
      visible: false,
      opacity: 0.5,
      now: Date.UTC(2026, 8, 26, 12, 30, 0),
    });
    const envelope = validateMobileSemanticObjectArtifact(artifact);
    expect(artifact).toMatchObject({ semantic: true, mimeType: "application/json", formatLabel: "Math3D object" });
    expect(artifact.fileName).toMatch(/^wave-surface-semantic-20260926-123000Z-[0-9a-f]{12}\.math3d-object\.json$/);
    expect(envelope).toMatchObject({
      object: {
        id: "wave-surface",
        kind: "explicit",
        definition: scene.surfaces![0],
        visible: false,
        style: { opacity: 0.5 },
      },
      provenance: { sourceFormat: "math3d.scene-project", sourceProjectId: scene.id, sourceObjectId: "wave-surface" },
    });
    expect(deserializeSceneObjectEnvelope(artifact.content)).toMatchObject({ ok: true, value: { contentHash: envelope.contentHash } });
  });

  it("uses timestamp and content hash components to avoid ambiguous file names", () => {
    const first = prepareMobileSemanticObjectExport({ scene, objectId: "wave-surface", visible: true, now: 1_000 });
    const second = prepareMobileSemanticObjectExport({ scene, objectId: "wave-surface", visible: true, now: 2_000 });
    expect(first.fileName).not.toBe(second.fileName);
    expect(first.fileName).not.toContain("/");
  });

  it.each(["obj", "ply", "stl"] as const)("exports a bounded %s mesh accepted by the mobile importer", (format) => {
    const artifact = prepareMobileDerivedMeshExport({
      scene,
      objectId: "wave-surface",
      visible: true,
      mesh,
      now: Date.UTC(2026, 8, 26, 12, 30, 0),
    }, format);
    expect(artifact).toMatchObject({ semantic: false, formatLabel: format.toUpperCase() });
    expect(artifact.fileName).toMatch(new RegExp(`^wave-surface-${format}-20260926-123000Z-[0-9a-f]{12}\\.${format}$`));
    const imported = prepareMobileMeshImport({
      sourceName: artifact.fileName,
      bytes: new TextEncoder().encode(artifact.content),
    }, { ...scene, surfaces: [] }, "balanced");
    expect(imported).toMatchObject({ status: "ready", preview: { sourceVertexCount: 3, sourceTriangleCount: 1 } });
  });

  it("requires explicit semantics-loss confirmation copy for mesh-only formats", () => {
    expect(MOBILE_DERIVED_MESH_SEMANTICS_WARNING).toContain("formula");
    expect(MOBILE_DERIVED_MESH_SEMANTICS_WARNING).toContain("provenance");
  });

  it("rejects invalid mesh indices before creating an artifact", () => {
    expect(() => prepareMobileDerivedMeshExport({
      scene,
      objectId: "wave-surface",
      visible: true,
      mesh: { ...mesh, indices: new Uint16Array([0, 1, 9]) },
    }, "obj")).toThrow(/invalid mesh index/i);
  });
});
