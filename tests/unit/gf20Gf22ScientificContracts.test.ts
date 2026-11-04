import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeGraph2DFourier, applyGraph2DAuthoring, convertCartesianJacobian,
  convertCartesianPoint, convertCartesianVector, createEmptyGraph2DDocument,
  createGraph2DDocument, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  frameUnitContractFromVectorField, graph2DPointDomain, graph2DSpectralDiagnosticsCsv,
  Graph2DPointTableStore, isFrameUnitContractCurrent, parseFrameUnitContract,
  parseMath3DProject, planCartesianUnitConversion, projectTemporalFieldSourceStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeFrameUnitContract, serializeMath3DProject, temporalFrameAtTime,
  upsertProjectTemporalFieldSource, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const firstSource = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;

describe("GF-20 checked PSD and autocorrelation", () => {
  const fit = (values: readonly number[]) => {
    const rows = values.map((y, index) => ({ id: `row_${index + 1}`, x: index / 128, y }));
    const table = new Graph2DPointTableStore().publish(rows);
    const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("gf20-spectrum"), {
      type: "create-point-series", draft: { label: "Known tone", table,
        domain: graph2DPointDomain(rows), mode: "line",
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const document = createGraph2DDocument({ ...source, stableKey: "gf20-spectrum" });
    return analyzeGraph2DFourier({ document, objectId: document.source.objects[0]!.id,
      rows, options: { window: "rectangular", normalization: "peak", detrend: "mean", xUnit: "s" } });
  };
  it("matches an independent sinusoid periodogram and biased autocorrelation", () => {
    const spectrum = fit(Array.from({ length: 128 }, (_, i) =>
      1.3 + 2.5 * Math.cos(2 * Math.PI * 8 * i / 128)));
    expect(spectrum.psd[8]!.frequency).toBe(8);
    expect(spectrum.psd[8]!.density).toBeCloseTo(3.125, 9);
    expect(spectrum.psd.reduce((sum, bin) => sum + bin.density, 0))
      .toBeCloseTo(3.125, 9);
    expect(spectrum.autocorrelation[0]!.coefficient).toBeCloseTo(1, 12);
    expect(spectrum.autocorrelation[16]!.coefficient).toBeCloseTo(.875, 9);
    expect(spectrum.publication.summary).toMatchObject({
      psdMethod: "one-sided-periodogram-window-energy-v1",
      autocorrelationMethod: "mean-centered-biased-v1" });
    expect(graph2DSpectralDiagnosticsCsv(spectrum)).toContain(spectrum.table.checksum);
  });
  it("labels normalized autocorrelation undefined for a constant series", () => {
    const spectrum = fit(Array(32).fill(3));
    expect(spectrum.autocorrelationStatus).toBe("undefined-zero-variance");
    expect(spectrum.autocorrelation.every(lag => lag.coefficient === null)).toBe(true);
  });
  it("uses window energy rather than coherent gain for Hann PSD", () => {
    const values = Array.from({ length: 128 }, (_, i) =>
      2 * Math.cos(2 * Math.PI * 8 * i / 128));
    const rows = values.map((y, index) => ({ id: `row_${index + 1}`, x: index / 128, y }));
    const table = new Graph2DPointTableStore().publish(rows);
    const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("gf20-hann"), {
      type: "create-point-series", draft: { label: "Hann reference", table,
        domain: graph2DPointDomain(rows), mode: "line",
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const document = createGraph2DDocument({ ...source, stableKey: "gf20-hann" });
    const result = analyzeGraph2DFourier({ document, objectId: document.source.objects[0]!.id,
      rows, options: { window: "hann", normalization: "peak", detrend: "mean", xUnit: "s" } });
    const weighted = values.map((value, i) => value * .5 * (1 - Math.cos(2 * Math.PI * i / 127)));
    const windowEnergy = Array.from({ length: 128 }, (_, i) =>
      (.5 * (1 - Math.cos(2 * Math.PI * i / 127))) ** 2).reduce((a, b) => a + b, 0);
    const referencePower = weighted.reduce((sum, value) => sum + value * value, 0) / windowEnergy;
    const integrated = result.psd.reduce((sum, bin) => sum + bin.density, 0);
    expect(integrated).toBeCloseTo(referencePower, 10);
  });
});

describe("GF-21 Cartesian frame/unit contract", () => {
  it("round-trips legacy Cartesian meaning and applies only explicit length/time conversions", () => {
    const original = firstSource(load());
    const contract = frameUnitContractFromVectorField(original);
    expect(parseFrameUnitContract(serializeFrameUnitContract(contract))).toEqual(contract);
    expect(isFrameUnitContractCurrent(contract, original)).toBe(true);
    const plan = planCartesianUnitConversion(contract,
      { coordinates: ["cm", "cm", "cm"], time: "ms" });
    expect(convertCartesianPoint(plan, [1, 2, 3])).toEqual([100, 200, 300]);
    convertCartesianVector(plan, [1, 2, 3]).forEach((value, i) =>
      expect(value).toBeCloseTo([.1, .2, .3][i]!, 12));
    const jacobian = convertCartesianJacobian(plan, [[1, 0, 0], [0, 2, 0], [0, 0, 3]]);
    [0, 1, 2].forEach(i => expect(jacobian[i]![i]).toBeCloseTo([.001, .002, .003][i]!, 12));
    expect(plan.export).toBe("explicit-target-physical-units");
    expect(() => planCartesianUnitConversion(contract,
      { coordinates: ["s", "cm", "cm"], time: "ms" })).toThrow(/Mixed coordinate units|mixed coordinate dimensions/);
    const revised = reviseVectorField3DDocument(original, { ...original.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("2*x", "m/s"),
        vectorField3DExpression("y", "m/s"),
        vectorField3DExpression("z", "m/s")] } });
    expect(isFrameUnitContractCurrent(contract, revised)).toBe(false);
    expect(() => parseFrameUnitContract(JSON.stringify({ ...contract, invented: "provenance" })))
      .toThrow(/Invalid versioned/);
  });
});

describe("GF-22 versioned temporal source", () => {
  it("pins discrete frames through Project reopen and withholds changed generations", () => {
    let project = load();
    expect(project.workspace.timeSources).toBeUndefined();
    expect(parseMath3DProject(serializeMath3DProject(project)).workspace.timeSources).toBeUndefined();
    const first = firstSource(project);
    const second = createVectorField3DDocument({ ...first.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("2*x", "m/s"),
        vectorField3DExpression("y", "m/s"),
        vectorField3DExpression("z", "m/s")] } },
    { stableKey: "gf22-frame-2", title: "Later frame" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 2, documentId: second.identity.id }],
      { stableKey: "gf22-two-frames", title: "Two saved times", timeUnit: "s" });
    project = upsertProjectTemporalFieldSource(project, temporal);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.workspace.timeSources?.[0]).toEqual(temporal);
    expect(projectTemporalFieldSourceStatus(reopened, temporal)).toEqual({ status: "current", reason: null });
    expect(temporalFrameAtTime(reopened, temporal, 2).identity.id).toBe(second.identity.id);
    expect(() => temporalFrameAtTime(reopened, temporal, 1)).toThrow(/interpolation is not defined/);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("3*x", "m/s"),
        vectorField3DExpression("y", "m/s"),
        vectorField3DExpression("z", "m/s")] } });
    const stale = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === second.identity.id ?
          { ...item, checkpoint: changed, expected: changed.identity } : item) }));
    expect(projectTemporalFieldSourceStatus(stale, temporal).reason).toBe("frame-2-changed");
    expect(() => createTemporalFieldSourceDocument(reopened,
      [{ time: 2, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "unordered", timeUnit: "s" })).toThrow();
  });
});
