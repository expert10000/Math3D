import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  queryGraph2DInspector, sampleGraph2DExplicit } from "@math3d/core";

describe("Graph2D inspector query", () => {
  const empty = createEmptyGraph2DDocument("inspector");
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: {
    label: "Parabola", expression: "x^2", domain: { min: -3, max: 3, includeMin: true, includeMax: true },
    style: { visible: true, color: "#ff0000", lineWidth: 3, lineStyle: "dotted" } } });
  const document = createGraph2DDocument({ stableKey: "inspector", source: scene.source, display: scene.display,
    selection: { objectId: "function_1", probe: { objectId: "function_1", x: 2, y: 4 } } });
  const artifact = sampleGraph2DExplicit({ ast: document.source.objects[0]!.expression.ast,
    domain: document.source.objects[0]!.domain, viewport: document.display.viewport, width: 800, height: 600,
    policy: document.display.sampling });

  it("reports observed sampling, floating-point probe method, and source provenance", () => {
    const summary = queryGraph2DInspector(document, { objectId: "function_1", artifact });
    expect(summary?.probeMethod).toBe("direct-expression-floating-point");
    expect(summary?.style.lineStyle).toBe("dotted");
    expect(summary?.sampling.status).toBe("converged");
    expect(summary?.sampling.samplesEvaluated).toBeGreaterThan(0);
    expect(summary?.provenance.structuralHash).toBe(document.identity.structuralHash);
    expect(summary?.provenance.samplerVersion).toBe(artifact.samplerVersion);
  });

  it("distinguishes incomplete, hidden, and mismatched observations", () => {
    const incomplete = { ...artifact, converged: false,
      diagnostics: [{ code: "suspected-jump" as const, count: 2 }, { code: "sample-limit" as const, count: 1 }] };
    const summary = queryGraph2DInspector(document, { objectId: "function_1", artifact: incomplete });
    expect(summary?.sampling.status).toBe("incomplete");
    expect(summary?.sampling.suspectedJumpCount).toBe(2);
    expect(queryGraph2DInspector(document, { objectId: "other", artifact })?.sampling.status).toBe("unavailable");
    const hidden = { ...document, display: { ...document.display, objects: [{ ...document.display.objects[0]!, visible: false }] } };
    expect(queryGraph2DInspector(hidden, { objectId: "function_1", artifact })?.sampling.status).toBe("unavailable");
  });
});
