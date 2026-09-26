import { describe, expect, it } from "vitest";
import {
  createDocumentIdentity, createEmptyGraph2DDocument, createGraph2DDocument, normalizeGraph2DDocument,
  parseGraph2DDocument, serializeGraph2DDocument, GRAPH2D_DOCUMENT_FIELD_POLICY, type Graph2DDocument,
  parseGraph2DExpression,
} from "@math3d/core";
import goldenEmptyFixture from "./fixtures/graph2d-empty-v1.json";
import invalidUnknownFixture from "./fixtures/graph2d-invalid-unknown-v1.json";

const goldenEmpty = createEmptyGraph2DDocument("golden-empty");
const parsedExpression = parseGraph2DExpression("x^2");
if (!parsedExpression.ok) throw new Error("Invalid test expression");
const explicit = {
  id: "function_1", kind: "explicit-cartesian" as const, label: "Parabola",
  expression: { source: "x^2", variable: "x" as const, ast: parsedExpression.ast },
  domain: { min: -5, max: 5, includeMin: true, includeMax: true },
};
const withFunction = (): Graph2DDocument => {
  const source = { ...goldenEmpty.source, objects: [explicit] };
  return createGraph2DDocument({ source, stableKey: "golden-empty",
    identity: createDocumentIdentity(goldenEmpty.identity.id, source),
    selection: { objectId: explicit.id, probe: { objectId: explicit.id, x: 2, y: 4 } } });
};
const invalid = (value: unknown) => expect(normalizeGraph2DDocument(value).ok).toBe(false);

describe("Graph2D canonical document v1", () => {
  it("keeps the empty source identity and canonical round trip stable", () => {
    expect(goldenEmpty.identity.id).toBe("math3d:graph2d:e15c96fc460f6a70b2e6a6f00b940c00");
    expect(goldenEmpty.identity.structuralHash).toBe("sha256:495d171e43c897d9e27e949a3e98d742318889355f0f8e748e6e98007f076351");
    expect(parseGraph2DDocument(JSON.stringify(goldenEmptyFixture))).toEqual(goldenEmpty);
    expect(parseGraph2DDocument(serializeGraph2DDocument(goldenEmpty))).toEqual(goldenEmpty);
    expect(GRAPH2D_DOCUMENT_FIELD_POLICY.source).toBe("structural");
    expect(GRAPH2D_DOCUMENT_FIELD_POLICY.display).toBe("persistent-display");
    expect(normalizeGraph2DDocument(withFunction()).ok).toBe(true);
  });

  it("rejects unknown fields, reserved kinds, duplicate IDs, and display mismatches", () => {
    const valid = withFunction();
    invalid(invalidUnknownFixture);
    invalid({ ...valid, extra: true });
    invalid({ ...valid, source: { ...valid.source, objects: [{ ...explicit, kind: "polar" }] } });
    invalid({ ...valid, source: { ...valid.source, objects: [{ ...explicit, expression: { ...explicit.expression, source: "x^3" } }] } });
    invalid({ ...valid, source: { ...valid.source, objects: [explicit, explicit] } });
    invalid({ ...valid, source: { ...valid.source, objects: Array.from({ length: 65 }, (_, index) => ({ ...explicit, id: `function_${index}` })) } });
    invalid({ ...valid, display: { ...valid.display, objects: [] } });
    invalid({ ...valid, requiredCapabilities: ["graph2d.explicit.v2"] });
  });

  it("rejects non-finite values, oversized expressions, and forged hashes", () => {
    const valid = withFunction();
    invalid({ ...valid, source: { ...valid.source, objects: [{ ...explicit, domain: { ...explicit.domain, max: Infinity } }] } });
    invalid({ ...valid, display: { ...valid.display, viewport: { ...valid.display.viewport, xMin: NaN } } });
    invalid({ ...valid, source: { ...valid.source, objects: [{ ...explicit, expression: { ...explicit.expression, source: "x".repeat(2049) } }] } });
    invalid({ ...valid, identity: goldenEmpty.identity });
    expect(() => parseGraph2DDocument(" ".repeat(256 * 1024 + 1))).toThrow("size limit");
  });
});
