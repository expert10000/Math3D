import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, applyGraph2DAuthoring, compareVectorField3D,
  createEmptyGraph2DDocument, createGraph2DDocument, createMixedWorkspaceDocument,
  createProjectComparisonProfileOrigin, createVectorField3DComparisonResult,
  createVectorField3DDocument, parseMath3DProject, projectComparisonProfileGraphStatus,
  projectComparisonProfileRows, projectVectorField3DComparisonStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument, serializeMath3DProject,
  Graph2DPointTableStore,
  upsertProjectVectorField3DComparison, vectorField3DComparisonTransferKey } from "@math3d/core";
import { createGf23Project, gf23Transfer } from
  "../fixtures/graph-field/gf23Bundle";
import { gf34CoarseBundle } from "../fixtures/graph-field/gf34CoarseBundle";

const policy = { frame: "cartesian-identical" as const, grid: [9, 9, 9] as const,
  units: "identical" as const, interpolation: "verified-volume-trilinear" as const,
  coverage: "complete-or-withhold" as const };
const make = () => {
  let project = createGf23Project();
  const first = project.workspace.entries[0]!.checkpoint;
  if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
  const second = createVectorField3DDocument(first.source,
    { stableKey: "gf24-second-bundle", title: "Comparison source" });
  project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, entries: [...project.workspace.entries,
      { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
  return { project, first, second };
};

describe("GF-24 verified scientific comparison and Graph profile", () => {
  it("GF-34 resamples two verified grids only inside an explicit physical overlap", () => {
    let project = createGf23Project();
    const first = project.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document" ||
        first.source.field.kind !== "scientific-bundle") throw new Error("Wrong fixture.");
    const coarse = gf34CoarseBundle();
    const second = createVectorField3DDocument({ ...first.source,
      field: { ...first.source.field, references: coarse.references } },
    { stableKey: "gf34-coarse-grid" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second,
          expected: second.identity, replay: null }] }));
    const transfers = { a: gf23Transfer(), b: coarse.transfer };
    expect(() => compareVectorField3D(first, second, policy, transfers))
      .toThrow(/aligned Cartesian axes/);
    const cross = { ...policy, frame: "cartesian-aligned-overlap" as const,
      resampling: "physical-overlap-grid" as const,
      domain: [[-3, 3], [-3, 3], [-2, 2]] as const };
    const compared = compareVectorField3D(first, second, cross, transfers);
    expect(compared.status).toBe("complete");
    expect(compared.sampled).toBe(729);
    expect(compared.profile.axis).toMatchObject({ min: -3, max: 3, unit: "m" });
    expect(compared.vectorDifference.mean).not.toBeNull();
    const result = createVectorField3DComparisonResult(compared);
    expect(result.provenance.operation.parameters).toMatchObject({
      frame: "cartesian-aligned-overlap", resampling: "physical-overlap-grid",
      domain: cross.domain });
    project = parseMath3DProject(serializeMath3DProject(
      upsertProjectVectorField3DComparison(project, result, transfers)));
    const check = (source: typeof first) => source.identity.id === first.identity.id ?
      vectorField3DComparisonTransferKey(transfers.a) :
      vectorField3DComparisonTransferKey(transfers.b);
    const origin = createProjectComparisonProfileOrigin(project, result, check);
    expect(projectComparisonProfileGraphStatus(project, origin, check).status).toBe("current");
    expect(projectComparisonProfileGraphStatus(project, origin).reason)
      .toBe("source-1-unverified");
    const rows = projectComparisonProfileRows(result);
    const graph = createEmptyGraph2DDocument("gf34-cross-grid-graph");
    const table = new Graph2DPointTableStore().publish(rows);
    const scene = applyGraph2DAuthoring(graph, { type: "create-point-series", draft: {
      label: "Cross-grid difference", table, mode: "line",
      domain: { min: origin.axis.min, max: origin.axis.max,
        includeMin: true, includeMax: true }, comparisonProfileOrigin: origin,
      style: { color: "#2563eb", lineWidth: 2,
        lineStyle: "solid", visible: true } } });
    const savedGraph = createGraph2DDocument({ ...scene,
      stableKey: "gf34-cross-grid-graph",
      identity: advanceDocumentIdentity(graph.identity, scene.source) });
    project = parseMath3DProject(serializeMath3DProject(
      replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
        ...project.workspace, entries: [...project.workspace.entries,
          { module: "graph2d", checkpoint: savedGraph,
            expected: savedGraph.identity, replay: null }] }))));
    expect(project.workspace.entries.some(item => item.module === "graph2d" &&
      item.checkpoint.format === "math3d.graph2d-document" &&
      item.checkpoint.source.objects.some(object => object.kind === "point-series" &&
        object.comparisonProfileOrigin?.resultId === result.resultId))).toBe(true);
    expect(projectComparisonProfileGraphStatus(project, origin, check).status).toBe("current");
    expect(() => compareVectorField3D(first, second, { ...cross,
      domain: [[-5, 3], [-3, 3], [-2, 2]] }, transfers)).toThrow(/physical overlap/);
    expect(() => compareVectorField3D(first, second, { ...cross,
      units: "convert" as never }, transfers)).toThrow(/policy/);
    expect(() => compareVectorField3D(first, second, cross,
      { a: transfers.a })).toThrow(/matching verified/);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item,
          checkpoint: changed, expected: changed.identity } : item) }));
    expect(projectComparisonProfileGraphStatus(stale, origin, check).reason)
      .toBe("source-2-changed");
  });
  it("aligns two verified bundles, saves both lineages and withholds Graph rows until reverified", () => {
    let { project, first, second } = make();
    const transfer = gf23Transfer(), transfers = { a: transfer, b: transfer };
    const comparison = compareVectorField3D(first, second, policy, transfers);
    expect(comparison.status).toBe("complete");
    expect(comparison.sampled).toBe(729);
    expect(comparison.vectorDifference.mean).toBe(0);
    expect(comparison.profile.rows).toHaveLength(9);
    const result = createVectorField3DComparisonResult(comparison);
    project = upsertProjectVectorField3DComparison(project, result, transfers);
    project = parseMath3DProject(serializeMath3DProject(project));
    const check = () => vectorField3DComparisonTransferKey(transfer);
    expect(projectVectorField3DComparisonStatus(project, result).reason)
      .toBe("source-1-unverified");
    expect(projectVectorField3DComparisonStatus(project, result, check).status).toBe("current");
    const origin = createProjectComparisonProfileOrigin(project, result, check);
    const rows = projectComparisonProfileRows(result);
    expect(rows).toHaveLength(9);
    const graph = createEmptyGraph2DDocument("gf24-comparison-graph");
    const tables = new Graph2DPointTableStore();
    const scene = applyGraph2DAuthoring(graph, { type: "create-point-series", draft: {
      label: "Field difference", table: tables.publish(rows), mode: "line",
      domain: { min: origin.axis.min, max: origin.axis.max,
        includeMin: true, includeMax: true }, comparisonProfileOrigin: origin,
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
    } });
    const savedGraph = createGraph2DDocument({ ...scene, stableKey: "gf24-comparison-graph",
      identity: advanceDocumentIdentity(graph.identity, scene.source) });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries, { module: "graph2d",
        checkpoint: savedGraph, expected: savedGraph.identity, replay: null }] }));
    project = parseMath3DProject(serializeMath3DProject(project));
    const graphEntry = project.workspace.entries.find(item => item.module === "graph2d")!;
    expect(graphEntry.checkpoint.format === "math3d.graph2d-document" &&
      graphEntry.checkpoint.source.objects.some(item => item.kind === "point-series" &&
        item.comparisonProfileOrigin?.resultId === result.resultId)).toBe(true);
    expect(projectComparisonProfileGraphStatus(project, origin).status).toBe("withheld");
    expect(projectComparisonProfileGraphStatus(project, origin, check).status).toBe("current");
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectComparisonProfileGraphStatus(project, origin, check).reason)
      .toBe("source-2-changed");
  });

  it("rejects implicit alignment and tampered verified values", () => {
    const { first, second } = make(), transfer = gf23Transfer();
    expect(() => compareVectorField3D(first, second, { ...policy,
      frame: "converted" as never }, { a: transfer, b: transfer })).toThrow(/policy/);
    expect(() => compareVectorField3D(first, second, policy,
      { a: transfer, b: { ...transfer, volumes: [transfer.volumes[0],
        { ...transfer.volumes[1], values: transfer.volumes[1].values.map((value, i) =>
          i ? value : value + 1) }, transfer.volumes[2]] } })).toThrow();
  });
});
