import { describe, expect, it } from "vitest";
import { classifyTemporalSurfaceEvent, computeTemporalSurfaceEvents,
  createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, projectTemporalSurfaceEventsStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectTemporalFieldSource,
  upsertProjectTemporalSurfaceEvents, vectorField3DExpression,
  type VectorField3DDocument, type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";

const fixture = () => {
  const source = createGf23Project().workspace.entries[0]!.checkpoint as
    VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...source.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } }, { stableKey: key });
  const first = make("gf52-first"), second = make("gf52-second");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf52-project" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id },
      { time: 1, documentId: second.identity.id }],
    { stableKey: "gf52-time", timeUnit: "s", interpolation: "linear" });
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
        watertight: true }, bounds: null,
      positions, indices, normals: new Float32Array(positions.length) };
  };
  return { project, temporal, first, second, surface };
};

describe("GF-52 exact-frame topology event evidence", () => {
  it("marks merges, splits and disappearance without inventing correspondence", () => {
    const { first, second, surface } = fixture();
    const separated = surface(first, [-2, 2], .2);
    const joined = surface(second, [0], 2.5);
    expect(classifyTemporalSurfaceEvent(separated, joined, 0, 1))
      .toMatchObject({ kind: "possible-merge", interpolation: "unavailable",
        fromEuler: [2, 2], toEuler: [2] });
    expect(classifyTemporalSurfaceEvent(joined, separated, 0, 1).kind)
      .toBe("possible-split");
    expect(classifyTemporalSurfaceEvent(separated, surface(second, [-2], .2),
      0, 1).kind).toBe("disappearance");
    expect(classifyTemporalSurfaceEvent(separated, surface(second, [], .2),
      0, 1).kind).toBe("disappearance");
    expect(classifyTemporalSurfaceEvent({ ...separated,
      topology: { ...separated.topology, watertight: false,
        boundaryEdgeCount: 3 } }, joined, 0, 1).kind).toBe("inconclusive");
  });

  it("saves compact source-linked events, reopens, and withholds a changed frame", () => {
    const { project, temporal, first, second, surface } = fixture();
    const study = computeTemporalSurfaceEvents(project, temporal, [
      { time: 0, surface: surface(first, [-2, 2], .2) },
      { time: 1, surface: surface(second, [0], 2.5) }]);
    expect(study.status).toBe("ready");
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalSurfaceEvents(project, study)));
    const result = reopened.workspace.results.find(item => item.resultId ===
      study.publication!.resultId)!;
    expect(result.summary.interpolation).toBe("unavailable");
    expect(projectTemporalSurfaceEventsStatus(reopened, result).status).toBe("current");
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(entry =>
          entry.expected.id === second.identity.id ? { ...entry,
            checkpoint: changed, expected: changed.identity } : entry) }));
    expect(projectTemporalSurfaceEventsStatus(stale, result).reason).toBe("frame-2-changed");
    expect(buildMobileProjectExplorer(serializeMath3DProject(stale)).scientificContracts
      .find(item => item.id === result.resultId)?.spoken).toMatch(/frame-2-changed/);
  });
});
