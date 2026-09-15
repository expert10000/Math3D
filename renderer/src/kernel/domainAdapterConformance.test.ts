import { describe, expect, it } from "vitest";
import {
  createComplexAnalysisDocument,
  parseComplexExpressionAst,
  type CanonicalJsonValue,
  type ComplexAnalysisStructuralSource,
} from "@math3d/core";
import {
  runDomainAdapterConformance,
  runSelectionConformance,
  type DomainAdapterConformanceFixture,
  type SelectionConformanceFixture,
} from "@math3d/kernel";
import { ComplexAnalysisCommandAdapter } from "../math/complexCommandAdapter";
import {
  createUnifiedSelectionSet,
  unifiedSelectionFromGeometryObject,
  updateUnifiedSelectionSet,
  type UnifiedSelection,
  type UnifiedSelectionSet,
} from "../selection/unifiedSelection";
import { moveVertexInDiagram } from "../topology/editorTools";
import { TOPOLOGY_PRESET_BY_ID } from "../topology/presets";
import { TopologyDiagramCommandAdapter } from "../topology/topologyCommandAdapter";

const json = <Value>(value: Value): CanonicalJsonValue =>
  JSON.parse(JSON.stringify(value)) as CanonicalJsonValue;

const complexAst = (source: string) => parseComplexExpressionAst(source, ["z"]).ast!;
const complexSource = (): ComplexAnalysisStructuralSource => ({
  function: { sourceText: "z", astVersion: 1, normalizedAst: complexAst("z"), allowedVariables: ["z"] },
  parameters: [], assumptions: [],
  domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
  sampling: { strategy: "uniform-grid", columns: 32, rows: 32, maximumSamples: 4096, tolerance: 1e-8 },
  contours: [],
  branchPolicy: { profile: "none", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 },
  covering: null,
  mobius: null,
});

const topologyFixture: DomainAdapterConformanceFixture<TopologyDiagramCommandAdapter> = {
  name: "TopologyDiagramCommandAdapter",
  create: () => new TopologyDiagramCommandAdapter(TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram()),
  snapshot: (adapter) => {
    const document = adapter.document();
    const history = adapter.historyState();
    return {
      identity: document.identity,
      structuralState: document.source.model,
      persistentState: json(document),
      history: { undoDepth: history.undoCount, redoDepth: history.redoCount },
    };
  },
  preview: (adapter) => {
    const diagram = adapter.current();
    adapter.preview(moveVertexInDiagram(diagram, diagram.vertices[0]!.id, -0.73, 0.77));
  },
  commitStructuralEdit: (adapter) => {
    const diagram = adapter.current();
    adapter.commit(moveVertexInDiagram(diagram, diagram.vertices[0]!.id, -0.61, 0.72));
  },
  attemptInvalidEdit: (adapter) => {
    const circular = adapter.current() as unknown as Record<string, unknown>;
    circular.invalid = circular;
    adapter.commit(circular as never);
  },
  undo: (adapter) => { adapter.undo(); },
  redo: (adapter) => { adapter.redo(); },
  replay: (adapter) => TopologyDiagramCommandAdapter.restore(
    JSON.parse(JSON.stringify(adapter.exportReplay()))
  ),
  reopen: (adapter) => TopologyDiagramCommandAdapter.restore(
    JSON.parse(JSON.stringify(adapter.exportReplay()))
  ),
  queryIsolation: (adapter) => {
    const before = JSON.stringify(adapter.document());
    try { (adapter.document().source.model as Record<string, CanonicalJsonValue>).name = "query mutation"; } catch { /* immutable query */ }
    return JSON.stringify(adapter.document()) === before;
  },
};

