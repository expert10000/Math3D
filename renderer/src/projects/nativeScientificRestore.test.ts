import { describe, expect, it } from "vitest";
import { COMPLEX_COMMAND_TYPES, createComplexAnalysisDocument, createDocumentIdentity, createMath3DProject, createMixedWorkspaceDocument, createTopologyDocument, parseComplexExpressionAst, type ComplexAnalysisStructuralSource } from "@math3d/core";
import { ComplexAnalysisCommandAdapter } from "../math/complexCommandAdapter";
import { ComplexFunctionPreviewSession } from "../math/complexPreviewArtifacts";
import { TopologyDiagramCommandAdapter } from "../topology/topologyCommandAdapter";
import { TOPOLOGY_PRESETS } from "../topology/presets";
import { complexEditorSeed, complexSourceFromEditor, scientificDocumentEditable, topologyEditorSeed } from "./nativeScientificRestore";
import { inspectProjectCompatibility } from "./projectTransfer";

const source = (): ComplexAnalysisStructuralSource => ({
  function: { sourceText: "sqrt(z)", astVersion: 1, normalizedAst: parseComplexExpressionAst("sqrt(z)", ["z"]).ast!, allowedVariables: ["z"] },
  parameters: [], assumptions: [], domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
  sampling: { strategy: "uniform-grid", columns: 32, rows: 24, maximumSamples: 4096, tolerance: 1e-6 },
  contours: [{ contourId: "saved-loop", kind: "circle", points: [], center: { re: 0, im: 0 }, radius: 1, innerRadius: null, closed: true, winding: 1 }],
  branchPolicy: { profile: "sqrt", cut: { kind: "negative-real-axis", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 2, activeSheet: 1 }, covering: null, mobius: null,
});
const complex = () => createComplexAnalysisDocument(source(), { stableKey: "restored-complex" });
const topology = () => new TopologyDiagramCommandAdapter(TOPOLOGY_PRESETS[0]!.buildDiagram()).document();

describe("PRJ13 native scientific project restoration", () => {
  it("opens Complex without rewriting its AST variables, contours, branch profile, sampling or generation", async () => {
    const document = complex(), commands = new ComplexAnalysisCommandAdapter(document), seed = complexEditorSeed(document);
    const session = new ComplexFunctionPreviewSession(seed, commands, complexSourceFromEditor);
    expect(session.synchronize(seed)).toEqual({ document });
    await session.build("low");
    expect(commands.document()).toEqual(document);
    expect(commands.history().undoDepth).toBe(0);
    commands.commitCandidate(complexSourceFromEditor(document, { ...seed, fExpr: "z*z" }));
    expect(commands.document().contours).toEqual(document.contours);
    expect(commands.document().branchPolicy).toEqual(document.branchPolicy);
    expect(commands.document().sampling).toEqual(document.sampling);
    expect(commands.document().identity.id).toBe(document.identity.id);
  });
  it("retains Topology identity, source extras, provenance and history across checkpoint/replay open", () => {
    const original = topology();
    const model = structuredClone(original.source.model) as any;
    model.faces[0].boundary[0].researchLabel = "retained boundary annotation";
    const savedSource = { ...original.source, model: { ...model, researchNote: "retained" } };
    const document = createTopologyDocument({ ...original, source: savedSource, identity: createDocumentIdentity(original.identity.id, savedSource) });
    const adapter = TopologyDiagramCommandAdapter.fromDocument(document);
    expect(adapter.document()).toEqual(document);
    const diagram = topologyEditorSeed(document);
    adapter.commit({ ...diagram, name: "edited torus" }); adapter.undo(); adapter.redo();
    const restored = TopologyDiagramCommandAdapter.restore(adapter.exportReplay());
    expect(restored.document()).toEqual(adapter.document());
    expect(restored.document().source.model.researchNote).toBe("retained");
    expect((restored.document().source.model as any).faces[0].boundary[0].researchLabel).toBe("retained boundary annotation");
    expect(restored.undo()?.name).toBe(diagram.name);
  });
  it("preserves Complex live revisions, redo cursor and continued edit IDs after branching/reopen", () => {
    const adapter = new ComplexAnalysisCommandAdapter(complex());
    adapter.commitFunction("z"); adapter.commitFunction("z*z"); adapter.undo(); adapter.redo(); adapter.undo();
    let restored = ComplexAnalysisCommandAdapter.restore(adapter.exportReplay());
    expect(restored.document()).toEqual(adapter.document());
    expect(restored.history().redoDepth).toBe(1);
    restored.commitFunction("exp(z)");
    const bundle = restored.exportReplay();
    expect(new Set(bundle.transactions.map((entry) => entry.transactionId)).size).toBe(bundle.transactions.length);
    const next = ComplexAnalysisCommandAdapter.restore(bundle);
    expect(next.document()).toEqual(restored.document()); next.undo(); next.redo();
    restored = ComplexAnalysisCommandAdapter.restore(next.exportReplay());
    expect(restored.document()).toEqual(next.document());
  });
  it("checkpoints intent state without claiming old source undo remains available", () => {
    const adapter = new ComplexAnalysisCommandAdapter(complex()); adapter.commitFunction("1/z");
    adapter.requestAnalysis("analysis:saved", "complex.residue");
    expect(adapter.history().undoDepth).toBe(0);
    const restored = ComplexAnalysisCommandAdapter.restore(adapter.exportReplay());
    expect(restored.state()).toEqual(adapter.state());
    expect(restored.undo()).toBeNull();
    restored.commitFunction("exp(z)");
    expect(ComplexAnalysisCommandAdapter.restore(restored.exportReplay()).state()).toEqual(restored.state());
  });
  it("bounds Complex replay to the same 100-edit window as native history", () => {
    const adapter = new ComplexAnalysisCommandAdapter(complex());
    for (let index = 0; index < 105; index++) adapter.commitFunction(`z+${index}`);
    const replay = adapter.exportReplay(); expect(replay.transactions).toHaveLength(100);
    const restored = ComplexAnalysisCommandAdapter.restore(replay); expect(restored.document()).toEqual(adapter.document());
    for (let index = 0; index < 100; index++) expect(restored.undo()).not.toBeNull();
    expect(restored.undo()).toBeNull();
    expect(ComplexAnalysisCommandAdapter.restore(restored.exportReplay()).document()).toEqual(restored.document());
  }, 30_000);
  it("keeps stale Complex results qualified through edit, undo and replay", () => {
    const original = complex();
    const document = createComplexAnalysisDocument(source(), { id: original.identity.id, results: [{ resultId: "saved-result", resultType: "complex.residue", sourceRevision: original.identity.revision, sourceHash: original.identity.structuralHash, state: "available" }] });
    const adapter = new ComplexAnalysisCommandAdapter(document); adapter.commitFunction("z"); adapter.undo();
    const restored = ComplexAnalysisCommandAdapter.restore(adapter.exportReplay());
    expect(restored.document().results[0]!.state).toBe("unavailable");
    expect(restored.document().provenance).toEqual(document.provenance);
  });
  it("qualifies supported Topology/Complex projects and rejects incompatible sources without editing them", () => {
    const documents = [topology(), complex()];
    const workspace = createMixedWorkspaceDocument({ entries: documents.map((document) => ({ module: document.format === "math3d.topology-document" ? "topology" : "complex", checkpoint: document, expected: document.identity, replay: null })), activeDocumentIds: documents.map((document) => document.identity.id), results: [], relations: [], artifacts: [], constructions: [], committedSelection: null });
    expect(inspectProjectCompatibility(createMath3DProject(workspace, { stableKey: "scientific-native", title: "scientific native" })).canOpenWorkspace).toBe(true);
    const incompatible = createComplexAnalysisDocument({ ...source(), covering: { kind: "power", degree: 2, fiberWindow: 1, deckShift: 0 } }, { stableKey: "unsupported-complex" });
    const bytes = JSON.stringify(incompatible); expect(scientificDocumentEditable(incompatible)).toBe(false); expect(JSON.stringify(incompatible)).toBe(bytes);
    const malformedSource = { ...topology().source, model: { id: "bad" } };
    const malformed = createTopologyDocument({ ...topology(), source: malformedSource, identity: createDocumentIdentity(topology().identity.id, malformedSource) });
    expect(scientificDocumentEditable(malformed)).toBe(false);
    const adapter = new ComplexAnalysisCommandAdapter(complex());
    expect(() => adapter.commit(COMPLEX_COMMAND_TYPES.setContours, [{ broken: true }])).toThrow();
    expect(adapter.document()).toEqual(complex());
    expect(() => adapter.commitCandidate({ ...source(), function: { ...source().function, sourceText: "z", normalizedAst: parseComplexExpressionAst("z", ["z"]).ast! }, domain: { re: { min: 4, max: -4 }, im: source().domain.im, exclusions: [] } })).toThrow();
    expect(adapter.document()).toEqual(complex());
  });
});
