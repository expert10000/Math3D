import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  upsertProjectTemporalFieldSource, vectorField3DExpression,
  type VectorField3DDocument, type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { runTemporalMovingIsosurfaces } from "./runTemporalMovingIsosurfaces";
import { playTemporalMovingIsosurfaces } from "./playTemporalMovingIsosurfaces";

describe("GF-52 exact-frame disappearance playback", () => {
  it("accepts a complete empty frame and plays it without interpolation", async () => {
    const source = createGf23Project().workspace.entries[0]!.checkpoint as
      VectorField3DDocument;
    const make = (key: string) => createVectorField3DDocument({ ...source.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("x", "m/s"),
        vectorField3DExpression("y", "m/s"),
        vectorField3DExpression("z", "m/s") ] } }, { stableKey: key });
    const first = make("gf52-play-first"), second = make("gf52-play-second");
    let project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
        checkpoint, expected: checkpoint.identity, replay: null })),
      activeDocumentIds: [first.identity.id], constructions: [], results: [],
      artifacts: [], relations: [], committedSelection: null }),
    { stableKey: "gf52-play-project" });
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf52-play-time", timeUnit: "s", interpolation: "linear" });
    project = upsertProjectTemporalFieldSource(project, temporal);
    const surface = (field: VectorField3DDocument): VectorField3DIsosurface => ({
      source: { documentId: field.identity.id, revision: field.identity.revision,
        structuralHash: field.identity.structuralHash },
      sourceHash: null, sourceReferences: null, level: 1, unit: "m/s",
      clipBounds: [[-2, 2], [-2, 2], [-2, 2]],
      coordinateAxes: field.source.axes, gridShape: [3, 3, 3], sampledPoints: 27,
      triangleBudget: 20_000, triangleCount: 0, vertexCount: 0,
      complete: true, clipped: false, limitReason: null,
      topology: { connectedComponents: 0, boundaryEdgeCount: 0,
        clipBoundaryEdgeCount: 0, nonManifoldEdgeCount: 0, watertight: true },
      bounds: null, positions: new Float32Array(), normals: new Float32Array(),
      indices: new Uint32Array() });
    const frames = await runTemporalMovingIsosurfaces(project, temporal,
      { level: 1, clipBounds: [[-2, 2], [-2, 2], [-2, 2]],
        triangleBudgetPerFrame: 100, timeBudgetMs: 1000 },
      { loadTransfers: async () => new Map(), runFrame: async field => surface(field) });
    expect(frames.map(frame => frame.surface.triangleCount)).toEqual([0, 0]);
    const shown: number[] = [], reasons: string[] = [];
    await playTemporalMovingIsosurfaces(project, temporal, frames, {
      loadTransfers: async () => new Map(),
      onFrame: frame => shown.push(frame.surface.triangleCount),
      interpolate: true,
      onInterpolated: () => { throw new Error("Empty frames cannot interpolate."); },
      onInterpolationUnavailable: (_, reason) => reasons.push(reason),
      intervalMs: 100, timeBudgetMs: 1000, memoryBudgetBytes: 1,
      wait: async () => {} });
    expect(shown).toEqual([0, 0]);
    expect(reasons[0]).toMatch(/empty/);
  });
});
