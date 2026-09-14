import { describe, expect, it } from "vitest";
import { buildQuotientPipeline } from "./quotientBuilder";
import {
  buildDiagramFromPolygonWord,
  buildNonOrientableGenusWord,
  buildOrientableGenusWord,
  classifyPolygonWord,
  parsePolygonWord,
  reviewPolygonWord,
} from "./polygonWord";

describe("polygonWord helpers", () => {
  it("builds torus quotient from aba^-1b^-1", () => {
    const edges = parsePolygonWord("a b a^-1 b^-1");
    const diagram = buildDiagramFromPolygonWord(edges);
    const result = buildQuotientPipeline(diagram);
    expect(result.quotient.invariants?.eulerCharacteristic).toBe(0);
    expect(result.quotient.invariants?.vertexCount).toBe(1);
    expect(result.quotient.invariants?.edgeCount).toBeGreaterThanOrEqual(2);
    expect(result.quotient.invariants?.faceCount).toBeGreaterThanOrEqual(1);
  });

  it("builds projective-plane quotient from aa", () => {
    const edges = parsePolygonWord("a a");
    const diagram = buildDiagramFromPolygonWord(edges);
    const result = buildQuotientPipeline(diagram);
    expect(result.quotient.invariants?.eulerCharacteristic).toBe(1);
    expect(result.quotient.invariants?.vertexCount).toBe(1);
    expect(result.quotient.invariants?.edgeCount).toBe(1);
    expect(result.quotient.invariants?.faceCount).toBe(1);
    expect(result.realizations.some((entry) => entry.id.endsWith("/realization/projective-immersed"))).toBe(true);
  });

  it("generates canonical orientable genus words", () => {
    const edges = buildOrientableGenusWord(2);
    expect(edges.map((entry) => `${entry.label}${entry.orientation < 0 ? "^-1" : ""}`)).toEqual([
      "a1",
      "b1",
      "a1^-1",
      "b1^-1",
      "a2",
      "b2",
      "a2^-1",
      "b2^-1",
    ]);
    const classification = classifyPolygonWord(edges);
    expect(classification.kind).toBe("orientable-genus");
    if (classification.kind === "orientable-genus") {
      expect(classification.genus).toBe(2);
    }
  });

  it("generates canonical nonorientable genus words", () => {
    const edges = buildNonOrientableGenusWord(3);
    expect(edges.map((entry) => `${entry.label}${entry.orientation < 0 ? "^-1" : ""}`)).toEqual([
      "a1",
      "a1",
      "a2",
      "a2",
      "a3",
      "a3",
    ]);
    const classification = classifyPolygonWord(edges);
    expect(classification.kind).toBe("nonorientable-genus");
    if (classification.kind === "nonorientable-genus") {
      expect(classification.genus).toBe(3);
    }
  });

  it("reviews occurrences and withholds malformed words", () => {
    const torus = reviewPolygonWord("a b a^-1 b^-1");
    expect(torus.canBuild).toBe(true);
    expect(torus.classification?.kind).toBe("torus");
    expect(torus.occurrences[0]?.peerIndices).toEqual([2]);
    expect(torus.labels.every((entry) => entry.status === "paired")).toBe(true);

    const malformed = reviewPolygonWord("a b$ a^-1");
    expect(malformed.canBuild).toBe(false);
    expect(malformed.classification).toBeNull();
    expect(malformed.diagnostics.some((entry) => entry.code === "invalid-token")).toBe(true);
  });

  it("marks unpaired and multiply identified labels transparently", () => {
    const review = reviewPolygonWord("a b b c c c");
    expect(review.canBuild).toBe(true);
    expect(review.labels.find((entry) => entry.label === "a")?.status).toBe("boundary");
    expect(review.labels.find((entry) => entry.label === "c")?.status).toBe("overused");
  });
});
