import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, validateGraph2DFunctionDraft, createEmptyGraph2DDocument } from "@math3d/core";

const draft = { label: "f", expression: "x^2", domain: { min: -5, max: 5, includeMin: true, includeMax: false },
  style: { color: "#ff0000", lineWidth: 3, lineStyle: "dashed" as const, visible: true } };

describe("Graph2D authoring", () => {
  it("keeps invalid drafts out of committed source", () => {
    const document = createEmptyGraph2DDocument("authoring-invalid");
    expect(validateGraph2DFunctionDraft({ ...draft, expression: "sin(" })).not.toHaveLength(0);
    expect(() => applyGraph2DAuthoring(document, { type: "create", draft: { ...draft, expression: "sin(" } })).toThrow();
    expect(document.source.objects).toHaveLength(0);
  });

  it("builds matching ordered source and display records across authoring actions", () => {
    const empty = createEmptyGraph2DDocument("authoring-actions");
    const first = applyGraph2DAuthoring(empty, { type: "create", draft });
    expect(first.source.objects[0]?.expression.ast.version).toBe(1);
    expect(first.display.objects[0]?.color).toBe("#ff0000");
    const document = { ...empty, ...first };
    const second = applyGraph2DAuthoring(document, { type: "duplicate", objectId: "function_1" });
    expect(second.source.objects.map((entry) => entry.id)).toEqual(["function_1", "function_1_copy"]);
    const moved = applyGraph2DAuthoring({ ...document, ...second }, { type: "reorder", objectId: "function_1_copy", toIndex: 0 });
    expect(moved.source.objects.map((entry) => entry.id)).toEqual(moved.display.objects.map((entry) => entry.objectId));
    const hidden = applyGraph2DAuthoring({ ...document, ...moved }, { type: "visibility", objectId: "function_1_copy" });
    expect(hidden.display.objects[0]?.visible).toBe(false);
    const deleted = applyGraph2DAuthoring({ ...document, ...hidden }, { type: "delete", objectId: "function_1_copy" });
    expect(deleted.source.objects.map((entry) => entry.id)).toEqual(["function_1"]);
    expect(deleted.selection.objectId).toBe(null);
  });
});
