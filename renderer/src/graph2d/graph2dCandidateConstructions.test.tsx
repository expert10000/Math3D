import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections, applyGraph2DAuthoring,
  createEmptyGraph2DDocument, graph2DConstructionFromCandidate, graph2DConstructionActionsFromCandidates,
  graph2DConstructionActionsFromIntersectionCandidates,
  isGraph2DCriticalCandidateAlreadySaved,
  inspectGraph2DCompatibility,
  parseGraph2DDocument, resolveGraph2DConstructions, serializeGraph2DDocument,
  validateGraph2DConstructionSet, GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { Graph2DPlot } from "./Graph2DPlot";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const domain = { min: -4, max: 4, includeMin: true, includeMax: true };
const interval = { min: -3, max: 3 };
const create = (...expressions: string[]) => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("g2d49-candidates"));
  for (const [index, expression] of expressions.entries()) adapter.commitScene(applyGraph2DAuthoring(adapter.document(), {
    type: "create", draft: { label: `f${index}`, expression, domain, style },
  }), "create");
  return adapter;
};
const edit = (adapter: Graph2DCommandAdapter, objectId: string, expression: string) =>
  adapter.commitScene(applyGraph2DAuthoring(adapter.document(), {
    type: "edit", objectId, draft: { label: "edited", expression, domain, style },
  }), "edit");

