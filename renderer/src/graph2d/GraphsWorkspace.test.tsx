import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument } from "@math3d/core";
import { recommendedWorkspaceDockLayout } from "../workspaceDocks";
import { GraphsWorkspace } from "./GraphsWorkspace";

const document = createEmptyGraph2DDocument("graphs-shell-test");
const dockLayout = recommendedWorkspaceDockLayout("graphs");

describe("Graphs workspace shell", () => {
  it("renders document-backed empty, loading, and error states", () => {
    const empty = renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} />);
    expect(empty).toContain("0 graph objects");
    expect(empty).toContain("No graph objects yet. Choose Add Graph to begin.");
    expect(empty).toContain('aria-label="Graph view essentials"');
    expect(empty).toContain('aria-label="Zoom in"');
    expect(empty).toContain("Fit selection");
    expect(empty).toContain("Fit all");
    expect(empty).toContain("Reset view");
    expect(empty).toContain("<summary>More</summary>");
    expect(empty).toContain('aria-label="Construction tools"');
    expect(empty).toContain('aria-label="Analysis"');
    expect(empty).toContain('aria-label="Export and presentation"');
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="loading" />))
      .toContain("Loading graph");
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="error" errorMessage="Invalid source" />))
      .toContain("Invalid source");
  });

  it("shows angular polar measurements instead of Cartesian interval actions", () => {
    const scene = applyGraph2DAuthoring(document, { type: "create-polar", draft: {
      label: "circle", rExpression: "2*cos(theta)",
      domain: { min: 0, max: Math.PI, includeMin: true, includeMax: true },
      style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } });
    const polar = createGraph2DDocument({ stableKey: "graphs-polar-shell", source: scene.source, display: scene.display,
      selection: { objectId: scene.source.objects[0]!.id, probe: null } });
    const markup = renderToStaticMarkup(<GraphsWorkspace document={polar} dockLayout={dockLayout} />);
    expect(markup).toContain('aria-label="Polar measurements"');
    expect(markup).toContain("Measure swept area");
    expect(markup).toContain("Measure polar arc length");
    expect(markup.indexOf('aria-label="Polar measurements"')).toBeLessThan(
      markup.indexOf('aria-label="Source and sampling details"'));
    expect(markup).toContain('aria-label="More actions for circle"');
    expect(markup).not.toContain('aria-label="Interval area"');
    expect(markup).not.toContain('aria-label="Arc length"');
    expect(markup).not.toContain('aria-label="Pairwise intersections"');
    expect(markup).not.toContain("Empty Cartesian graph scene");
  });
});
