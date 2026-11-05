import { describe, expect, it } from "vitest";
import { computeTemporalSpectrum, createMath3DProject,
  advanceDocumentIdentity, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, createTemporalSpectrumGraphOrigin,
  projectTemporalSpectrumGraphStatus, temporalSpectrumGraphRows,
  Graph2DPointTableStore,
  createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, parseMath3DProject,
  projectTemporalSpectrumStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  upsertProjectTemporalFieldSource, upsertProjectTemporalSpectrum,
  vectorField3DExpression, type VectorField3DDocument,
  type Graph2DPointSeriesDraft } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";

function fixture() {
  const base = createGf23Project().workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const frames = Array.from({ length: 17 }, (_, index) => {
    const speed = Math.sin(2 * Math.PI * index / 16);
    return createVectorField3DDocument({ ...base.source,
      field: { kind: "expressions" as const, components: [
        vectorField3DExpression(String(speed), "m/s"),
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s")] as const } },
    { stableKey: `gf31-frame-${index}` });
  });
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: frames.map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [frames[0]!.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf31-analytic-tone" });
  const temporal = createTemporalFieldSourceDocument(project,
    frames.map((frame, index) => ({ time: index / 16,
      documentId: frame.identity.id })),
    { stableKey: "gf31-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  return { project, temporal, frames };
}

describe("GF-31 temporal spectra", () => {
  it("GF-32 saves both guarded Graph series and withholds changed frames", async () => {
    let { project, temporal, frames } = fixture();
    const recipe = { position: [0, 0, 0] as const, component: "x" as const,
      startTime: 0, endTime: 1, sampleCount: 16 as const,
      window: "rectangular" as const, detrend: "mean" as const };
    const computed = await computeTemporalSpectrum(project, temporal, recipe);
    project = upsertProjectTemporalSpectrum(project, computed.publication);
    const tables = new Graph2DPointTableStore();
    const kinds = ["psd", "autocorrelation"] as const;
    const origins = kinds.map(kind => createTemporalSpectrumGraphOrigin(project,
      computed, kind));
    const graph = createEmptyGraph2DDocument("gf32-spectral-graph");
    const scene = applyGraph2DAuthoring(graph, { type: "create-point-series-pair",
      drafts: kinds.map((kind, index) => {
        const rows = temporalSpectrumGraphRows(computed, kind);
        return { label: kind, table: tables.publish(rows), mode: "line" as const,
          domain: { min: rows[0]!.x, max: rows.at(-1)!.x,
            includeMin: true, includeMax: true }, temporalSpectrumOrigin: origins[index],
          style: { color: "#2563eb", lineWidth: 2,
            lineStyle: "solid" as const, visible: true } };
      }) as [Graph2DPointSeriesDraft, Graph2DPointSeriesDraft] });
    const savedGraph = createGraph2DDocument({ ...scene,
      stableKey: "gf32-spectral-graph",
      identity: advanceDocumentIdentity(graph.identity, scene.source) });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "graph2d", checkpoint: savedGraph,
          expected: savedGraph.identity, replay: null }] }));
    project = parseMath3DProject(serializeMath3DProject(project));
    const restored = project.workspace.entries.find(item => item.module === "graph2d")!
      .checkpoint;
    expect(restored.format).toBe("math3d.graph2d-document");
    if (restored.format !== "math3d.graph2d-document") return;
    const series = restored.source.objects.filter(item => item.kind === "point-series" &&
      item.temporalSpectrumOrigin);
    expect(series).toHaveLength(2);
    for (const item of series) {
      if (item.kind !== "point-series" || !item.temporalSpectrumOrigin) continue;
      const rows = tables.resolve(item.table);
      expect(projectTemporalSpectrumGraphStatus(project,
        item.temporalSpectrumOrigin, rows).status).toBe("current");
      expect(projectTemporalSpectrumGraphStatus(project,
        item.temporalSpectrumOrigin, null).reason).toBe("series-artifact-missing-or-changed");
    }
    const changed = reviseVectorField3DDocument(frames[4]!, { ...frames[4]!.source,
      display: { ...frames[4]!.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === changed.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    for (const item of series) if (item.kind === "point-series" && item.temporalSpectrumOrigin)
      expect(projectTemporalSpectrumGraphStatus(stale,
        item.temporalSpectrumOrigin, tables.resolve(item.table)).status).toBe("withheld");
    const replacement = createTemporalFieldSourceDocument(stale,
      frames.map((frame, index) => ({ time: index / 16,
        documentId: frame.identity.id })),
      { stableKey: "gf31-time", timeUnit: "s", interpolation: "linear" });
    let rebased = upsertProjectTemporalFieldSource(stale, replacement);
    const refreshed = await computeTemporalSpectrum(rebased, replacement, recipe);
    rebased = upsertProjectTemporalSpectrum(rebased, refreshed.publication);
    expect(refreshed.publication.resultId).not.toBe(computed.publication.resultId);
    const edits = series.map(item => {
      if (item.kind !== "point-series" || !item.temporalSpectrumOrigin)
        throw new Error("Missing spectral series.");
      const kind = item.temporalSpectrumOrigin.series;
      const rows = temporalSpectrumGraphRows(refreshed, kind);
      return { objectId: item.id, draft: {
        label: item.label, table: tables.publish(rows), mode: "line" as const,
        domain: { min: rows[0]!.x, max: rows.at(-1)!.x,
          includeMin: true, includeMax: true },
        temporalSpectrumOrigin: createTemporalSpectrumGraphOrigin(rebased,
          refreshed, kind),
        style: { color: "#2563eb", lineWidth: 2,
          lineStyle: "solid" as const, visible: true } } };
    }) as [{ objectId: string; draft: Graph2DPointSeriesDraft },
      { objectId: string; draft: Graph2DPointSeriesDraft }];
    const refreshedScene = applyGraph2DAuthoring(restored,
      { type: "edit-point-series-pair", edits });
    expect(refreshedScene.source.objects.filter(item => item.kind === "point-series" &&
      item.temporalSpectrumOrigin?.resultId === refreshed.publication.resultId)).toHaveLength(2);
  });
  it("matches a 1 Hz reference PSD and persists guarded values", async () => {
    const { project, temporal, frames } = fixture();
    const recipe = { position: [0, 0, 0] as const, component: "x" as const,
      startTime: 0, endTime: 1, sampleCount: 16 as const,
      window: "rectangular" as const, detrend: "mean" as const };
    const result = await computeTemporalSpectrum(project, temporal, recipe);
    expect(result.psd[1]!.frequency).toBeCloseTo(1, 12);
    expect(result.psd[1]!.density).toBeCloseTo(.5, 9);
    expect(result.psd.filter((_, index) => index !== 1)
      .every(bin => bin.density < 1e-20)).toBe(true);
    expect(result.autocorrelation[0]!.coefficient).toBeCloseTo(1, 12);
    expect(result.publication.summary).toMatchObject({ sampleCount: 16,
      sampleInterval: 1 / 16, frequencyUnit: "cycles/s",
      powerUnit: "(m/s)²·s", autocorrelationStatus: "resolved" });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalSpectrum(project, result.publication)));
    expect(projectTemporalSpectrumStatus(reopened, result.publication).status).toBe("current");
    expect(reopened.workspace.results.find(item =>
      item.resultId === result.publication.resultId)).toEqual(result.publication);
    const changed = reviseVectorField3DDocument(frames[4]!, {
      ...frames[4]!.source, display: { ...frames[4]!.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === changed.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectTemporalSpectrumStatus(stale, result.publication).status).toBe("stale");
  });

  it("cancels and rejects missing temporal samples", async () => {
    const { project, temporal } = fixture();
    const recipe = { position: [0, 0, 0] as const, component: "magnitude" as const,
      startTime: 0, endTime: 1, sampleCount: 32 as const,
      window: "hann" as const, detrend: "mean" as const };
    let cancelled = false;
    await expect(computeTemporalSpectrum(project, temporal, recipe,
      { shouldCancel: () => cancelled,
        onProgress: done => { if (done >= 8) cancelled = true; } }))
      .rejects.toThrow(/cancelled/);
    await expect(computeTemporalSpectrum(project, temporal,
      { ...recipe, endTime: 2 })).rejects.toThrow(/pinned time axis/);
  });

  it("withholds a reopened scientific spectrum until both pinned bundles verify", async () => {
    let project = createGf23Project();
    const first = project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf31-bundled-later" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf31-bundled-time", timeUnit: "s",
        interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    const result = await computeTemporalSpectrum(project, temporal,
      { position: [2, 0, 0], component: "magnitude", startTime: 0, endTime: 1,
        sampleCount: 16, window: "hann", detrend: "mean" },
      { transfers, verifyBeforePublish: async () => transfers });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalSpectrum(project, result.publication, transfers)));
    expect(projectTemporalSpectrumStatus(reopened, result.publication).status).toBe("unverified");
    expect(projectTemporalSpectrumStatus(reopened, result.publication, transfers).status)
      .toBe("current");
  });
});
