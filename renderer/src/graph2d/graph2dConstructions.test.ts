import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  GRAPH2D_CONSTRUCTIONS_CAPABILITY, GRAPH2D_MAX_CONSTRUCTIONS, inspectGraph2DCompatibility,
  nextGraph2DConstructionId, normalizeGraph2DDocument, parseGraph2DDocument,
  serializeGraph2DDocument, structuralHash, validateGraph2DConstructionSet,
  type Graph2DConstructionObject, type Graph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const style = { visible: true, color: "#123456", lineWidth: 2, lineStyle: "solid" as const };
const domain = { min: -5, max: 5, includeMin: true, includeMax: false };
const point = (id: string, objectId: string, parameter: "x" | "t" | "theta", value = 2): Graph2DConstructionObject => ({
  id, kind: "point-on-curve", label: id, inputs: [{ kind: "source", objectId }],
  anchor: { parameter, value }, style, requiredCapability: GRAPH2D_CONSTRUCTIONS_CAPABILITY,
});
const line = (id: string, objectId: string, kind: "tangent" | "normal"): Graph2DConstructionObject => ({
  id, kind, label: id, inputs: [{ kind: "construction", objectId }], anchor: null,
  style, requiredCapability: GRAPH2D_CONSTRUCTIONS_CAPABILITY,
});
const fixture = () => {
  const commands = new Graph2DCommandAdapter(createEmptyGraph2DDocument("g2d47-constructions"));
  commands.commitScene(applyGraph2DAuthoring(commands.document(), { type: "create", draft: {
    label: "f", expression: "x^2", domain, style,
  } }), "create");
  commands.commitScene(applyGraph2DAuthoring(commands.document(), { type: "create-parametric", draft: {
    label: "p", xExpression: "t", yExpression: "t^2", domain, style,
  } }), "create-parametric");
  commands.commitScene(applyGraph2DAuthoring(commands.document(), { type: "create-polar", draft: {
    label: "r", rExpression: "-2", domain, style,
  } }), "create-polar");
  return commands;
};