describe("G2D49 source-linked numerical candidate constructions", () => {
  it("builds an atomic batch with unique IDs and rejects partial or repeated candidates", () => {
    const adapter = create("x^2-1");
    const analysis = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1", interval });
    const roots = analysis.candidates.filter(item => item.kind === "zero" && item.confidence === "numerical");
    expect(roots).toHaveLength(2);
    const actions = graph2DConstructionActionsFromCandidates(adapter.document(), analysis, roots);
    expect(() => graph2DConstructionActionsFromCandidates(adapter.document(), analysis,
      [{ ...roots[0]!, x: roots[0]!.x + 0.01 }])).toThrow(/stale/);
    expect(actions.map(item => item.type === "create" ? item.object.id : "")).toEqual(["construction_1", "construction_2"]);
    adapter.commitConstructions(actions);
    expect(adapter.document().source.constructions?.objects).toHaveLength(2);
    expect(() => graph2DConstructionActionsFromCandidates(adapter.document(), analysis, roots)).toThrow(/already saved|stale/);
    const refreshed = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1", interval });
    expect(refreshed.candidates.filter(item => item.kind === "zero").every(item =>
      isGraph2DCriticalCandidateAlreadySaved(adapter.document(), item))).toBe(true);
    expect(() => graph2DConstructionActionsFromCandidates(adapter.document(), refreshed,
      refreshed.candidates.filter(item => item.kind === "zero"))).toThrow(/already saved/);
    expect(() => graph2DConstructionActionsFromCandidates(create("x^2-1").document(),
      { ...analysis, status: "incomplete" }, roots)).toThrow(/complete bounded scan/);
    const saved = adapter.document().source.constructions!.objects[0]!;
    const full = { ...adapter.document(), source: { ...adapter.document().source,
      constructions: { version: 1 as const, objects: Array(32).fill(saved) } } };
    expect(() => graph2DConstructionActionsFromCandidates(full, analysis, roots)).toThrow(/construction budget/);
  });
  it("saves one root with bounded provenance, recomputes a nearby root, and makes a missing root unavailable", () => {
    const adapter = create("x^2-1");
    const analysis = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1", interval });
    const root = analysis.candidates.find(item => item.kind === "zero" && item.x < 0)!;
    const saved = graph2DConstructionFromCandidate(adapter.document(), analysis, root);
    expect(saved.kind).toBe("root");
    expect(saved.anchor.interval).toEqual(interval);
    expect(saved.anchor.candidateId).toBe(root.candidateId);
    expect(saved.anchor.sourceGeneration).toEqual(root.source);
    expect(saved.anchor.matchRadius).toBeLessThan(Math.abs(root.x) / 2);
    adapter.commitConstruction({ type: "create", object: saved });
    const document = adapter.document();
    expect(document.requiredCapabilities).toContain(GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY);
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    expect(resolveGraph2DConstructions(document).objects[0]?.point?.x).toBeCloseTo(-1, 5);
    const svg = renderToStaticMarkup(<Graph2DPlot display={document.display} size={{ width: 500, height: 400 }}
      series={[]} constructions={resolveGraph2DConstructions(document)} />);
    expect(svg).toContain(`data-graph2d-construction="${saved.id}"`);
    edit(adapter, "function_1", "x^2-1.21");
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]?.point?.x).toBeCloseTo(-1.1, 4);
    edit(adapter, "function_1", "x^2+1");
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]).toMatchObject({ state: "unavailable", point: null });
    expect(adapter.undo()?.source.constructions?.objects[0]).toEqual(saved);
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]?.state).toBe("ready");
  });

  it("requires a unique local match and preserves extrema kind", () => {
    const adapter = create("x");
    const analysis = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1", interval });
    const root = analysis.candidates.find(item => item.kind === "zero")!;
    adapter.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(adapter.document(), analysis, root) });
    edit(adapter, "function_1", "x^2-0.01");
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]?.reason).toMatch(/multiple candidates/);
    const extrema = create("(x-1)^2");
    const scan = analyzeGraph2DCriticalPoints({ document: extrema.document(), objectId: "function_1", interval });
    const minimum = scan.candidates.find(item => item.kind === "minimum")!;
    expect(minimum).toBeDefined();
    extrema.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(extrema.document(), scan, minimum) });
    expect(resolveGraph2DConstructions(extrema.document()).objects[0]).toMatchObject({ state: "ready", kind: "minimum" });
    edit(extrema, "function_1", "-(x-1)^2");
    expect(resolveGraph2DConstructions(extrema.document()).objects[0]?.state).toBe("unavailable");
    const coincident = create("x^3");
    const sameX = analyzeGraph2DCriticalPoints({ document: coincident.document(), objectId: "function_1", interval });
    const coincidentRoot = sameX.candidates.find(item => item.kind === "zero")!;
    expect(coincidentRoot).toBeDefined();
    coincident.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(coincident.document(), sameX, coincidentRoot) });
    expect(resolveGraph2DConstructions(coincident.document()).objects[0]?.state).toBe("ready");
  });

  it("saves pair intersections and rejects stale, forged, and invalid provenance", () => {
    const adapter = create("x", "-x");
    const analysis = analyzeGraph2DIntersections({ document: adapter.document(), firstObjectId: "function_1",
      secondObjectId: "function_2", interval });
    const candidate = analysis.candidates[0]!;
    const saved = graph2DConstructionFromCandidate(adapter.document(), analysis, candidate);
    expect(saved.inputs.map(item => item.objectId)).toEqual(["function_1", "function_2"]);
    adapter.commitConstruction({ type: "create", object: saved });
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]).toMatchObject({ state: "ready", kind: "intersection" });
    expect(() => applyGraph2DAuthoring(adapter.document(), { type: "delete", objectId: "function_2" })).toThrow(/constructions/);
    edit(adapter, "function_2", "x+1");
    expect(resolveGraph2DConstructions(adapter.document()).objects[0]?.state).toBe("unavailable");
    expect(() => graph2DConstructionFromCandidate(adapter.document(), analysis, candidate)).toThrow(/stale/);
    const sources = adapter.document().source.objects;
    expect(validateGraph2DConstructionSet({ version: 1, objects: [{ ...saved,
      anchor: { ...saved.anchor, matchRadius: 100 } }] }, sources)).not.toEqual([]);
    expect(validateGraph2DConstructionSet({ version: 1, objects: [{ ...saved,
      inputs: [{ kind: "source", objectId: "function_1" }, { kind: "source", objectId: "function_1" }] }] }, sources)).not.toEqual([]);
  });

  it("saves multiple intersections atomically and rejects duplicates", () => {
    const adapter = create("x^2", "1");
    const analysis = analyzeGraph2DIntersections({ document: adapter.document(), firstObjectId: "function_1",
      secondObjectId: "function_2", interval });
    expect(analysis.candidates).toHaveLength(2);
    const actions = graph2DConstructionActionsFromIntersectionCandidates(adapter.document(), analysis,
      analysis.candidates);
    expect(actions.map(action => action.type === "create" ? action.object.id : "")).toEqual([
      "construction_1", "construction_2"]);
    expect(() => graph2DConstructionActionsFromIntersectionCandidates(adapter.document(), analysis,
      [analysis.candidates[0]!, analysis.candidates[0]!])).toThrow(/duplicated/);
    adapter.commitConstructions(actions);
    expect(adapter.document().source.constructions?.objects).toHaveLength(2);
    expect(() => graph2DConstructionActionsFromIntersectionCandidates(adapter.document(), analysis,
      analysis.candidates)).toThrow(/current complete/);
  });

  it("keeps multiple distinct candidate scans within the shared construction evaluation budget", () => {
    const adapter = create("x");
    for (let index = 0; index < 30; index += 1) {
      const scan = analyzeGraph2DCriticalPoints({ document: adapter.document(), objectId: "function_1",
        interval: { min: -3 + index * 0.01, max: 3 } });
      const root = scan.candidates.find(item => item.kind === "zero")!;
      adapter.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(adapter.document(), scan, root) });
    }
    const artifact = resolveGraph2DConstructions(adapter.document());
    expect(artifact.evaluations).toBeLessThanOrEqual(12000);
    expect(artifact.objects).toHaveLength(30);
    expect(artifact.objects.some(item => item.state === "unavailable")).toBe(true);
  });
});
