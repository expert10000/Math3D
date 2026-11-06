import { describe, expect, it } from "vitest";
import { computeTemporalFtleProfile, computeTemporalLyapunovField,
  applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createTemporalFtleGraphOrigin,
  createVectorField3DDocument, parseMath3DProject,
  projectTemporalFtleGraphStatus, projectTemporalFtleProfileStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, temporalFtleGraphRows,
  upsertProjectTemporalFieldSource, upsertProjectTemporalFtleProfile,
  upsertProjectTemporalLyapunovField, Graph2DPointTableStore,
  type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";

const fixture = () => {
  const source = createGf23Project().workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const a = createVectorField3DDocument(source.source, { stableKey: "gf56-a" });
  const b = createVectorField3DDocument(source.source, { stableKey: "gf56-b" });
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [a, b].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [a.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf56-project" });
  const transfers = new Map([[a.identity.id, gf23Transfer()],
    [b.identity.id, gf23Transfer()]]);
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: a.identity.id },
      { time: .2, documentId: b.identity.id }],
    { stableKey: "gf56-time", timeUnit: "s", interpolation: "linear", transfers });
  project = upsertProjectTemporalFieldSource(project, temporal, transfers);
  return { project, temporal, transfers, a, b };
};
const recipe = { normalAxis: 2 as const, coordinate: 0, resolution: 2,
  startTime: 0, endTime: .2, perturbation: .001, maxSteps: 16,
  method: "fixed-rk4-cauchy-green" as const };

describe("GF-56 verified bundled FTLE profile", () => {
  it("computes and reopens checked bundle values, then withholds changed frames and Graph rows", async () => {
    let { project, temporal, transfers, a, b } = fixture();
    expect((await computeTemporalLyapunovField(project, temporal, recipe)).reason)
      .toBe("frame-1-verification-required");
    const base = await computeTemporalLyapunovField(project, temporal, recipe,
      { transfers, verifyBeforePublish: async () => transfers });
    expect(base.status, base.reason ?? "").toBe("ready");
    project = upsertProjectTemporalLyapunovField(project, base, transfers);
    const profile = await computeTemporalFtleProfile(project,
      { baseResultId: base.publication!.resultId,
        convergenceTolerance: .5, profileRow: 0 },
      { transfers, verifyBeforePublish: async () => transfers });
    expect(profile.status, profile.reason ?? "").toBe("ready");
    expect(profile.refined!.evaluations).toBeLessThanOrEqual(60_000);
    project = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalFtleProfile(project, profile, transfers)));
    const result = project.workspace.results.find(item =>
      item.resultId === profile.publication!.resultId)!;
    expect(projectTemporalFtleProfileStatus(project, result).status).toBe("withheld");
    expect(projectTemporalFtleProfileStatus(project, result, transfers).status).toBe("current");
    const origin = createTemporalFtleGraphOrigin(project, profile, transfers);
    const rows = temporalFtleGraphRows(profile);
    const tables = new Graph2DPointTableStore();
    const graph = applyGraph2DAuthoring(createEmptyGraph2DDocument("gf56-graph"),
      { type: "create-point-series", draft: { label: "Bundled FTLE profile",
        table: tables.publish(rows), mode: "line", domain: { min: rows[0]!.x,
          max: rows.at(-1)!.x, includeMin: true, includeMax: true },
        temporalFtleOrigin: origin, style: { color: "#2563eb",
          lineWidth: 2, lineStyle: "solid", visible: true } } });
    const oldRow = graph.source.objects.find(item => item.kind === "point-series")!;
    expect(projectTemporalFtleGraphStatus(project, origin, rows).status).toBe("withheld");
    expect(projectTemporalFtleGraphStatus(project, origin, rows, transfers).status).toBe("current");
    const changed = reviseVectorField3DDocument(b, { ...b.source,
      display: { ...b.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(entry =>
        entry.expected.id === b.identity.id ? { ...entry, checkpoint: changed,
          expected: changed.identity } : entry) }));
    expect(projectTemporalFtleGraphStatus(stale, origin, rows, transfers).status).toBe("withheld");
    const replacement = createTemporalFieldSourceDocument(stale,
      [{ time: 0, documentId: a.identity.id },
        { time: .2, documentId: changed.identity.id }],
      { stableKey: "gf56-time", timeUnit: "s", interpolation: "linear", transfers });
    let rebased = upsertProjectTemporalFieldSource(stale, replacement, transfers);
    const refreshedBase = await computeTemporalLyapunovField(rebased, replacement,
      recipe, { transfers, verifyBeforePublish: async () => transfers });
    rebased = upsertProjectTemporalLyapunovField(rebased, refreshedBase, transfers);
    const refreshedProfile = await computeTemporalFtleProfile(rebased,
      { baseResultId: refreshedBase.publication!.resultId,
        convergenceTolerance: .5, profileRow: 0 },
      { transfers, verifyBeforePublish: async () => transfers });
    rebased = upsertProjectTemporalFtleProfile(rebased, refreshedProfile, transfers);
    const freshRows = temporalFtleGraphRows(refreshedProfile);
    const freshOrigin = createTemporalFtleGraphOrigin(rebased,
      refreshedProfile, transfers);
    expect(freshOrigin.resultId).not.toBe(origin.resultId);
    const refreshedGraph = applyGraph2DAuthoring(graph, { type: "edit-point-series",
      objectId: oldRow.id, draft: { label: "Bundled FTLE profile",
        table: tables.publish(freshRows), mode: "line",
        domain: { min: freshRows[0]!.x, max: freshRows.at(-1)!.x,
          includeMin: true, includeMax: true }, temporalFtleOrigin: freshOrigin,
        style: { color: "#2563eb", lineWidth: 2,
          lineStyle: "solid", visible: true } } });
    const newRow = refreshedGraph.source.objects.find(item =>
      item.kind === "point-series")!;
    expect(newRow.id).toBe(oldRow.id);
    expect(projectTemporalFtleGraphStatus(rebased, freshOrigin,
      tables.resolve(newRow.table), transfers).status).toBe("current");
  });
  it("rejects edge seeds, excess transfers and cancellation before publication", async () => {
    const { project, temporal, transfers, a } = fixture();
    await expect(computeTemporalLyapunovField(project, temporal,
      { ...recipe, coordinate: a.source.axes[2].min },
      { transfers, verifyBeforePublish: async () => transfers }))
      .rejects.toThrow(/bounded physical interval/);
    const huge = gf23Transfer();
    const excess = new Map(transfers);
    excess.set(a.identity.id, { ...huge, volumes: huge.volumes.map((part, index) =>
      index ? part : { ...part, values: Array(600_000).fill(0) }) as typeof huge.volumes });
    expect((await computeTemporalLyapunovField(project, temporal, recipe,
      { transfers: excess })).reason).toBe("frame-transfer-budget-exceeded");
    let cancelled = false;
    await expect(computeTemporalLyapunovField(project, temporal, recipe,
      { transfers, shouldCancel: () => cancelled,
        onProgress: () => { cancelled = true; },
        verifyBeforePublish: async () => transfers })).rejects.toThrow(/cancelled/);
  });
});