const complexFixture: DomainAdapterConformanceFixture<ComplexAnalysisCommandAdapter> = {
  name: "ComplexAnalysisCommandAdapter",
  create: () => new ComplexAnalysisCommandAdapter(createComplexAnalysisDocument(complexSource(), { stableKey: "gk03-complex" })),
  snapshot: (adapter) => {
    const document = adapter.document();
    const history = adapter.history();
    return {
      identity: document.identity,
      structuralState: json({
        function: document.function, parameters: document.parameters, assumptions: document.assumptions,
        domain: document.domain, sampling: document.sampling, contours: document.contours,
        branchPolicy: document.branchPolicy, covering: document.covering, mobius: document.mobius,
      }),
      persistentState: json(document),
      history: { undoDepth: history.undoDepth, redoDepth: history.redoDepth },
    };
  },
  preview: (adapter) => { adapter.previewFunction("exp(z)"); },
  commitStructuralEdit: (adapter) => { adapter.commitFunction("1/z"); },
  attemptInvalidEdit: (adapter) => { adapter.commitFunction("eval(z)"); },
  undo: (adapter) => { adapter.undo(); },
  redo: (adapter) => { adapter.redo(); },
  replay: (adapter) => ComplexAnalysisCommandAdapter.restore(
    JSON.parse(JSON.stringify(adapter.exportReplay()))
  ),
  reopen: (adapter) => ComplexAnalysisCommandAdapter.restore(
    JSON.parse(JSON.stringify(adapter.exportReplay()))
  ),
  queryIsolation: (adapter) => {
    const before = JSON.stringify(adapter.document());
    try { (adapter.document().domain.re as { min: number }).min = -99; } catch { /* immutable query */ }
    return JSON.stringify(adapter.document()) === before;
  },
};

type SelectionState = Readonly<{
  sourceRevision: number;
  hover: UnifiedSelection | null;
  committed: UnifiedSelectionSet;
  historyDepth: number;
}>;

const selection = (revision: number) => unifiedSelectionFromGeometryObject({
  objectId: "geometry:box-1",
  objectLabel: "Box",
  objectType: "box",
  topologyVersion: revision,
  sourceSceneEntityId: "construction:box-1",
  sourceRevision: revision,
})!;

const selectionFixture: SelectionConformanceFixture<SelectionState> = {
  name: "UnifiedSelectionSet",
  create: () => ({ sourceRevision: 1, hover: null, committed: createUnifiedSelectionSet([]), historyDepth: 0 }),
  snapshot: (state) => ({
    sourceRevision: state.sourceRevision,
    hoverId: state.hover?.entityId ?? null,
    committedIds: state.committed.keys,
    historyDepth: state.historyDepth,
  }),
  hover: (state) => ({ ...state, hover: selection(state.sourceRevision) }),
  commit: (state) => ({
    ...state,
    committed: updateUnifiedSelectionSet(state.committed, selection(state.sourceRevision), "replace"),
    historyDepth: state.historyDepth + 1,
  }),
  clear: (state) => ({
    ...state,
    committed: updateUnifiedSelectionSet(state.committed, null, "clear"),
    historyDepth: state.historyDepth + 1,
  }),
  structuralChange: (state) => ({
    ...state,
    sourceRevision: state.sourceRevision + 1,
    committed: createUnifiedSelectionSet([]),
  }),
  locateBack: (state) => {
    const active = state.committed.activeSelection;
    return active ? json({ objectId: active.objectId, sourceEntityId: active.sourceSceneEntityId, revision: active.sourceRevision }) : null;
  },
  inspectorQueryIsolation: (state) => {
    const before = JSON.stringify(state.committed);
    const read = structuredClone(state.committed);
    (read.items as UnifiedSelection[]).splice(0);
    return JSON.stringify(state.committed) === before;
  },
};

describe("GK03 domain-adapter conformance", () => {
  it.each([topologyFixture, complexFixture])("passes the reusable document contract for $name", async (fixture) => {
    const report = await runDomainAdapterConformance(fixture as DomainAdapterConformanceFixture<TopologyDiagramCommandAdapter & ComplexAnalysisCommandAdapter>);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("passes the shared selection lifecycle contract", () => {
    const report = runSelectionConformance(selectionFixture);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
