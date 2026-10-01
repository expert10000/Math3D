import { describe, expect, it } from "vitest";
import { createGeometryDocument, geometryDocumentFromSceneDocument, createMath3DProject, createMixedWorkspaceDocument } from "@math3d/core";
import { geometryEditorSeed, geometrySourceFromEditor, geometryDisplayFromEditor, projectConstructionsEditable, retainConstructionSource, LIVE_GEOMETRY_CONSTRUCTIONS } from "./nativeGeometryRestore";
import { inspectProjectCompatibility } from "./projectTransfer";
import { GeometryDocumentAdapter } from "../geometry/geometryDocumentAdapter";
const fixture = () => geometryDocumentFromSceneDocument({ id: "project-geometry", title: "Saved construction", createdAt: 0, updatedAt: 0, objects: [{ id: "box", type: "box", name: "Research box", params: { width: 2, height: 3, depth: 4 }, visible: true, material: { color: 0x3366ff, opacity: 1 }, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }], extensions: { [LIVE_GEOMETRY_CONSTRUCTIONS]: [{ id: "center", type: "object-centroid", sourceKind: "object", sourceObjectId: "box", dependent: true }], "research.extra": { retained: 7 } } });
const workspace = (document = fixture()) => createMixedWorkspaceDocument({ entries: [{ module: "geometry", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [{ kind: "scene-script", source: "box = box(2, 3, 4)", normalizedSceneScript: "box = box(2, 3, 4)" }], results: [], relations: [], artifacts: [], committedSelection: null });
describe("native Geometry project restore", () => {
  it("supports procedural Geometry and recorded construction state without a Graph", () => {
    const doc = fixture(), seed = geometryEditorSeed(doc);
    expect(seed.objects[0].params.width).toBe(2); expect(seed.constructions[0].sourceObjectId).toBe("box");
    expect(inspectProjectCompatibility(createMath3DProject(workspace(), { stableKey: "geometry-only" })).canOpenWorkspace).toBe(true);
    expect(projectConstructionsEditable(workspace())).toBe(true);
    const source = { nodes: [{ id: "a", x: 1 }], checkDefs: [], custom: "retained" }, normalized = { nodes: source.nodes, checkDefs: [], selectedNodeId: "a" };
    expect(retainConstructionSource(source, normalized, normalized)).toEqual(source);
    expect(retainConstructionSource(source, normalized, { ...normalized, nodes: [{ id: "a", x: 2 }] })).toMatchObject({ custom: "retained", nodes: [{ id: "a", x: 2 }] });
    expect(geometrySourceFromEditor(doc, doc)).toEqual(doc.source);
    const enriched = createGeometryDocument({ source: { ...doc.source, extensions: { ...doc.source.extensions, [LIVE_GEOMETRY_CONSTRUCTIONS]: [{ ...(doc.source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS] as any[])[0], sourceRevision: 0, sourceTopologySignature: "viewer-cache" }] } } });
    expect(geometrySourceFromEditor(doc, enriched)).toEqual(doc.source);
    expect(geometryDisplayFromEditor(doc, doc)).toEqual(doc.display);
  });
  it("preserves identities and opaque mathematical inputs through edits and replay", () => {
    const doc = fixture(), adapter = new GeometryDocumentAdapter(doc);
    const source = { ...doc.source, objects: [{ ...doc.source.objects[0], params: { ...doc.source.objects[0].params, width: 5 } }] };
    const live = createGeometryDocument({ source }); adapter.commitSource(geometrySourceFromEditor(doc, live));
    expect(adapter.document().identity.id).toBe(doc.identity.id); expect(adapter.document().source.extensions["research.extra"]).toEqual({ retained: 7 });
    expect(adapter.document().source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS]).toEqual(doc.source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS]);
    expect(GeometryDocumentAdapter.restore(adapter.exportReplay()).document()).toEqual(adapter.document());
  });
  it("does not advertise unrelated Geometry payloads or lossy construction normalization", () => {
    const doc = fixture(); expect(() => geometryEditorSeed(createGeometryDocument({ source: { ...doc.source, geometry: { points: [{ id: "a", x: 0, y: 0, z: 0 }] } } }))).toThrow();
    expect(() => geometryEditorSeed(createGeometryDocument({ source: { ...doc.source, extensions: { [LIVE_GEOMETRY_CONSTRUCTIONS]: [{ id: "future", type: "future-construction", sourceKind: "object", sourceObjectId: "box", dependent: true }] } } }))).toThrow();
    expect(projectConstructionsEditable({ ...workspace(), entries: [] })).toBe(false);
  });
});
