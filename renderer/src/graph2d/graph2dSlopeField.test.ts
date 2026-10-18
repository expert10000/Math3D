import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, createGraph2DPublication,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, pickGraph2DProbe, queryGraph2DInspector,
  renderGraph2DPublicationCSV, renderGraph2DPublicationSVG, sampleGraph2DScene, sampleGraph2DSlopeField,
  selectionForGraph2DObject } from "@math3d/core";

const domain = { min: -2, max: 2, includeMin: true, includeMax: true };
const style = { color: "#0d9488", lineWidth: 1.5, lineStyle: "solid" as const, visible: true };
const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" as const };
const create = (expression: string) => {
  const empty = createEmptyGraph2DDocument("slope:" + expression);
  const scene = applyGraph2DAuthoring(empty, { type: "create-slope-field", draft: {
    label: "field", expression, domain, yDomain: domain, style } });
  return createGraph2DDocument({ ...scene, stableKey: "slope:" + expression });
};

describe("GRA-11.1 bounded slope fields", () => {
  it("persists the equation and capability, and rejects unknown coordinates", () => {
    const document = create("x-y");
    expect(document.requiredCapabilities).toContain("graph2d.slope-field.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(normalizeGraph2DDocument({ ...document, selection: { objectId: "slope_field_1",
      probe: { objectId: "slope_field_1", x: 0, y: 0 } } }).ok).toBe(false);
    expect(() => create("z")).toThrow();
    const object = document.source.objects[0]!;
    expect(object.kind).toBe("slope-field");
    expect(queryGraph2DInspector(document)?.expression).toBe("dy/dx = x-y");
  });

  it("makes horizontal segments for y'=0 and correct world slopes for y'=x", () => {
    for (const [expression, expected] of [["0", 0], ["x", null]] as const) {
      const object = create(expression).source.objects[0]!;
      if (object.kind !== "slope-field") throw new Error("Expected slope field.");
      const artifact = sampleGraph2DSlopeField({ object, variables: {}, viewport, width: 192, height: 192, maxSamples: 64 });
      expect(artifact.segments).toHaveLength(16);
      expect(artifact.samplesEvaluated).toBe(16);
      for (const segment of artifact.segments) {
        const [a, b] = segment.points;
        const x = (a!.x + b!.x) / 2;
        const slope = (b!.y - a!.y) / (b!.x - a!.x);
        expect(slope).toBeCloseTo(expected ?? x, 10);
      }
    }
  });

  it("gaps singular cells, obeys the glyph budget, and cannot probe a direction as a solution", () => {
    const document = create("1/x");
    const object = document.source.objects[0]!;
    if (object.kind !== "slope-field") throw new Error("Expected slope field.");
    const artifact = sampleGraph2DSlopeField({ object, variables: {}, viewport, width: 144, height: 144, maxSamples: 32 });
    expect(artifact.samplesEvaluated).toBe(9);
    expect(artifact.segments).toHaveLength(6);
    expect(artifact.diagnostics).toContainEqual({ code: "invalid-sample", count: 3 });
    expect(sampleGraph2DSlopeField({ object, variables: {}, viewport: { ...viewport, xMin: 0.1,
      yMin: 0.1, xScale: "log10", yScale: "log10" }, width: 144, height: 144,
      maxSamples: 32 }).diagnostics).toContainEqual({ code: "unsupported-scale", count: 1 });
    expect(sampleGraph2DSlopeField({ object, variables: {}, viewport, width: 2000, height: 2000,
      maxSamples: 32 }).samplesEvaluated).toBeLessThanOrEqual(32);
    const sampled = sampleGraph2DScene({ document, viewport, width: 144, height: 144, interaction: false });
    expect(sampled[0]?.artifact.segments).toHaveLength(6);
    expect(selectionForGraph2DObject(document, sampled, object.id)).toEqual({ objectId: object.id, probe: null });
    expect(pickGraph2DProbe({ document, series: sampled, viewport, size: { width: 144, height: 144 },
      screen: { x: 50, y: 50 } }).selection.probe).toBeNull();
  });

  it("publishes isolated direction segments with the original equation", () => {
    const publication = createGraph2DPublication({ document: create("x-y"), size: { width: 192, height: 192 },
      viewport, deterministic: true });
    expect(publication.metadata.objects[0]?.kind).toBe("slope-field");
    expect(publication.series[0]?.artifact.segments.length).toBeGreaterThan(0);
    expect(renderGraph2DPublicationSVG(publication)).toContain('&quot;source&quot;:&quot;x-y&quot;');
    expect(renderGraph2DPublicationCSV(publication)).toContain('"slope_field_1"');
  });
});
