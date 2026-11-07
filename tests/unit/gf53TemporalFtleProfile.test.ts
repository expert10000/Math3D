import { describe, expect, it } from "vitest";
import { assessTemporalFtleConvergence, advanceDocumentIdentity,
  applyGraph2DAuthoring, computeTemporalFtleProfile,
  computeTemporalLyapunovField, createMath3DProject,
  createEmptyGraph2DDocument, createGraph2DDocument,
  createTemporalFtleGraphOrigin, Graph2DPointTableStore,
  projectTemporalFtleGraphStatus, temporalFtleGraphRows,
  createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, parseMath3DProject,
  projectTemporalFtleProfileStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  upsertProjectTemporalFieldSource, upsertProjectTemporalFtleProfile,
  upsertProjectTemporalLyapunovField, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";

const fixture = async () => {
  const source = createGf23Project().workspace.entries[0]!.checkpoint as
    VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...source.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s"),
      vectorField3DExpression("0", "m/s") ] } }, { stableKey: key });
  const first = make("gf53-a"), second = make("gf53-b");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf53-project" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id },
      { time: .2, documentId: second.identity.id }],
    { stableKey: "gf53-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  const base = await computeTemporalLyapunovField(project, temporal,
    { normalAxis: 2, coordinate: 0, resolution: 2,
      startTime: 0, endTime: .2, perturbation: .001, maxSteps: 16,
      method: "fixed-rk4-cauchy-green" });
  project = upsertProjectTemporalLyapunovField(project, base);
  return { project, temporal, first, second, base };
};

describe("GF-53 refined FTLE profile", () => {
  it("refines three discretizations, saves physical rows and withholds changed frames", async () => {
    const { project, second, base } = await fixture();
    const study = await computeTemporalFtleProfile(project,
      { baseResultId: base.publication!.resultId,
        convergenceTolerance: .02, profileRow: 0 });
    expect(study.status).toBe("ready");
    expect(study.rows).toHaveLength(2);
    expect(study.rows.every(row => row.status === "converged" &&
      Math.abs(row.y! - 1) < .02)).toBe(true);
    expect(study.publication?.summary).toMatchObject({
      timeSteps: [16, 32], resolutions: [2, 4], axisUnit: "m",
      valueUnit: "1/s" });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalFtleProfile(project, study)));
    const result = reopened.workspace.results.find(item => item.resultId ===
      study.publication!.resultId)!;
    expect(projectTemporalFtleProfileStatus(reopened, result).status).toBe("current");
    expect(projectTemporalFtleProfileStatus(reopened, { ...result,
      summary: { ...result.summary, valueUnit: "1/ms" } }).status).toBe("withheld");
    const rows = temporalFtleGraphRows(study);
    const tables = new Graph2DPointTableStore();
    const origin = createTemporalFtleGraphOrigin(reopened, study);
    const graph = createEmptyGraph2DDocument("gf53-graph");
    const scene = applyGraph2DAuthoring(graph, { type: "create-point-series",
      draft: { label: "FTLE profile", table: tables.publish(rows), mode: "line",
        domain: { min: rows[0]!.x, max: rows.at(-1)!.x,
          includeMin: true, includeMax: true }, temporalFtleOrigin: origin,
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid",
          visible: true } } });
    const savedGraph = createGraph2DDocument({ ...scene, stableKey: "gf53-graph",
      identity: advanceDocumentIdentity(graph.identity, scene.source) });
    const graphProject = parseMath3DProject(serializeMath3DProject(
      replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
        ...reopened.workspace, entries: [...reopened.workspace.entries,
          { module: "graph2d", checkpoint: savedGraph,
            expected: savedGraph.identity, replay: null }] }))));
    const graphEntry = graphProject.workspace.entries.find(item => item.module === "graph2d")!;
    if (graphEntry.checkpoint.format !== "math3d.graph2d-document")
      throw new Error("Saved Graph is missing.");
    const series = graphEntry.checkpoint.source.objects.find(item =>
      item.kind === "point-series" && item.temporalFtleOrigin);
    if (series?.kind !== "point-series" || !series.temporalFtleOrigin)
      throw new Error("Saved FTLE row is missing.");
    expect(projectTemporalFtleGraphStatus(graphProject,
      series.temporalFtleOrigin, tables.resolve(series.table)).status).toBe("current");
    expect(projectTemporalFtleGraphStatus(graphProject,
      series.temporalFtleOrigin, null).reason).toBe("profile-artifact-missing-or-changed");
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(item => item.expected.id ===
          changed.identity.id ? { ...item, checkpoint: changed,
            expected: changed.identity } : item) }));
    expect(projectTemporalFtleProfileStatus(stale, result).reason)
      .toMatch(/frame-2-changed/);
    expect(projectTemporalFtleGraphStatus(stale,
      series.temporalFtleOrigin, tables.resolve(series.table)).status).toBe("withheld");
  });

  it("marks unconverged profile cells as gaps and cancels refinement", async () => {
    const { project, base } = await fixture();
    const converged = await computeTemporalFtleProfile(project,
      { baseResultId: base.publication!.resultId,
        convergenceTolerance: .02, profileRow: 0 });
    const fine = converged.refined!.cells.map((cell, index) => index < 8 ?
      { ...cell, estimate: cell.estimate + (index % 4 < 2 ? .5 : 0) } : cell);
    const rows = assessTemporalFtleConvergence(base.cells, fine, .02, 0);
    expect(rows.some(row => row.status === "unavailable" && row.y === null))
      .toBe(true);
    let cancel = false;
    await expect(computeTemporalFtleProfile(project,
      { baseResultId: base.publication!.resultId,
        convergenceTolerance: .02, profileRow: 0 },
      { shouldCancel: () => cancel, onProgress: () => { cancel = true; } }))
      .rejects.toThrow(/cancelled/);
  });
});
