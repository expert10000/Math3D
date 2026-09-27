import { GRAPH2D_MAX_OBJECTS, type Graph2DDocument, type Graph2DDomain, type Graph2DObjectDisplay } from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";

export type Graph2DScene = Pick<Graph2DDocument, "source" | "display" | "selection">;
export type Graph2DFunctionDraft = Readonly<{
  label: string;
  expression: string;
  domain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DAuthoringAction =
  | Readonly<{ type: "create"; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "edit"; objectId: string; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "duplicate" | "delete" | "visibility"; objectId: string }>
  | Readonly<{ type: "reorder"; objectId: string; toIndex: number }>;

export const validateGraph2DFunctionDraft = (draft: Graph2DFunctionDraft, variables: readonly string[] = ["x"]): readonly string[] => {
  const errors: string[] = [];
  if (!draft.label.trim() || draft.label !== draft.label.trim() || draft.label.length > 160) errors.push("Enter a label of 1–160 characters without surrounding spaces.");
  if (!draft.expression.trim() || draft.expression !== draft.expression.trim() || draft.expression.length > 2048) errors.push("Enter an expression of 1–2048 characters without surrounding spaces.");
  else {
    const parsed = parseGraph2DExpression(draft.expression, variables);
    if (!parsed.ok) errors.push(...parsed.diagnostics.map((diagnostic) => diagnostic.message));
  }
  if (!Number.isFinite(draft.domain.min) || !Number.isFinite(draft.domain.max) || draft.domain.min >= draft.domain.max ||
      typeof draft.domain.includeMin !== "boolean" || typeof draft.domain.includeMax !== "boolean") errors.push("Domain minimum must be less than maximum.");
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.style.color) || !Number.isFinite(draft.style.lineWidth) ||
      draft.style.lineWidth < 0.5 || draft.style.lineWidth > 12 ||
      !["solid", "dashed", "dotted"].includes(draft.style.lineStyle) || typeof draft.style.visible !== "boolean")
    errors.push("Choose a valid color, line width, and line style.");
  return errors;
};

export const applyGraph2DAuthoring = (document: Graph2DDocument, action: Graph2DAuthoringAction): Graph2DScene => {
  const objects = [...document.source.objects];
  const displays = [...document.display.objects];
  let selection = document.selection;
  const index = "objectId" in action ? objects.findIndex((entry) => entry.id === action.objectId) : -1;
  if ("objectId" in action && index < 0) throw new TypeError("Function does not exist.");
  if (action.type === "create" || action.type === "edit") {
    const names = ["x", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DFunctionDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsed = parseGraph2DExpression(action.draft.expression, names);
    if (!parsed.ok) throw new TypeError("Expression is invalid.");
    if (action.type === "create" && objects.length >= GRAPH2D_MAX_OBJECTS) throw new TypeError("Function limit reached.");
    let id = action.type === "edit" ? action.objectId : "function_1";
    if (action.type === "create") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "function_" + ++serial;
    }
    const object = { id, kind: "explicit-cartesian" as const, label: action.draft.label,
      expression: { source: action.draft.expression, variable: "x" as const, ast: parsed.ast }, domain: action.draft.domain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "duplicate") {
    if (objects.length >= GRAPH2D_MAX_OBJECTS) throw new TypeError("Function limit reached.");
    const original = objects[index]!;
    let serial = 1;
    let id = original.id.slice(0, 59) + "_copy";
    while (objects.some((entry) => entry.id === id)) id = original.id.slice(0, 52) + "_copy_" + ++serial;
    objects.splice(index + 1, 0, { ...original, id, label: original.label.slice(0, 153) + " copy" });
    displays.splice(index + 1, 0, { ...displays[index]!, objectId: id });
    selection = { objectId: id, probe: null };
  } else if (action.type === "delete") {
    objects.splice(index, 1); displays.splice(index, 1);
    if (selection.objectId === action.objectId) selection = { objectId: null, probe: null };
  } else if (action.type === "visibility") {
    displays[index] = { ...displays[index]!, visible: !displays[index]!.visible };
    if (!displays[index]!.visible && selection.objectId === action.objectId) selection = { objectId: action.objectId, probe: null };
  } else if (action.type === "reorder") {
    if (!Number.isInteger(action.toIndex) || action.toIndex < 0 || action.toIndex >= objects.length) throw new TypeError("Invalid function position.");
    objects.splice(action.toIndex, 0, objects.splice(index, 1)[0]!);
    displays.splice(action.toIndex, 0, displays.splice(index, 1)[0]!);
  }
  return { source: { ...document.source, objects }, display: { ...document.display, objects: displays }, selection };
};
