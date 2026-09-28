import { describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { sampleGraph2DScene, serializeGraph2DDocument, parseGraph2DDocument, structuralHash,
  migrateGraph2DDocument, inspectGraph2DCompatibility, Graph2DSamplingJobController, promoteGraph2DToCurve,
  revolveGraph2DProfile, extrudeGraph2DProfile, evaluateGraph2DPromotionGeometry, type Graph2DRegionArtifact } from "@math3d/core";
import { Graph2DPointTableStore } from "@math3d/core";
import { graph2DParityCorpus, graph2DParitySignature, recipes } from "../fixtures/graph2dParityCorpus";
import { mobileGraphAdvancedGeometry } from "../../apps/mobile/src/viewer/mobileGraphAdvancedProjection";
import { projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";
import { mobileGraphBudget } from "../../apps/mobile/src/models/mobileGraphPerformance";
import { importMobileGraph, readMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { applyMobileGraphAuthoring, mobileGraphAuthoringAction, mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";

describe("G2D34 portable visual/numerical/migration corpus (native runtime signoff separate)", () => {
  for (const fixture of graph2DParityCorpus()) it(`${fixture.id}: preserves source and meets independent geometry oracle`, () => {
    const { request, oracle } = fixture, before = serializeGraph2DDocument(request.document), series = sampleGraph2DScene(request);
    expect(series).toHaveLength(1); const artifact = series[0]!.artifact, points = artifact.segments.flatMap((segment) => segment.points);
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(request.document.display.sampling.maxSamples);
    expect(artifact.diagnostics.some((diagnostic) => diagnostic.code === "deadline")).toBe(false);
    expect(points.length).toBeGreaterThan(0); expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    const tolerance = recipes.tolerance.analyticResidual;
    for (const p of points) {
      if (oracle === "quadratic" || oracle === "data-gap") expect(Math.abs(p.y - p.x ** 2)).toBeLessThanOrEqual(tolerance);
      if (oracle === "pole") expect(Math.abs(p.y * p.x - 1)).toBeLessThanOrEqual(tolerance);
      if (oracle === "sqrt") { expect(p.x).toBeGreaterThanOrEqual(0); expect(Math.abs(p.y ** 2 - p.x)).toBeLessThanOrEqual(tolerance); }
      if (oracle === "polar-sqrt") { expect(p.parameter).toBeGreaterThanOrEqual(0); expect(Math.abs(p.x ** 2 + p.y ** 2 - p.parameter!)).toBeLessThanOrEqual(tolerance); }
      if (oracle === "tiny") expect(Math.abs(p.y - p.x / 1e-9)).toBeLessThanOrEqual(tolerance);
      if (oracle === "extreme") expect(Math.abs(p.y - p.x / 1e6)).toBeLessThanOrEqual(tolerance);
      if (oracle === "unit-circle" || oracle === "radius-two") expect(Math.abs(p.x ** 2 + p.y ** 2 - (oracle === "unit-circle" ? 1 : 4))).toBeLessThanOrEqual(tolerance);
      if (oracle === "implicit-circle" || oracle === "strict-disk") expect(Math.abs(p.x ** 2 + p.y ** 2 - 1)).toBeLessThanOrEqual(recipes.tolerance.implicitResidual);
      if (oracle === "jump") expect([-1, 1]).toContain(p.y);
    }
    if (["pole", "data-gap"].includes(oracle)) for (const segment of artifact.segments)
      expect(segment.points.some((p) => p.x < 0) && segment.points.some((p) => p.x > 0)).toBe(false);
    if (oracle === "jump") for (const segment of artifact.segments) expect(new Set(segment.points.map((p) => p.y)).size).toBe(1);
    if (["sqrt", "polar-sqrt"].includes(oracle)) { expect(artifact.converged).toBe(false); expect(artifact.diagnostics.some((entry) => entry.code === "unresolved-cell")).toBe(true); }
    if (["sqrt", "polar-sqrt"].includes(oracle)) for (const width of [320, 1100]) {
      const low = mobileGraphBudget(request.document, "low", "refine");
      const bounded = sampleGraph2DScene({ ...request, width, document: { ...request.document,
        display: { ...request.document.display, sampling: low.sampling } } });
      expect(bounded[0]!.artifact.samplesEvaluated).toBeLessThanOrEqual(low.samples);
      expect(bounded[0]!.artifact.segments.flatMap((segment) => segment.points).length).toBeGreaterThan(0);
    }
    if (oracle === "strict-disk") {
      const region = artifact as Graph2DRegionArtifact; expect(region.fills.length).toBeGreaterThan(0);
      expect(region.boundaries.every((boundary) => boundary.strict)).toBe(true);
      for (const fill of region.fills) expect(((fill.xMin + fill.xMax) / 2) ** 2 + ((fill.yMin + fill.yMax) / 2) ** 2).toBeLessThan(1);
    }
    const budget = mobileGraphBudget(request.document, "mid", "refine"), geometry = mobileGraphAdvancedGeometry(series, request.viewport, { width: request.width, height: request.height }, budget);
    const lines = projectMobileGraphLines(geometry.boundaries, request.viewport, { width: request.width, height: request.height }, null, budget.lines);
    expect(lines.length).toBeLessThanOrEqual(budget.lines); expect(geometry.fills.length).toBeLessThanOrEqual(budget.fills);
    expect(lines.every((line) => [line.a.x, line.a.y, line.b.x, line.b.y].every(Number.isFinite))).toBe(true);
    expect(readMobileGraph(importMobileGraph(before, [], `${fixture.id}.json`))).toEqual(request.document);
    expect(serializeGraph2DDocument(request.document)).toBe(before);
  });
  it("keeps migration, diagnostics, serialization and promotions independent of locale/timezone", () => {
    const corpus = graph2DParityCorpus(), reports = corpus.map(({ id, request }) => ({ id, document: parseGraph2DDocument(serializeGraph2DDocument(request.document)),
      artifact: graph2DParitySignature(sampleGraph2DScene(request)) }));
    const legacy = JSON.parse(readFileSync("packages/core/fixtures/graph2d/legacy-v0.json", "utf8")), migrated = migrateGraph2DDocument(legacy);
    expect(migrated.ok).toBe(true);
    const diagnostics = ["future", "corrupt", "unsupported-capability"].map((id) => inspectGraph2DCompatibility(JSON.parse(readFileSync(`packages/core/fixtures/graph2d/${id}.json`, "utf8"))));
    expect(diagnostics.map((entry) => entry.status)).toEqual(["unsupported", "corrupt", "unsupported"]);
    const document = corpus[0]!.request.document, id = document.source.objects[0]!.id;
    const promotions = [promoteGraph2DToCurve(document, id), revolveGraph2DProfile(document, id, { axis: "x", orientation: "positive" }),
      extrudeGraph2DProfile(document, id, { direction: [0, 0, 1], length: 2, caps: "none" })];
    for (const promotion of promotions) expect(evaluateGraph2DPromotionGeometry(promotion.document).positions.every(Number.isFinite)).toBe(true);
    const portable = { reports, migrated, diagnostics, promotions };
    // Locale-formatted input is not silently reinterpreted as portable numeric syntax.
    for (const locale of ["pl-PL", "ar-EG"]) expect(() => applyMobileGraphAuthoring(document, mobileGraphAuthoringAction({ objectId: null,
      draft: { ...mobileGraphFunctionDraft(document, null), min: new Intl.NumberFormat(locale).format(1.25) } }))).toThrow();
    if (process.env.GRAPH2D_CORPUS_REPORT) writeFileSync(process.env.GRAPH2D_CORPUS_REPORT, JSON.stringify({
      runtime: { node: process.version, locale: Intl.DateTimeFormat().resolvedOptions().locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, portable }));
  });
  it("rejects corrupted AST/source/table identity and future schemas without partial import", () => {
    for (const { request } of graph2DParityCorpus()) {
      const invalid = { ...request.document, identity: { ...request.document.identity, structuralHash: `sha256:${"0".repeat(64)}` } };
      expect(() => importMobileGraph(JSON.stringify(invalid), [], "corrupt")).toThrow();
      expect(() => importMobileGraph(JSON.stringify({ ...request.document, schemaVersion: 2 }), [], "future")).toThrow();
    }
    const explicit = graph2DParityCorpus()[0]!.request.document, tampered = JSON.parse(JSON.stringify(explicit));
    tampered.source.objects[0].expression.ast = { kind: "number", value: 123 };
    expect(() => importMobileGraph(JSON.stringify(tampered), [], "bad-ast")).toThrow();
    const data = graph2DParityCorpus().find((fixture) => fixture.id === "data-gap")!.request;
    const object = data.document.source.objects[0]!; if (object.kind !== "point-series") throw Error("Wrong data fixture");
    const backing = new Graph2DPointTableStore({ read: () => JSON.stringify([{ id: "row_1", x: 99, y: 99 }]), write: () => {} });
    expect(backing.resolve(object.table)).toBeNull();
    expect(sampleGraph2DScene({ ...data, pointTables: {} })[0]!.artifact).toMatchObject({ state: "missing-table", segments: [] });
  });
  it("never accepts stale or cancelled corpus work and exposes deadline exhaustion", () => {
    const jobs = new Graph2DSamplingJobController();
    for (const { id, request } of graph2DParityCorpus()) {
      const old = jobs.begin(id, "before"), latest = jobs.begin(id, request.document.identity.structuralHash);
      expect(jobs.settle(old, "before")).toBe("cancelled"); expect(jobs.settle(latest, "edited")).toBe("stale");
      const cancelled = jobs.begin(id, "cancelled"); jobs.cancel(cancelled.jobId); expect(jobs.settle(cancelled, "cancelled")).toBe("cancelled");
    }
    expect(jobs.activeCount).toBe(0);
    let now = 0; const clock = vi.spyOn(Date, "now").mockImplementation(() => ++now * 2000);
    try { const series = sampleGraph2DScene(graph2DParityCorpus()[0]!.request);
      expect(series[0]!.artifact).toMatchObject({ converged: false, diagnostics: [{ code: "deadline", count: 1 }] });
    } finally { clock.mockRestore(); }
  });
});
