import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, applyGraph2DAuthoring,
  createEmptyGraph2DDocument, createMath3DProject, createMixedWorkspaceDocument,
  graph2DConstructionFromCandidate, graph2DIntegralConstructionFromAnalysis,
  inspectGraph2DCompatibility, parseMath3DProject, resolveGraph2DConstructions,
  serializeMath3DProject, validateGraph2DConstructionSet,
  GRAPH2D_INTEGRAL_CONSTRUCTIONS_CAPABILITY,
  type Graph2DDocument, type Graph2DIntegralConstruction } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { Graph2DConstructionsPanel } from "./Graph2DConstructionsPanel";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const domain = { min: -4, max: 4, includeMin: true, includeMax: true };
const setup = () => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("gf08-parameterized"));
  adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "parameter-create",
    draft: { name: "a", value: 0, min: -2, max: 2, step: 0.1, unit: "" } }), "parameter-create");
  adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "create",
    draft: { label: "Cubic family", expression: "(x-a)^3", domain, style } }), "create");
  return adapter;
};
const graphInProject = (document: Graph2DDocument) => createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "graph2d", checkpoint: document, expected: document.identity, replay: null }],
  activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
  committedSelection: null, constructions: [],
}), { stableKey: "gf08-constructions", title: "GF-08 parameterized Graph" });

describe("GF-08 saved inflection and definite integral constructions", () => {
  it("recomputes from committed parameters, marks ambiguity or incomplete work unavailable, and reopens in a Project", () => {
    const adapter = setup();
    const scan = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1",
      interval: { min: -4, max: 4 } });
    const inflection = scan.candidates.find(item => item.kind === "inflection" && item.confidence === "numerical");
    expect(inflection).toBeDefined();
    adapter.commitConstruction({ type: "create",
      object: graph2DConstructionFromCandidate(adapter.document(), scan, inflection!) });
    const integral = analyzeGraph2DIntegral({ document: adapter.document(), objectId: "function_1",
      interval: { min: -1, max: 1 }, mode: "signed" });
    expect(integral.status).toBe("complete");
    const savedIntegral = graph2DIntegralConstructionFromAnalysis(adapter.document(), integral);
    expect(validateGraph2DConstructionSet({ version: 1, objects: [{ ...savedIntegral,
      anchor: { ...savedIntegral.anchor, maxEvaluations: 12001 } }] },
    adapter.document().source.objects)).not.toEqual([]);
    const incomplete = analyzeGraph2DIntegral({ document: adapter.document(), objectId: "function_1",
      interval: { min: -1, max: 1 }, mode: "signed", maxEvaluations: 100 });
    expect(incomplete.status).toBe("incomplete");
    expect(() => graph2DIntegralConstructionFromAnalysis(adapter.document(), incomplete)).toThrow(/current complete/);
    adapter.commitConstruction({ type: "create", object: savedIntegral });
    expect(adapter.document().requiredCapabilities).toContain(GRAPH2D_INTEGRAL_CONSTRUCTIONS_CAPABILITY);
    expect(inspectGraph2DCompatibility(adapter.document()).status).toBe("current");
    expect(resolveGraph2DConstructions(adapter.document()).objects).toMatchObject([
      { kind: "inflection", state: "ready" }, { kind: "definite-integral", state: "ready" },
    ]);
    const project = parseMath3DProject(serializeMath3DProject(graphInProject(adapter.document())));
    const reopened = project.workspace.entries[0]!.checkpoint as Graph2DDocument;
    expect(reopened.source.constructions?.objects.map(item => item.id)).toEqual([
      "construction_1", "construction_2"]);
    expect(resolveGraph2DConstructions(reopened).objects[1]?.integral?.value).toBeCloseTo(0, 5);
    const html = renderToStaticMarkup(<Graph2DConstructionsPanel document={reopened}
      artifact={resolveGraph2DConstructions(reopened)} />);
    expect(html).toContain("Update integral");
    expect(html).toContain("not certified");
    expect(html).not.toContain("Exact integral");

    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "parameter-value",
      name: "a", value: 0.2 }), "parameter-value");
    const moved = resolveGraph2DConstructions(adapter.document());
    expect(moved.objects[0]?.point?.x).toBeCloseTo(0.2, 3);
    expect(moved.objects[1]?.integral?.value).toBeCloseTo(-0.416, 3);
    expect(moved.evaluations).toBeLessThanOrEqual(12000);

    const currentIntegral = adapter.document().source.constructions!.objects[1] as Graph2DIntegralConstruction;
    adapter.commitConstruction({ type: "update", object: { ...currentIntegral,
      anchor: { ...currentIntegral.anchor, maxEvaluations: 100 } } });
    expect(resolveGraph2DConstructions(adapter.document()).objects[1]).toMatchObject({
      state: "unavailable", integral: null });
    expect(adapter.undo()?.source.constructions?.objects[1]).toEqual(currentIntegral);
    expect(resolveGraph2DConstructions(adapter.document()).objects[1]?.state).toBe("ready");
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "edit", objectId: "function_1",
      draft: { label: "Multiple bends", expression: "x^5-0.01*x^3", domain, style } }), "edit");
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]?.reason).toMatch(/multiple candidates/);
  });
});
