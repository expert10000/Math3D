import { describe, expect, it } from "vitest";
import {
  COMPLEX_COMMAND_TYPES,
  createAnalysisResultEnvelope,
  createComplexPersistenceRecord,
  createComplexStructuredNotebookExport,
  deserializeComplexPersistenceRecord,
  migrateComplexPersistence,
  parseComplexExpressionAst,
  serializeComplexPersistenceRecord,
  type ComplexAnalysisDocument,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { ComplexFunctionPreviewSession } from "./complexPreviewArtifacts";
import { ComplexAnalysisCommandAdapter } from "./complexCommandAdapter";

const spec = () => ({ inputMode: "fz" as const, fExpr: "exp(z)", reExpr: "u", imExpr: "v", uMin: -2, uMax: 2, vMin: -2, vMax: 2, nu: 64, nv: 64, mapMode: "standard" as const, sheetCount: 1, sheetIndex: 0, branchCutAngle: Math.PI });
const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision });

describe("C09 replayable Complex persistence", () => {
  it("preserves define -> explore -> analyze -> save -> reopen -> replay identity", () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const parsed = parseComplexExpressionAst("1/z", ["z"]);
    session.commands.commitFunction("1/z", ["z"]);
    session.commands.commit(COMPLEX_COMMAND_TYPES.setContours, [{
      contourId: "saved-circle", kind: "circle", points: [{ re: 1, im: 0 }, { re: 0, im: 1 }, { re: -1, im: 0 }, { re: 0, im: -1 }, { re: 1, im: 0 }], center: { re: 0, im: 0 }, radius: 1, innerRadius: null, closed: true, winding: 1,
    }]);
    const document = session.commands.document();
    expect(parsed.ast).toEqual(document.function.normalizedAst);
    const source = sourceOf(document);
    const result = createAnalysisResultEnvelope({
      resultId: "saved-exact-residue", status: "exact",
      provenance: { source, operation: { type: "complex.exact-residue-series", algorithm: "fixture", algorithmVersion: "1", parameters: {} }, engine: { name: "Math3D exact Complex kernel", version: "1.0.0" }, elapsedMs: 1 },
      summary: { residue: "1" }, warnings: [], diagnostics: [],
      artifacts: [{ artifactId: "complex-preview:saved", kind: "sampled-grid", role: "complex-preview/high/domain-coloring" }],
    });
    const record = createComplexPersistenceRecord({ document, replay: session.commands.exportReplay(), results: [result] });
    const loaded = deserializeComplexPersistenceRecord(serializeComplexPersistenceRecord(record));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const restored = ComplexAnalysisCommandAdapter.restore(loaded.value.replay);
    expect(restored.document().identity).toEqual(document.identity);
    expect(loaded.value.results[0]?.status).toBe("exact");
    expect(loaded.value.artifacts[0]).toMatchObject({ state: "unavailable", reason: "payload-not-embedded" });
    expect(restored.undo()?.function.sourceText).toBe("1/z");
    expect(restored.redo()?.contours).toHaveLength(1);
  });

  it("marks external engines needs-compute and exports structured AST requests only", () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const document = session.commands.document();
    const source = sourceOf(document);
    const sage = createAnalysisResultEnvelope({
      resultId: "sage-derivative", status: "exact", provenance: { source, operation: { type: "complex.sage-analysis", algorithm: "sage", algorithmVersion: "1", parameters: {} }, engine: { name: "SageMath", version: "10.8" }, elapsedMs: 1 },
      summary: { derivative: "exp(z)" }, warnings: [], diagnostics: [], artifacts: [],
    });
    const record = createComplexPersistenceRecord({ document, replay: session.commands.exportReplay(), results: [sage] });
    expect(record.engines).toEqual([{ name: "SageMath", version: "10.8", state: "needs-compute" }]);
    const notebook = createComplexStructuredNotebookExport(record.document);
    const serialized = JSON.stringify(notebook);
    expect(notebook.requests.map((request) => request.operation)).toEqual(["derivative", "poles", "residue", "series"]);
    expect(serialized).not.toMatch(/sourceText|python|shell|eval/i);
  });

  it("migrates a legacy document without fabricating replayed result availability", () => {
    const document = new ComplexFunctionPreviewSession(spec()).commands.document();
    const migrated = migrateComplexPersistence(document);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.replay.transactions).toEqual([]);
    expect(migrated.value.results).toEqual([]);
    expect(migrated.value.document.provenance.diagnostics.at(-1)?.code).toBe("complex.persistence-migrated");
  });

  it("rejects replay divergence and fabricated artifact availability", () => {
    const session = new ComplexFunctionPreviewSession(spec());
    session.commands.commitFunction("1/z", ["z"]);
    const record = createComplexPersistenceRecord({ document: session.commands.document(), replay: session.commands.exportReplay() });
    const divergent = structuredClone(record) as any;
    divergent.replay.transactions[0].commands[0].command.payload.value.sourceText = "exp(z)";
    expect(deserializeComplexPersistenceRecord(JSON.stringify(divergent)).ok).toBe(false);
  });
});
