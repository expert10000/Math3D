import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createGraph2DDocument, parseGraph2DExpression, sampleGraph2DExplicit } from "@math3d/core";
import { formatGraph2DTick, projectGraph2DGrid } from "./gridProjection";
import { Graph2DPlot } from "./Graph2DPlot";

describe("Graph2D render projection", () => {
  it("produces stable major/minor ticks and readable labels", () => {
    const grid = projectGraph2DGrid({ xMin: -4, xMax: 4, yMin: -3, yMax: 3, aspect: "free" }, { width: 800, height: 600 });
    expect(grid.verticalMajor.map((tick) => tick.label)).toEqual(["-4", "-3", "-2", "-1", "0", "1", "2", "3", "4"]);
    expect(grid.xAxis).toBe(300);
    expect(grid.yAxis).toBe(400);
    expect(grid.verticalMinor.length).toBeGreaterThan(grid.verticalMajor.length);
    expect(formatGraph2DTick(-0)).toBe("0");
    expect(formatGraph2DTick(1e-7)).toBe("1e-7");
  });

  it("renders clipped artifact paths with source style without parsing expressions", () => {
    const parsed = parseGraph2DExpression("x");
    if (!parsed.ok) throw new Error("Invalid fixture expression");
    const document = createGraph2DDocument({ stableKey: "plot-fixture", source: { objects: [{ id: "line", kind: "explicit-cartesian",
      label: "Line", expression: { source: "x", variable: "x", ast: parsed.ast },
      domain: { min: -2, max: 2, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
    const display = { ...document.display, viewport: { xMin: -4, xMax: 4, yMin: -3, yMax: 3, aspect: "free" as const } };
    const size = { width: 800, height: 600 };
    const artifact = sampleGraph2DExplicit({ ast: parsed.ast, domain: document.source.objects[0]!.domain,
      viewport: display.viewport, width: size.width, height: size.height, policy: display.sampling });
    const svg = renderToStaticMarkup(<Graph2DPlot display={display} size={size} series={[{ objectId: "line", artifact, style: display.objects[0]! }]} />);
    expect(svg).toContain('data-graph2d-path="line"');
    expect(svg).toContain('stroke="#2563eb"');
    expect(svg).toContain('M200.00,500.00');
    expect(svg).toContain('600.00,100.00');
    expect(svg).toContain('clipPath');
  });
});
