import { describe, expect, it } from "vitest";
import {
  deserializeGeometryDocument,
  geometryDocumentFromSceneDocument,
  geometryDocumentToSceneDocument,
  serializeGeometryDocument,
  type CanonicalJsonValue,
  type GeometryDocument,
  type GeometryDocumentSource,
  type SceneDocument,
} from "@math3d/core";
import { runDomainAdapterConformance, type DomainAdapterConformanceFixture } from "@math3d/kernel";
import { GeometryDocumentAdapter } from "./geometryDocumentAdapter";

const legacyScene = (): SceneDocument => ({
  id: "scene:gk04",
  title: "Construction scene",
  createdAt: 100,
  updatedAt: 200,
  geometry: { points: [{ id: "point-a", x: 0, y: 0, z: 0 }] },
  objects: [{
    id: "box-a", type: "box", params: { width: 2, height: 3, depth: 4 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    visible: true, material: { color: 0x3366ff, opacity: 0.8 }, name: "Box A", group: "solids",
  }],
  surfaces: [{ id: "surface-a", kind: "explicit", expression: "x*x+y*y", resolution: 32 }],
  overlays: [{ id: "grid", kind: "grid", visible: true }],
  cameras: [{ id: "camera-main", name: "Main", position: { x: 4, y: 3, z: 5 }, target: { x: 0, y: 0, z: 0 } }],
  activeCameraId: "camera-main",
  metadata: { course: "geometry" },
  extensions: {
    "math3d.geometry.derivedConstructions.v1": [{ id: "midpoint-a", type: "midpoint", name: "M", sourceObjectIds: ["point-a", "box-a"], visible: true, createdAt: 150 }],
    "math3d.geometry.constructionRelationships.v1": [{ id: "relation-a", type: "coincident", sourceId: "point-a", targetId: "midpoint-a", enabled: true, createdAt: 160 }],
    "math3d.geometry.custom.v1": { exact: true },
  },
});

const editedSource = (source: GeometryDocumentSource): GeometryDocumentSource => ({
  ...source,
  parameters: { ...source.parameters, radius: 2 },
});

const fixture: DomainAdapterConformanceFixture<GeometryDocumentAdapter> = {
  name: "GeometryDocumentAdapter",
  create: () => new GeometryDocumentAdapter(geometryDocumentFromSceneDocument(legacyScene())),
  snapshot: (adapter) => {
    const document = adapter.document();
    const history = adapter.history();
    return {
      identity: document.identity,
      structuralState: document.source as unknown as CanonicalJsonValue,
      persistentState: document as unknown as CanonicalJsonValue,
      history: { undoDepth: history.undoDepth, redoDepth: history.redoDepth },
    };
  },
  preview: (adapter) => { adapter.previewSource(editedSource(adapter.document().source)); },
  commitStructuralEdit: (adapter) => { adapter.commitSource(editedSource(adapter.document().source)); },
  attemptInvalidEdit: (adapter) => {
    adapter.commitSource({ ...adapter.document().source, parameters: { bad: new Float32Array([1, 2]) as unknown as CanonicalJsonValue } });
  },
  undo: (adapter) => { adapter.undo(); },
  redo: (adapter) => { adapter.redo(); },
  replay: (adapter) => GeometryDocumentAdapter.restore(JSON.parse(JSON.stringify(adapter.exportReplay()))),
  reopen: (adapter) => {
    const loaded = deserializeGeometryDocument(serializeGeometryDocument(adapter.document()));
    if (!loaded.ok) throw new TypeError(loaded.errors.join(" "));
    return new GeometryDocumentAdapter(loaded.value);
  },
  queryIsolation: (adapter) => {
    const before = serializeGeometryDocument(adapter.document());
    try { (adapter.document().source.parameters as Record<string, CanonicalJsonValue>).query = true; } catch { /* immutable query */ }
    return serializeGeometryDocument(adapter.document()) === before;
  },
};

describe("GK04 GeometryDocument adapter", () => {
  it("passes the shared GK03 document conformance gate", async () => {
    const report = await runDomainAdapterConformance(fixture);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("separates mathematical source, metadata, persistent display, and transient viewer state", () => {
    const document = geometryDocumentFromSceneDocument(legacyScene());
    expect(document.source.objects[0]).toEqual(expect.objectContaining({ id: "box-a", type: "box", params: { width: 2, height: 3, depth: 4 } }));
    expect(document.source.objects[0]).not.toHaveProperty("material");
    expect(document.display.objects["box-a"]).toEqual({ name: "Box A", visible: true, material: { color: 0x3366ff, opacity: 0.8 }, group: "solids" });
    expect(document.source.constructions[0]).toMatchObject({ id: "midpoint-a", type: "midpoint", sourceObjectIds: ["point-a", "box-a"] });
    expect(document.source.relationships[0]).toMatchObject({ id: "relation-a", type: "coincident", enabled: true });
    expect(document.metadata).toMatchObject({ title: "Construction scene", custom: { course: "geometry" } });
    expect(document).not.toHaveProperty("hoveredEntityId");
    expect(document).not.toHaveProperty("cameraInteractionActive");
  });

  it("does not revise source identity for persistent display changes", () => {
    const adapter = fixture.create();
    const initial = adapter.document();
    adapter.commitDisplay({ ...initial.display, activeCameraId: null });
    expect(adapter.document().identity).toEqual(initial.identity);
    expect(adapter.history().undoDepth).toBe(1);
  });

  it("round-trips canonical and legacy documents without silently rewriting the opened legacy value", () => {
    const legacy = legacyScene();
    const untouched = JSON.stringify(legacy);
    const document = geometryDocumentFromSceneDocument(legacy);
    expect(JSON.stringify(legacy)).toBe(untouched);

    const reopened = deserializeGeometryDocument(serializeGeometryDocument(document));
    expect(reopened.ok).toBe(true);
    expect(reopened.ok && reopened.value).toEqual(document);

    const exported = geometryDocumentToSceneDocument(document);
    expect(exported.objects?.[0]).toEqual(legacy.objects?.[0]);
    expect(exported.extensions?.["math3d.geometry.derivedConstructions.v1"]).toEqual(legacy.extensions?.["math3d.geometry.derivedConstructions.v1"]);
    expect(exported.extensions?.["math3d.geometry.constructionRelationships.v1"]).toEqual(legacy.extensions?.["math3d.geometry.constructionRelationships.v1"]);
  });

  it("keeps stable object/construction IDs through source replay and rejects runtime buffers", () => {
    const adapter = fixture.create();
    adapter.commitSource(editedSource(adapter.document().source));
    const restored = GeometryDocumentAdapter.restore(adapter.exportReplay());
    expect(restored.document().source.objects.map((entry) => entry.id)).toEqual(["box-a"]);
    expect(restored.document().source.constructions.map((entry) => entry.id)).toEqual(["midpoint-a"]);
    expect(() => fixture.attemptInvalidEdit(adapter)).toThrow(/plain JSON|canonical JSON|unsupported/i);
  });

  it("rejects unknown schema fields and replay divergence", () => {
    const adapter = fixture.create();
    adapter.commitSource(editedSource(adapter.document().source));
    const unknown = JSON.parse(serializeGeometryDocument(adapter.document()));
    unknown.viewer = { hovered: "box-a" };
    expect(deserializeGeometryDocument(JSON.stringify(unknown))).toMatchObject({ ok: false });

    const tampered = structuredClone(adapter.exportReplay());
    (tampered.transactions[0]!.command.command.payload as any).parameters.radius = 9;
    expect(() => GeometryDocumentAdapter.restore(tampered)).toThrow(/restore Geometry transaction/);
  });
});
