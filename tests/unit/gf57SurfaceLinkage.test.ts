import { describe, expect, it } from "vitest";
import { computeTemporalSurfaceEvents, computeTemporalSurfaceLinkage,
  createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, projectTemporalSurfaceLinkageStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectTemporalFieldSource,
  upsertProjectTemporalSurfaceEvents, upsertProjectTemporalSurfaceLinkage,
  vectorField3DExpression, type VectorField3DDocument,
  type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";

const fixture = () => {
  const original = createGf23Project().workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } }, { stableKey: key });
  const a = make("gf57-a"), b = make("gf57-b");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [a, b].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [a.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf57-project" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: a.identity.id },
      { time: 1, documentId: b.identity.id }],
    { stableKey: "gf57-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  const surface = (document: VectorField3DDocument,
    centers: readonly number[], radius: number): VectorField3DIsosurface => {
    const positions = new Float32Array(centers.flatMap(center => [
      center - radius, 0, 0, center + radius, 0, 0,
      center, radius, 0, center, 0, radius]));
    const indices = new Uint32Array(centers.flatMap((_, i) => {
      const n = i * 4;
      return [n, n + 2, n + 1, n, n + 1, n + 3,
        n, n + 3, n + 2, n + 1, n + 2, n + 3];
    }));
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
    return { source: { documentId: document.identity.id,
      revision: document.identity.revision,
      structuralHash: document.identity.structuralHash },
      sourceHash: null, sourceReferences: null, level: 1, unit: "m/s",
      clipBounds: [[-4, 4], [-4, 4], [-4, 4]],
      coordinateAxes: document.source.axes, gridShape: [3, 3, 3],
      sampledPoints: 27, triangleBudget: 20_000,
      triangleCount: indices.length / 3, vertexCount: positions.length / 3,
      complete: true, clipped: false, limitReason: null,
      topology: { connectedComponents: centers.length, boundaryEdgeCount: 0,
        clipBoundaryEdgeCount: 0, nonManifoldEdgeCount: 0,
        watertight: true }, bounds: null, positions, indices, normals };
  };
  return { project, temporal, a, b, surface };
};

describe("GF-57 saved topology-event linkage", () => {
  it("uses the shared remesh gate for a unique stable component and saves guarded evidence", () => {
    let { project, temporal, a, b, surface } = fixture();
    const remeshBase = surface(b, [0], .5);
    const remeshed = { ...remeshBase,
      positions: new Float32Array([...remeshBase.positions, 0, 0, 0]),
      normals: new Float32Array([...remeshBase.normals, 0, 0, 1]),
      indices: new Uint32Array([0, 2, 4, 4, 2, 1, 0, 4, 3,
        4, 1, 3, 0, 3, 2, 1, 2, 3]),
      triangleCount: 6, vertexCount: 5 };
    const frames = [{ time: 0, surface: surface(a, [0], .5) },
      { time: 1, surface: remeshed }];
    const events = computeTemporalSurfaceEvents(project, temporal, frames);
    project = upsertProjectTemporalSurfaceEvents(project, events);
    const study = computeTemporalSurfaceLinkage(project, temporal, frames,
      events.publication!);
    expect(study.status, study.reason ?? "").toBe("ready");
    expect(study.links).toMatchObject([{ status: "geometric-continuation",
      maxError: 0 }]);
    const saved = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalSurfaceLinkage(project, study)));
    const result = saved.workspace.results.find(item =>
      item.resultId === study.publication!.resultId)!;
    expect(result.summary.interpolation).toBe("unavailable");
    expect(projectTemporalSurfaceLinkageStatus(saved, result).status).toBe("current");
    const changed = reviseVectorField3DDocument(b, { ...b.source,
      display: { ...b.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(saved, createMixedWorkspaceDocument({
      ...saved.workspace, entries: saved.workspace.entries.map(item =>
        item.expected.id === b.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectTemporalSurfaceLinkageStatus(stale, result).status).toBe("withheld");
  });
  it("keeps merge and disappearance links provisional on exact frames", () => {
    let { project, temporal, a, b, surface } = fixture();
    const merged = [{ time: 0, surface: surface(a, [-2, 2], .2) },
      { time: 1, surface: surface(b, [0], 2.5) }];
    const events = computeTemporalSurfaceEvents(project, temporal, merged);
    project = upsertProjectTemporalSurfaceEvents(project, events);
    const links = computeTemporalSurfaceLinkage(project, temporal, merged,
      events.publication!);
    expect(links.links.filter(link => link.status === "possible-merge")).toHaveLength(2);
    expect(links.links.every(link => link.maxError === null)).toBe(true);
    expect(links.publication!.summary.exactFrameOnly).toBe(true);
    const vanished = [{ time: 0, surface: surface(a, [-2], .2) },
      { time: 1, surface: surface(b, [], .2) }];
    const vanishEvents = computeTemporalSurfaceEvents(project, temporal, vanished);
    project = upsertProjectTemporalSurfaceEvents(project, vanishEvents);
    expect(computeTemporalSurfaceLinkage(project, temporal, vanished,
      vanishEvents.publication!).links[0]!.status).toBe("disappearance");
  });
});
