import { describe, expect, it } from "vitest";
import { computeTemporalSurfaceEvents, computeTemporalSurfaceLinkage,
  computeTemporalSurfaceTransport, createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, projectTemporalSurfaceTransportStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectTemporalFieldSource,
  upsertProjectTemporalSurfaceEvents, upsertProjectTemporalSurfaceLinkage,
  upsertProjectTemporalSurfaceTransport, vectorField3DExpression,
  type VectorField3DDocument, type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";

const rule = { method: "verified-midpoint-advection" as const,
  maxStepTime: 1, distanceTolerance: .1, witnessesPerComponent: 8 };
const fixture = () => {
  const original = createGf23Project().workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...original.source,
    field: { kind: "expressions", components: [0, 0, 0].map(() =>
      vectorField3DExpression("0", "m/s")) as [ReturnType<typeof vectorField3DExpression>,
        ReturnType<typeof vectorField3DExpression>, ReturnType<typeof vectorField3DExpression>] } },
  { stableKey: key });
  const a = make("gf59-a"), b = make("gf59-b");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [a, b].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [a.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf59-project" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: a.identity.id }, { time: 1, documentId: b.identity.id }],
    { stableKey: "gf59-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  const surface = (document: VectorField3DDocument, centers: readonly number[],
    radius: number): VectorField3DIsosurface => {
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
        clipBoundaryEdgeCount: 0, nonManifoldEdgeCount: 0, watertight: true },
      bounds: null, positions, indices, normals };
  };
  const compute = (frames: readonly { time: number; surface: VectorField3DIsosurface }[]) => {
    const events = computeTemporalSurfaceEvents(project, temporal, frames);
    project = upsertProjectTemporalSurfaceEvents(project, events);
    const linkage = computeTemporalSurfaceLinkage(project, temporal, frames,
      events.publication!);
    project = upsertProjectTemporalSurfaceLinkage(project, linkage);
    return { study: computeTemporalSurfaceTransport(project, temporal, frames,
      linkage.publication!, rule), project };
  };
  return { get project() { return project; }, temporal, a, b, surface, compute };
};

describe("GF-59 checked region transport evidence", () => {
  it("saves exact-frame witnesses and withholds after source change", () => {
    const f = fixture();
    const frames = [{ time: 0, surface: f.surface(f.a, [0], .5) },
      { time: 1, surface: f.surface(f.b, [0], .5) }];
    const { study } = f.compute(frames);
    expect(study.status, study.reason ?? "").toBe("ready");
    expect(study.witnesses[0]).toMatchObject({ status: "transport-consistent",
      tested: 5, withinTargetBounds: 5 });
    expect(study.publication!.summary).toMatchObject({ exactFrameOnly: true,
      interpolation: "unavailable", materialIdentity: "unverified",
      coordinateUnit: "m", timeUnit: "s" });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalSurfaceTransport(f.project, study)));
    const result = reopened.workspace.results.find(item =>
      item.resultId === study.publication!.resultId)!;
    expect(projectTemporalSurfaceTransportStatus(reopened, result).status).toBe("current");
    const mobile = buildMobileProjectExplorer(serializeMath3DProject(reopened));
    const spoken = mobile.scientificContracts.find(item => item.title ===
      "Checked region transport")?.spokenSummary;
    expect(spoken).toContain("Unit metres");
    expect(spoken).toContain("Source revision");
    const changed = reviseVectorField3DDocument(f.b, { ...f.b.source,
      display: { ...f.b.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(item => item.expected.id === f.b.identity.id ?
          { ...item, checkpoint: changed, expected: changed.identity } : item) }));
    expect(projectTemporalSurfaceTransportStatus(stale, result).status).toBe("withheld");
  });
  it("records split, merge, appearance and disappearance as unproved identity", () => {
    for (const [before, after, radiusBefore, radiusAfter, event] of [
      [[0], [-1, 1], 2, .5, "possible-split"],
      [[-1, 1], [0], .5, 2, "possible-merge"],
      [[], [0], .5, .5, "appearance"],
      [[0], [], .5, .5, "disappearance"],
    ] as const) {
      const f = fixture();
      const frames = [{ time: 0, surface: f.surface(f.a, before, radiusBefore) },
        { time: 1, surface: f.surface(f.b, after, radiusAfter) }];
      const { study } = f.compute(frames);
      expect(study.status, study.reason ?? "").toBe("ready");
      expect(study.witnesses.some(item => item.link.status === event)).toBe(true);
      expect(study.publication!.summary.materialIdentity).toBe("unverified");
      expect(study.witnesses.filter(item => item.link.fromComponent === null ||
        item.link.toComponent === null).every(item => item.status === "ambiguous")).toBe(true);
    }
  });
  it("rejects work-limit violations and cancellation", () => {
    const f = fixture();
    const frames = [{ time: 0, surface: f.surface(f.a, [0], .5) },
      { time: 1, surface: f.surface(f.b, [0], .5) }];
    const { study } = f.compute(frames);
    const linkage = f.project.workspace.results.find(item => item.provenance.operation.type ===
      "vector3d.temporal-surface-linkage")!;
    expect(() => computeTemporalSurfaceTransport(f.project, f.temporal, frames,
      linkage, { ...rule, witnessesPerComponent: 100 })).toThrow(/bounded/);
    expect(() => computeTemporalSurfaceTransport(f.project, f.temporal, frames,
      linkage, rule, undefined, () => true)).toThrow(/cancelled/);
    expect(study.publication!.summary.interpolation).toBe("unavailable");
  });
});
