import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument } from "@math3d/core";
import { graphSageSource } from "./graphSageSource";

describe("Graph Sage source provenance", () => {
  it("tracks expression, parameter, and assumption changes without reacting to selection", () => {
    const authored = applyGraph2DAuthoring(createEmptyGraph2DDocument("sage-graph-source"), {
      type: "create", draft: { label: "f", expression: "x^2 + 1",
        domain: { min: -10, max: 10, includeMin: true, includeMax: true },
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } },
    });
    const graph = createGraph2DDocument({ source: authored.source, display: authored.display,
      stableKey: "sage-graph-source" });
    const source = graphSageSource(graph, "function_1");
    expect(source?.expression).toBe("x^2 + 1");
    expect(graphSageSource({ ...graph, selection: { objectId: "function_1", probe: null } }, "function_1"))
      .toEqual(source);
    expect(graphSageSource({ ...graph, source: { ...graph.source,
      variables: [{ name: "a", value: 2 }] } }, "function_1")?.fingerprint).not.toBe(source?.fingerprint);
    expect(graphSageSource({ ...graph, source: { ...graph.source,
      assumptions: ["x > 0"] } }, "function_1")?.fingerprint).not.toBe(source?.fingerprint);
    expect(graphSageSource(graph, "missing")).toBeNull();
  });
});
