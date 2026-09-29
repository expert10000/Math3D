import { describe, expect, it } from "vitest";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { GRAPH2D_DEFAULT_GRID_OPTIONS as defaults, graph2DGridFields, graph2DAxesFromGridFields, isGraph2DGridOptions,
  projectGraph2DGrid, projectGraph2DPolarGrid, instantiateGraph2DPreset, getGraph2DPresetCatalog, serializeGraph2DDocument,
  parseGraph2DDocument, inspectGraph2DCompatibility, graph2DScaleFields, graph2DViewportFromScaleFields,
  createGraph2DPublication, projectGraph2DPublicationGeometry } from "@math3d/core";
const scene = () => instantiateGraph2DPreset(getGraph2DPresetCatalog().get("translated-quadratic")!, "grid-test").document;
const size = { width: 800, height: 600 }, viewport = { xMin: -4, xMax: 4, yMin: -3, yMax: 3, aspect: "free" as const };
describe("G2D41 display-only portable grid policy", () => {
  it("preserves absent legacy intent and exact source identity through save/history", () => {
    const original = scene(), bytes = serializeGraph2DDocument(original), adapter = new Graph2DCommandAdapter(original);
    expect(bytes).not.toContain("gridOptions"); expect(parseGraph2DDocument(bytes).display.axes.gridOptions).toBeUndefined();
    const axes = graph2DAxesFromGridFields(original, { ...graph2DGridFields(original), xStep: "0.5", contrast: "strong", labels: false });
    const next = adapter.commitScene({ source: original.source, selection: original.selection, display: { ...original.display, axes } }, "style");
    expect(next.identity).toEqual(original.identity); expect(next.source).toEqual(original.source); expect(next.display.viewport).toEqual(original.display.viewport);
    expect(next.requiredCapabilities).toContain("graph2d.grid.v1"); expect(inspectGraph2DCompatibility(next).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(next)).display.axes).toEqual(axes);
    expect(serializeGraph2DDocument(adapter.undo()!)).toBe(bytes); expect(adapter.redo()!.display.axes).toEqual(axes);
    expect(() => parseGraph2DDocument(JSON.stringify({ ...next, requiredCapabilities: original.requiredCapabilities }))).toThrow();
  });
  it.each(["0", "-1", "Infinity", "1e-101", "1e101", "0,5", "1+1"])("rejects invalid manual spacing %s without mutation", xStep => {
    const original = scene(), bytes = serializeGraph2DDocument(original);
    expect(() => graph2DAxesFromGridFields(original, { ...graph2DGridFields(original), xStep })).toThrow(); expect(serializeGraph2DDocument(original)).toBe(bytes);
  });
  it("rejects unknown option keys and nonboolean flags", () => {
    expect(isGraph2DGridOptions({ ...defaults, extra: true }, viewport)).toBe(false);
    expect(isGraph2DGridOptions({ ...defaults, minor: "true" }, viewport)).toBe(false);
    expect(() => projectGraph2DGrid(viewport, size, { ...defaults, xStep: 0 })).toThrow();
  });
  it("uses authored world units for manual lines and can remove subdivisions", () => {
    const grid = projectGraph2DGrid(viewport, size, { ...defaults, xStep: 1, yStep: 1.5, minor: false });
    expect(grid.verticalMajor.map(t => t.value)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(grid.horizontalMajor.map(t => t.value)).toEqual([-3, -1.5, 0, 1.5, 3]);
    expect(grid.verticalMinor).toEqual([]); expect(grid.horizontalMinor).toEqual([]); expect(grid.warnings).toBeUndefined();
  });
  it("changes Auto density without changing the viewport", () => {
    const sparse = projectGraph2DGrid(viewport, size, { ...defaults, density: "sparse" });
    const dense = projectGraph2DGrid(viewport, size, { ...defaults, density: "dense" });
    expect(dense.verticalMajor.length).toBeGreaterThan(sparse.verticalMajor.length); expect(viewport.xMin).toBe(-4);
  });
  it("omits an unreadable manual grid instead of drawing a misleading prefix", () => {
    const grid = projectGraph2DGrid(viewport, size, { ...defaults, xStep: 1e-100 });
    expect(grid.verticalSuppressed).toBe(true); expect(grid.verticalMinor).toEqual([]); expect(grid.verticalMajor.length).toBeLessThan(200);
    expect(grid.warnings?.join(" ")).toMatch(/Manual X.*omitted.*Auto/);
  });
  it("terminates even when a minor tick's integer index cannot advance at large offsets", () => {
    const distant = { ...viewport, xMin: 1e12, xMax: 1e12 + .001 };
    const legacy = projectGraph2DGrid(distant, size), configured = projectGraph2DGrid(distant, size, defaults);
    expect(legacy.verticalMinor).toEqual([]); expect(configured.warnings?.join(" ")).toMatch(/numerical resolution/);
    expect(configured.verticalMajor.length).toBeLessThanOrEqual(200);
    const unsafeMajor = projectGraph2DGrid({ ...viewport, xMin: 1e15, xMax: 1e15 + .25 }, size, defaults);
    expect(unsafeMajor.verticalMajor).toEqual([]); expect(unsafeMajor.warnings?.join(" ")).toMatch(/numbers omitted/);
  });
  it("preserves decade semantics and rejects fractional manual log intervals", () => {
    const log = { ...viewport, xMin: .01, xMax: 1e4, xScale: "log10" as const };
    expect(projectGraph2DGrid(log, size, { ...defaults, xStep: 2 }).verticalMajor.map(t => t.value)).toEqual([.01, 1, 100, 10000]);
    expect(projectGraph2DGrid(log, size, { ...defaults, xStep: 2 }).verticalMinor).toContain(400); // x=10, an intermediate decade
    expect(isGraph2DGridOptions({ ...defaults, xStep: .5 }, log)).toBe(false);
    const doc = scene(), configured = { ...doc, display: { ...doc.display, axes: { ...doc.display.axes, gridOptions: { ...defaults, xStep: .5 } } } };
    expect(() => graph2DViewportFromScaleFields(configured, { ...graph2DScaleFields(doc.display.viewport), xScale: "log10", xMin: ".1", xMax: "100", aspect: "free" })).toThrow(/Auto/);
  });
  it("filters minor log detail across the entire legal range, not a truncated left prefix", () => {
    const grid = projectGraph2DGrid({ ...viewport, xMin: 1e-100, xMax: 1e100, xScale: "log10" }, { width: 1600, height: 600 }, defaults);
    expect(grid.verticalMinor.some(pixel => pixel > 1500)).toBe(true); expect(grid.verticalMinor.length).toBeLessThanOrEqual(1000);
  });
  it("uses bounded Auto polar rings with world-unit aspect", () => {
    const polar = projectGraph2DPolarGrid(viewport, size, { ...defaults, density: "dense" });
    expect(polar.majorRings.length).toBeGreaterThan(0); expect(polar.minorRings.length).toBeLessThanOrEqual(64); expect(polar.majorRays).toHaveLength(12);
    expect(polar.majorRings[0].rx).toBeCloseTo(polar.majorRings[0].ry);
    expect(() => projectGraph2DPolarGrid(viewport, size, { ...defaults, xStep: 1 })).toThrow(/Auto/);
  });
  it("retains suppression notices in publication metadata and respects grid visibility", () => {
    const doc = scene(), axes = graph2DAxesFromGridFields(doc, { ...graph2DGridFields(doc), xStep: "1e-100", contrast: "strong" });
    const configured = new Graph2DCommandAdapter(doc).commitScene({ source: doc.source, selection: doc.selection, display: { ...doc.display, axes } }, "style");
    const publication = createGraph2DPublication({ document: configured, size });
    expect(publication.metadata.warnings.join(" ")).toMatch(/Manual X.*omitted/);
    const hidden = { ...configured, display: { ...configured.display, axes: { ...axes, grid: false, x: false, y: false, labels: false } } };
    expect(projectGraph2DPublicationGeometry(hidden, [], size).primitives).toEqual([]);
  });
});