describe("G2D47 Graph construction document and commands", () => {
  it("stores source parameter intent, capabilities and source revision through save/reopen", () => {
    const commands = fixture();
    const before = commands.document();
    expect(nextGraph2DConstructionId(before.source)).toBe("construction_1");
    commands.commitConstruction({ type: "create", object: point("construction_1", "function_1", "x") });
    commands.commitConstruction({ type: "create", object: point("construction_2", "parametric_1", "t", -2) });
    commands.commitConstruction({ type: "create", object: point("construction_3", "polar_1", "theta", 0) });
    commands.commitConstruction({ type: "create", object: line("construction_4", "construction_3", "tangent") });
    commands.commitConstruction({ type: "create", object: line("construction_5", "construction_3", "normal") });
    const saved = commands.document();
    expect(saved.source.constructions?.objects).toHaveLength(5);
    expect(saved.source.constructions?.objects[2]).toEqual(point("construction_3", "polar_1", "theta", 0));
    expect(saved.requiredCapabilities).toContain(GRAPH2D_CONSTRUCTIONS_CAPABILITY);
    expect(saved.identity.revision).toBe(before.identity.revision + 5);
    expect(saved.identity.structuralHash).toBe(structuralHash(saved.source));
    expect(inspectGraph2DCompatibility(saved).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(saved))).toEqual(saved);
    expect(nextGraph2DConstructionId(saved.source)).toBe("construction_6");
    expect(commands.undo()?.source.constructions?.objects).toHaveLength(4);
    const redone = commands.redo()!;
    expect(redone.source).toEqual(saved.source);
    expect(redone.identity.revision).toBe(saved.identity.revision + 2);
    expect(Graph2DCommandAdapter.restore(commands.exportReplay()).document()).toEqual(redone);
    expect(createEmptyGraph2DDocument("legacy-shape").source).not.toHaveProperty("constructions");
  });

  it("rejects invalid references, order, cycles, anchors, capabilities and size", () => {
    const sources = fixture().document().source.objects;
    const good = point("construction_1", "function_1", "x");
    const badSets: unknown[] = [
      { version: 2, objects: [good] },
      { version: 1, objects: [good, good] },
      { version: 1, objects: [point("construction_1", "missing", "x")] },
      { version: 1, objects: [point("construction_1", "function_1", "theta")] },
      { version: 1, objects: [point("construction_1", "function_1", "x", Number.POSITIVE_INFINITY)] },
      { version: 1, objects: [point("construction_1", "function_1", "x", 1e13)] },
      { version: 1, objects: [{ ...good, requiredCapability: "graph2d.future.v1" }] },
      { version: 1, objects: [line("construction_2", "construction_1", "tangent"), good] },
      { version: 1, objects: [line("construction_1", "construction_1", "tangent")] },
      { version: 1, objects: [line("construction_1", "missing", "tangent")] },
      { version: 1, objects: [point("construction_1", "function_1", "x"),
        { ...line("construction_2", "construction_1", "normal"), inputs: [{ kind: "source", objectId: "function_1" }] }] },
      { version: 1, objects: Array.from({ length: GRAPH2D_MAX_CONSTRUCTIONS + 1 }, (_, index) =>
        point(`construction_${index + 1}`, "function_1", "x")) },
      { version: 1, objects: [{ ...good, inputs: [{ kind: "source", objectId: "function_1", documentId: "other" }] }] },
    ];
    for (const value of badSets) expect(validateGraph2DConstructionSet(value, sources), JSON.stringify(value)).not.toEqual([]);
    const valid = { version: 1 as const, objects: [good] };
    const base = fixture().document();
    expect(normalizeGraph2DDocument({ ...base, source: { ...base.source, constructions: valid } }).ok).toBe(false);
    expect(inspectGraph2DCompatibility({ ...base, requiredCapabilities: [...base.requiredCapabilities,
      "graph2d.future.v1"] }).status).toBe("unsupported");
    const authored = createGraph2DDocument({ source: { ...base.source, constructions: valid },
      display: base.display, selection: base.selection, stableKey: "with-construction" });
    expect(normalizeGraph2DDocument({ ...authored, requiredCapabilities: base.requiredCapabilities }).ok).toBe(false);
    expect(inspectGraph2DCompatibility(authored).status).toBe("current");
  });

  it("enforces authored domain and explicit dependent deletion while source edits keep intent", () => {
    const commands = fixture();
    expect(() => commands.commitConstruction({ type: "create", object: point("construction_1", "function_1", "x", 5) }))
      .toThrow(/domain/);
    commands.commitConstruction({ type: "create", object: point("construction_1", "function_1", "x") });
    commands.commitConstruction({ type: "create", object: line("construction_2", "construction_1", "tangent") });
    const before = commands.document();
    expect(() => commands.commitConstruction({ type: "delete", objectId: "construction_1" })).toThrow(/dependent/);
    expect(() => applyGraph2DAuthoring(before, { type: "delete", objectId: "function_1" })).toThrow(/constructions/);
    const edited = applyGraph2DAuthoring(before, { type: "edit", objectId: "function_1", draft: {
      label: "f", expression: "x^3", domain: { min: -1, max: 1, includeMin: true, includeMax: true }, style,
    } });
    const after = commands.commitScene(edited, "edit");
    expect(after.source.constructions).toEqual(before.source.constructions);
    expect(after.identity.revision).toBe(before.identity.revision + 1);
    expect(commands.undo()?.source).toEqual(before.source);
    expect(commands.redo()?.source).toEqual(after.source);
    commands.commitConstruction({ type: "delete", objectId: "construction_2" });
    commands.commitConstruction({ type: "delete", objectId: "construction_1" });
    expect(commands.document().source).not.toHaveProperty("constructions");
    expect(commands.document().requiredCapabilities).not.toContain(GRAPH2D_CONSTRUCTIONS_CAPABILITY);
    expect(commands.undo()?.source.constructions?.objects).toHaveLength(1);
  });

  it("updates a stable construction ID through one reversible command", () => {
    const commands = fixture();
    const original = point("construction_1", "function_1", "x", 1);
    commands.commitConstruction({ type: "create", object: original });
    const before = commands.document();
    expect(commands.commitConstruction({ type: "update", object: original })).toEqual(before);
    expect(commands.history().undoDepth).toBe(4); // three source creations and one construction creation
    const edited = point("construction_1", "function_1", "x", 3);
    commands.commitConstruction({ type: "update", object: edited });
    expect(commands.document().source.constructions?.objects[0]).toEqual(edited);
    expect(commands.undo()?.source.constructions?.objects[0]).toEqual(original);
    expect(commands.redo()?.source.constructions?.objects[0]).toEqual(edited);
    expect(() => commands.commitConstruction({ type: "update", object: point("construction_2", "function_1", "x") }))
      .toThrow(/does not exist/);
  });
});
