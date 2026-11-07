import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DWorkspaceProject, createMath3DProject, evaluateGraph2DExpression,
  parseGraph2DExpression, parseMath3DProject, sampleGraph2DDerivativeCurve,
  serializeMath3DProject } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const documentFor = (expression: string) => {
  const empty = createEmptyGraph2DDocument(`derivative-curve:${expression}`);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression,
    domain: { min: -2, max: 2, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    stableKey: `derivative-curve:${expression}` });
};

describe("Graph derivative curve overlay", () => {
  it("GF-36 saves a linked derivative, updates with parameters and source edits, and survives undo and Project reopen", () => {
    const empty = createEmptyGraph2DDocument("gf36-linked");
    const parameter = applyGraph2DAuthoring(empty, { type: "parameter-create",
      draft: { name: "a", value: 2, min: -5, max: 5, step: .1, unit: "1" } });
    const parameterDocument = createGraph2DDocument({ ...parameter, stableKey: "gf36-linked" });
    const initial = applyGraph2DAuthoring(parameterDocument, { type: "create",
      draft: { label: "source", expression: "a*x^2",
        domain: { min: -2, max: 2, includeMin: true, includeMax: true },
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const graph = createGraph2DDocument({ ...initial, stableKey: "gf36-linked" });
    const adapter = new Graph2DCommandAdapter(graph);
    const derivativeScene = applyGraph2DAuthoring(adapter.document(), {
      type: "create-derivative-curve", sourceObjectId: "function_1" });
    createGraph2DDocument({ ...derivativeScene, stableKey: "gf36-check" });
    adapter.commitScene(derivativeScene,
    "create-derivative-curve");
    const saved = adapter.document();
    const derivative = saved.source.objects.find(item => item.kind === "explicit-cartesian" &&
      item.derivativeOrigin);
    expect(derivative?.kind).toBe("explicit-cartesian");
    const valueAt = (document: typeof saved) => {
      const row = document.source.objects.find(item => item.kind === "explicit-cartesian" &&
        item.derivativeOrigin)!;
      if (row.kind !== "explicit-cartesian") throw new Error("Missing derivative.");
      return evaluateGraph2DExpression(row.expression.ast,
        { x: 1, a: document.source.variables[0]!.value }).value;
    };
    expect(valueAt(saved)).toBeCloseTo(4);
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(),
      { type: "parameter-value", name: "a", value: 3 }), "parameter-value");
    expect(valueAt(adapter.document())).toBeCloseTo(6);
    const beforeSourceEdit = adapter.document();
    adapter.commitScene(applyGraph2DAuthoring(beforeSourceEdit, { type: "edit",
      objectId: "function_1", draft: { label: "source", expression: "a*x^3",
        domain: { min: -2, max: 2, includeMin: true, includeMax: true },
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } }), "edit");
    expect(valueAt(adapter.document())).toBeCloseTo(9);
    adapter.undo(); expect(valueAt(adapter.document())).toBeCloseTo(6);
    adapter.redo(); expect(valueAt(adapter.document())).toBeCloseTo(9);
    const project = createMath3DProject(createGraph2DWorkspaceProject(adapter.document()),
      { stableKey: "gf36-project" });
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const recovered = reopened.workspace.entries[0]!.checkpoint;
    if (recovered.format !== "math3d.graph2d-document") throw new Error("Missing Graph.");
    expect(valueAt(recovered)).toBeCloseTo(9);
    const zero = parseGraph2DExpression("0", ["x", "a"]);
    if (!zero.ok) throw new Error("Missing constant expression.");
    expect(() => createGraph2DDocument({ source: { ...recovered.source,
      objects: recovered.source.objects.map(row => row.kind === "explicit-cartesian" &&
        row.derivativeOrigin ? { ...row, expression: { source: "0", variable: "x" as const,
          ast: zero.ast } } : row) },
      display: recovered.display, selection: recovered.selection,
      stableKey: "gf36-forged" })).toThrow(/object list/);
    expect(() => applyGraph2DAuthoring(adapter.document(), { type: "edit",
      objectId: "function_1", draft: { label: "source", expression: "abs(x)",
        domain: { min: -2, max: 2, includeMin: true, includeMax: true },
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } }))
      .toThrow(/unavailable/);
  });
  it("samples the symbolic derivative with a separate bounded budget", () => {
    const document = documentFor("x^2");
    const result = sampleGraph2DDerivativeCurve(document, "function_1", { width: 640, height: 480 });
    expect(result.status).toBe("approximate");
    expect(result.sourceHash).toBe(document.identity.structuralHash);
    expect(result.artifact?.samplesEvaluated).toBeLessThanOrEqual(2048);
    const points = result.artifact?.segments.flatMap(segment => segment.points) ?? [];
    expect(points.length).toBeGreaterThan(5);
    expect(points.every(point => Math.abs(point.y - 2 * point.x) < 1e-9)).toBe(true);
  });

  it("explains unsupported symbolic derivatives instead of drawing a fabricated line", () => {
    const result = sampleGraph2DDerivativeCurve(documentFor("abs(x)"), "function_1",
      { width: 640, height: 480 });
    expect(result).toMatchObject({ status: "unavailable", artifact: null,
      reason: expect.stringContaining("symbolic derivative") });
  });
});
