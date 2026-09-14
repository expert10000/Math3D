import { describe, expect, it } from "vitest";
import { buildDiagramFromPolygonWord, parsePolygonWord } from "../polygonWord";
import { buildQuotientPipeline } from "../quotientBuilder";
import type { FundamentalDiagram } from "../types";

describe("CW fundamental-group presentations", () => {
  it.each([
    ["torus", "a b a^-1 b^-1", 2, "Z^2"],
    ["projective plane", "a a", 1, "Z/2Z"],
    ["Klein bottle", "a b a^-1 b", 2, "Z ⊕ Z/2Z"],
  ])("derives %s presentation and exact abelianization", (_label, word, generatorCount, h1) => {
    const result = buildQuotientPipeline(buildDiagramFromPolygonWord(parsePolygonWord(word)));
    const presentation = result.fundamentalGroup;
    expect(presentation.status).toBe("exact");
    expect(presentation.value?.generators).toHaveLength(generatorCount);
    expect(presentation.value?.relators).toHaveLength(1);
    expect(presentation.value?.abelianization.notation).toBe(h1);
    expect(presentation.value?.abelianization.exactH1Notation).toBe(h1);
    expect(presentation.value?.abelianization.agreesWithExactH1).toBe(true);
    expect(presentation.value?.presentation).toContain("⟨");
  });

  it("retains a transparent free-reduction trace", () => {
    const loopPresentation: FundamentalDiagram = {
      id: "test/reduction-trace",
      name: "Reduction trace",
      vertices: [{ id: "v0", x: 0, y: 0 }],
      edges: [{ id: "e0", from: "v0", to: "v0" }, { id: "e1", from: "v0", to: "v0" }],
      faces: [{ id: "f0", boundary: [
        { edgeId: "e0", direction: 1 },
        { edgeId: "e0", direction: -1 },
        { edgeId: "e1", direction: 1 },
        { edgeId: "e1", direction: 1 },
      ] }],
      edgeOrientations: { e0: 1, e1: 1 },
      edgeLabels: { e0: "a", e1: "b" },
      edgePairings: { e0: [], e1: [] },
      vertexLabels: { v0: "base" },
      faceBoundaryWords: { f0: "a a^-1 b b" },
    };
    const result = buildQuotientPipeline(loopPresentation);
    const relator = result.fundamentalGroup.value?.relators[0];
    expect(relator?.steps[0]?.kind).toBe("tree-collapse");
    expect(relator?.steps.some((step) => step.kind === "free-cancellation")).toBe(true);
    expect(relator?.reducedWord).toMatch(/g\d g\d/);
    expect(result.fundamentalGroup.value?.abelianization.notation).toBe("Z ⊕ Z/2Z");
  });

  it("withholds a single-basepoint presentation for disconnected input", () => {
    const disconnected: FundamentalDiagram = {
      id: "test/disconnected",
      name: "Disconnected points",
      vertices: [{ id: "v0", x: -1, y: 0 }, { id: "v1", x: 1, y: 0 }],
      edges: [],
      faces: [],
      edgeOrientations: {},
      edgeLabels: {},
      edgePairings: {},
      vertexLabels: { v0: "A", v1: "B" },
      faceBoundaryWords: {},
    };
    const result = buildQuotientPipeline(disconnected).fundamentalGroup;
    expect(result.status).toBe("unsupported");
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("fundamental-group/unsupported-source");
  });
});
