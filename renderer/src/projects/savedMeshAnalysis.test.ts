import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { additionalRepresentationFixture } from "../../../tests/fixtures/unified-projects/additionalRepresentations";
import { AdditionalProjectSession } from "./additionalProjectSession";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";
import { inspectProjectDependencies } from "./projectDependencies";

describe("portable linked Mesh analysis", () => {
  it("measures a unit square, stores summaries, rejects bad endpoints and retains historical analysis", () => {
    const adapter = MeshDocumentAdapter.fromMesh({ label: "Square", positions: Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]), indices: Uint32Array.from([0,1,2,1,3,2]), source: { kind: "bakedFromParam" } });
    const quality = analyzeSavedMesh(adapter, "quality"), curvature = analyzeSavedMesh(adapter, "curvature"), path = analyzeSavedMesh(adapter, "edge-path", { start: 0, end: 3 });
    expect((quality.summary.topology as any).boundaryEdgeCount).toBe(4); expect((quality.summary.metrics as any).triangleArea.avg).toBe(0.5);
    expect((curvature.summary.mean as any).avg).toBeCloseTo(0); expect(path.summary.length).toBeCloseTo(2); expect(path.summary.vertexIndices).toHaveLength(3);
    expect(() => analyzeSavedMesh(adapter, "edge-path", { start: -1, end: 1 })).toThrow();
    expect(() => analyzeSavedMesh(adapter, "edge-path", { start: 0.5, end: 1 })).toThrow();
    const disconnected = MeshDocumentAdapter.fromMesh({ ...adapter.mesh(), positions: Float32Array.from([0,0,0,1,0,0,0,1,0,10,0,0,11,0,0,10,1,0]), indices: Uint32Array.from([0,1,2,3,4,5]) });
    expect(() => analyzeSavedMesh(disconnected, "edge-path", { start: 0, end: 5 })).toThrow("connected");
    const coincident = MeshDocumentAdapter.fromMesh({ ...disconnected.mesh(), positions: Float32Array.from([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0]) });
    expect(() => analyzeSavedMesh(coincident, "edge-path", { start: 0, end: 5 })).toThrow("connected");
  });
  it("preserves results through project round-trip and marks transitive surface edits stale", () => {
    const fixture = additionalRepresentationFixture(), surface = fixture.docs.find(d => d.format === "math3d.surface-document" && d.source.representation === "weierstrass")!;
    if (surface.format !== "math3d.surface-document") throw Error();
    const entry = fixture.project.workspace.entries.find(e => e.expected.id === surface.identity.id)!;
    const context = { documents: new Map([[surface.identity.id, surface]]) };
    const f = { surface, workspace: createMixedWorkspaceDocument({ ...fixture.project.workspace, entries: [entry], activeDocumentIds: [surface.identity.id] }), context, session: new AdditionalProjectSession(entry, surface, () => context) };
    const promotion = createSavedSurfaceMesh(f.workspace, f.surface, f.context);
    const result = analyzeSavedMesh(promotion.adapter, "quality"), workspace = appendSavedMeshAnalysis(promotion.workspace, result);
    expect(appendSavedMeshAnalysis(workspace, result)).toBe(workspace);
    const project = parseMath3DProject(serializeMath3DProject(createMath3DProject(workspace, { stableKey: "analysis-test" })));
    expect(project.workspace.results).toEqual([result]); expect(inspectProjectDependencies(project).results[0].freshness).toBe("current");
    f.session.commit({ ...f.surface.source, definition: { ...f.surface.source.definition, expressions: { g: "z", phi: "1" } } } as never);
    const updated = createMath3DProject(createMixedWorkspaceDocument({ ...workspace, entries: workspace.entries.map(entry => entry.module === "surface" ? f.session.entry() : entry) }), { stableKey: "analysis-test" });
    expect(inspectProjectDependencies(updated).results[0].sourceFreshness).toBe("stale"); expect(updated.workspace.results).toEqual([result]);
    promotion.adapter.replaceMesh({ ...promotion.adapter.mesh(), positions: promotion.adapter.mesh().positions.map(value => value * 2) });
    expect(analyzeSavedMesh(promotion.adapter, "quality").resultId).not.toBe(result.resultId);
  });
});
