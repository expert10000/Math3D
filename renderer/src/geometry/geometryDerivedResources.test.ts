import { describe, expect, it } from "vitest";
import {
  createDocumentIdentity,
  createStableDocumentId,
  geometryDocumentFromSceneDocument,
  type CanonicalJsonValue,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { GeometryDocumentAdapter } from "./geometryDocumentAdapter";
import { GeometryDerivedResourceCoordinator, type GeometryDerivedComputation } from "./geometryDerivedResources";

const adapter = () => new GeometryDocumentAdapter(geometryDocumentFromSceneDocument({
  id: "scene:gk06", title: "GK06", createdAt: 1, updatedAt: 1,
  objects: [{
    id: "sphere-a", type: "sphere", params: { radius: 2 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    visible: true, material: { color: 0x3366ff }, name: "Sphere A",
  }],
}));

const meshTarget = (): ScientificSourceGeneration => {
  const identity = createDocumentIdentity(createStableDocumentId("mesh", { fixture: "gk06" }), { artifact: "mesh" });
  return { documentId: identity.id, revision: identity.revision, structuralHash: identity.structuralHash, generation: 1 };
};

const computation = (): GeometryDerivedComputation => ({
  status: "numerical",
  algorithm: "adaptive surface tessellation",
  algorithmVersion: "2.1",
  engine: { name: "Math3D geometry worker", version: "1.5.0" },
  elapsedMs: 12,
  numericContext: { tolerance: { absolute: 1e-6, relative: 1e-8 }, precision: { binaryBits: 64 } },
  summary: { vertices: 4, faces: 2 },
  artifacts: [{ kind: "mesh", role: "geometry-derived-mesh", encoding: "application/x-math3d-mesh", bytes: Uint8Array.from([1, 2, 3, 4]) }],
  promotedTarget: meshTarget(),
  locateBack: { "mesh:face:0": "geometry:sphere-a:surface" },
});

describe("GK06 Geometry derived resources", () => {
  it("publishes revision-safe provenance, artifact bytes, lineage, and locate-back", async () => {
    const sourceAdapter = adapter();
    const coordinator = new GeometryDerivedResourceCoordinator(sourceAdapter, [{ operationType: "geometry.tessellate", execute: () => computation() }]);
    const outcome = await coordinator.submit("geometry.tessellate", { objectId: "sphere-a", quality: "full" });
    expect("result" in outcome).toBe(true);
    if (!("result" in outcome)) return;
    expect(outcome.result).toMatchObject({
      status: "numerical",
      provenance: {
        source: coordinator.source(),
        operation: { type: "geometry.tessellate", algorithm: "adaptive surface tessellation", algorithmVersion: "2.1", parameters: { objectId: "sphere-a", quality: "full" } },
        engine: { name: "Math3D geometry worker", version: "1.5.0" },
        numericContext: { tolerance: { absolute: 1e-6, relative: 1e-8 }, precision: { binaryBits: 64 } },
      },
      summary: { vertices: 4, faces: 2 },
      artifacts: [{ kind: "mesh", role: "geometry-derived-mesh" }],
    });
    expect(JSON.stringify(outcome.result)).not.toContain("1,2,3,4");
    const resolved = coordinator.artifactRegistry().resolve(outcome.result.artifacts[0]!, coordinator.source());
    expect(resolved.ok && [...resolved.bytes]).toEqual([1, 2, 3, 4]);
    expect(outcome.relations.map((entry) => entry.kind).sort()).toEqual(["analysis-of", "generated-by", "promoted-from"]);
    expect(coordinator.locateGeometrySource("mesh:face:0")).toBe("geometry:sphere-a:surface");
  });

  it("rejects late worker output after the Geometry revision changes", async () => {
    const sourceAdapter = adapter();
    let release!: (value: GeometryDerivedComputation) => void;
    const deferred = new Promise<GeometryDerivedComputation>((resolve) => { release = resolve; });
    const coordinator = new GeometryDerivedResourceCoordinator(sourceAdapter, [{ operationType: "geometry.section", execute: () => deferred }]);
    const pending = coordinator.submit("geometry.section", { plane: "xy" });
    await Promise.resolve();
    sourceAdapter.commitSource({ ...sourceAdapter.document().source, parameters: { sectionOffset: 1 } });
    release({ ...computation(), promotedTarget: undefined, locateBack: undefined });
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, code: "stale-source" });
    expect(coordinator.results()).toEqual([]);
    expect(coordinator.artifactRegistry().listMetadata()).toEqual([]);
  });

  it("keeps bounded exact measurements synchronous with explicit authority reason", () => {
    const coordinator = new GeometryDerivedResourceCoordinator(adapter(), []);
    const publication = coordinator.publishBoundedExactMeasurement({
      resultId: "geometry/exact/distance-1",
      operationType: "geometry.measure.distance",
      algorithm: "euclidean-distance",
      parameters: { a: [0, 0, 0], b: [3, 4, 0] } as CanonicalJsonValue as Record<string, CanonicalJsonValue>,
      summary: { distance: 5 },
      elapsedMs: 0,
    });
    expect(publication.result).toMatchObject({ status: "exact", summary: { distance: 5, authorityReason: expect.stringContaining("bounded exact O(1)") } });
    expect(publication.result.artifacts).toEqual([]);
    expect(publication.relations[0]).toMatchObject({ kind: "analysis-of", status: "current" });
  });

  it("marks already-published outputs stale after a source edit", async () => {
    const sourceAdapter = adapter();
    const coordinator = new GeometryDerivedResourceCoordinator(sourceAdapter, [{ operationType: "geometry.diagnostics", execute: () => ({ ...computation(), artifacts: [], promotedTarget: undefined, locateBack: undefined }) }]);
    const outcome = await coordinator.submit("geometry.diagnostics", { objectId: "sphere-a" });
    if (!("result" in outcome)) throw new Error("Expected publication");
    expect(coordinator.isCurrent(outcome.result)).toBe(true);
    sourceAdapter.commitSource({ ...sourceAdapter.document().source, parameters: { changed: true } });
    expect(coordinator.isCurrent(outcome.result)).toBe(false);
  });
});
