import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  parseMath3DProject, sampleGraph2DScene, serializeMath3DProject } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const style = { color: "#2563eb", lineWidth: 2,
  lineStyle: "solid" as const, visible: true };
const domain = { min: -2, max: 2, includeMin: true, includeMax: true };
const documentFor = (expression: string, withParameter = false) => {
  const blank = createEmptyGraph2DDocument(`gf40:${expression}`);
  const initial = withParameter ? applyGraph2DAuthoring(blank, {
    type: "parameter-create", draft: { name: "a", value: 2, min: 0,
      max: 5, step: .1, unit: "1" } }) : blank;
  const source = createGraph2DDocument({ ...initial, stableKey: `gf40:${expression}`,
    display: { ...initial.display, sampling: {
      ...initial.display.sampling, maxSamples: 4096 } } });
  const scene = applyGraph2DAuthoring(source, { type: "create",
    draft: { label: "f", expression, domain, style } });
  return createGraph2DDocument({ ...scene, stableKey: `gf40:${expression}` });
};
const sampled = (document: ReturnType<typeof documentFor>, id: string) =>
  sampleGraph2DScene({ document,
    viewport: { ...document.display.viewport, xMin: -2, xMax: 2,
      yMin: -20, yMax: 20 }, width: 640, height: 480,
    interaction: false, deterministic: true })
    .find(item => item.objectId === id)!.artifact;

describe("GF-40 saved derivative recipes", () => {
  it("keeps a bounded second symbolic derivative live across parameters, source edits, undo and Project reopen", () => {
    const adapter = new Graph2DCommandAdapter(documentFor("a*x^3", true));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), {
      type: "create-saved-derivative", sourceObjectId: "function_1",
      order: 2, fallback: "finite-difference", tolerance: 1e-5 }),
    "create-saved-derivative");
    const id = adapter.document().source.objects.find(item => item.kind === "derivative-curve")!.id;
    const valueNear = () => sampled(adapter.document(), id).segments.flatMap(segment =>
      segment.points).find(point => Math.abs(point.x - 1) < .05);
    expect(valueNear()!.y).toBeCloseTo(12 * valueNear()!.x, 2);
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(),
      { type: "parameter-value", name: "a", value: 3 }), "parameter-value");
    expect(valueNear()!.y).toBeCloseTo(18 * valueNear()!.x, 2);
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "edit",
      objectId: "function_1", draft: { label: "f", expression: "a*x^2",
        domain, style } }), "edit");
    expect(valueNear()!.y).toBeCloseTo(6, 2);
    adapter.undo(); expect(valueNear()!.y).toBeCloseTo(18 * valueNear()!.x, 2);
    adapter.redo(); expect(valueNear()!.y).toBeCloseTo(6, 2);
    const project = createMath3DProject(createGraph2DWorkspaceProject(adapter.document()),
      { stableKey: "gf40-symbolic-project" });
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const graph = reopened.workspace.entries[0]!.checkpoint;
    if (graph.format !== "math3d.graph2d-document") throw new Error("Missing Graph.");
    expect(sampled(graph, id).segments.length).toBeGreaterThan(0);
    expect(graph.source.objects.find(item => item.id === id)).toMatchObject({
      kind: "derivative-curve", order: 2, method: "symbolic-rules" });
  });
  it("saves an explicitly approximate fallback with a cusp gap and updates its method on source edit", () => {
    const adapter = new Graph2DCommandAdapter(documentFor("abs(x)"));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), {
      type: "create-saved-derivative", sourceObjectId: "function_1",
      order: 1, fallback: "finite-difference", tolerance: 1e-5 }),
    "create-saved-derivative");
    const saved = adapter.document();
    const row = saved.source.objects.find(item => item.kind === "derivative-curve")!;
    expect(row).toMatchObject({ method: "finite-difference", fallback: "finite-difference" });
    const artifact = sampled(saved, row.id);
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(129);
    expect(artifact.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-sample" })]));
    expect(artifact.segments.length).toBeGreaterThanOrEqual(2);
    expect(artifact.segments.every(segment => segment.points.every(point =>
      point.x < 0) || segment.points.every(point => point.x > 0))).toBe(true);
    const project = createMath3DProject(createGraph2DWorkspaceProject(saved),
      { stableKey: "gf40-numeric-project" });
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.workspace.entries[0]!.checkpoint.source.objects.find(item =>
      item.id === row.id)).toMatchObject({ kind: "derivative-curve",
        method: "finite-difference" });
    adapter.commitScene(applyGraph2DAuthoring(saved, { type: "edit",
      objectId: "function_1", draft: { label: "f", expression: "x^2",
        domain, style } }), "edit");
    expect(adapter.document().source.objects.find(item => item.id === row.id))
      .toMatchObject({ method: "symbolic-rules" });
    adapter.undo();
    expect(adapter.document().source.objects.find(item => item.id === row.id))
      .toMatchObject({ method: "finite-difference" });
  });
});
