import { describe, expect, it } from "vitest";
import { createComplexAnalysisDocument, parseComplexExpressionAst } from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import {
  adaptComplexRiemannSurfaceHandoffRelations,
  createComplexRiemannSurfaceHandoff,
  isComplexRiemannSurfaceHandoffCurrent,
  locateComplexRiemannSurfaceVertex,
} from "./complexRiemannSurfaceHandoff";

const makeDocument = () => {
  const parsed = parseComplexExpressionAst("sqrt(z)", ["z", "u", "v"]);
  if (!parsed.ast) throw new Error("fixture parse failed");
  return createComplexAnalysisDocument({
    function: { sourceText: "sqrt(z)", astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z", "u", "v"] },
    parameters: [], assumptions: [],
    domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns: 2, rows: 2, maximumSamples: 16, tolerance: 1e-8 },
    contours: [],
    branchPolicy: { profile: "custom", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 2, activeSheet: 0 },
    covering: null, mobius: null,
  }, { stableKey: "c11-handoff-fixture" });
};

describe("C11 Riemann-surface handoff", () => {
  it("adapts both C11 targets to shared relations", () => {
    const document = makeDocument();
    const registry = createInMemoryArtifactRegistry({ resolveSource: () => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision }) });
    const handoff = createComplexRiemannSurfaceHandoff({
      document, registry,
      positions: new Float32Array(24), indices: new Uint32Array(),
      scalarField: new Float32Array(8), quantity: "arg", columns: 2, rows: 2, sheetCount: 2,
      domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2 },
    });
    const relations = adaptComplexRiemannSurfaceHandoffRelations(handoff);

    expect(relations).toHaveLength(2);
    expect(new Set(relations.map((relation) => relation.relationId)).size).toBe(2);
    expect(relations.every((relation) => relation.sources[0]?.documentId === document.identity.id)).toBe(true);
    expect(relations.map((relation) => relation.parameters)).toEqual([
      expect.objectContaining({ targetModule: "Surfaces", relationshipKind: "derived-sheet-surface" }),
      expect.objectContaining({ targetModule: "Mesh", relationshipKind: "derived-analysis-mesh" }),
    ]);
    expect(handoff.relationships.map((relationship) => relationship.targetModule)).toEqual(["Surfaces", "Mesh"]);
  });

  it("publishes sheet mesh, seam, and scalar artifacts with two downstream relations", () => {
    const document = makeDocument();
    const registry = createInMemoryArtifactRegistry({ resolveSource: () => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision }) });
    const handoff = createComplexRiemannSurfaceHandoff({
      document, registry,
      positions: new Float32Array(24), indices: new Uint32Array([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]),
      scalarField: new Float32Array(8), quantity: "re", columns: 2, rows: 2, sheetCount: 2,
      domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2 },
    });
    expect(handoff.seams).toHaveLength(2);
    expect(handoff.relationships.map((entry) => entry.targetModule)).toEqual(["Surfaces", "Mesh"]);
    expect(registry.resolve(handoff.artifacts.sheetMesh, handoff.source).ok).toBe(true);
    expect(registry.resolve(handoff.artifacts.seams, handoff.source).ok).toBe(true);
    expect(registry.resolve(handoff.artifacts.scalarField, handoff.source).ok).toBe(true);
  });

  it("locates a sheet vertex back to function, AST, branch policy, source and generation", () => {
    const document = makeDocument();
    const registry = createInMemoryArtifactRegistry({ resolveSource: () => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision }) });
    const handoff = createComplexRiemannSurfaceHandoff({ document, registry, positions: new Float32Array(24), indices: new Uint32Array(), scalarField: new Float32Array(8), quantity: "arg", columns: 2, rows: 2, sheetCount: 2, domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2 } });
    const location = locateComplexRiemannSurfaceVertex(handoff, 7);
    expect(location).toMatchObject({ sheetIndex: 1, grid: { column: 1, row: 1 }, z: { re: 2, im: 2 }, functionSource: "sqrt(z)", generation: { quantity: "arg" } });
    expect(location?.normalizedAst).toEqual(document.function.normalizedAst);
    expect(location?.branchPolicy.sheetCount).toBe(2);
    expect(isComplexRiemannSurfaceHandoffCurrent(handoff, document)).toBe(true);
  });
});
