import { applyGraph2DAuthoring, type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DFunctionDraft } from "@math3d/core";

/** Keep raw input, including temporarily invalid numbers, until the shared command is accepted. */
export type MobileGraphFunctionDraft = { label: string; expression: string; min: string; max: string;
  includeMin: boolean; includeMax: boolean; color: string; width: string;
  lineStyle: "solid" | "dashed" | "dotted"; visible: boolean };
export type MobileGraphEditor = { objectId: string | null; draft: MobileGraphFunctionDraft };

export const mobileGraphFunctionDraft = (document: Graph2DDocument, objectId: string | null): MobileGraphFunctionDraft => {
  if (objectId === null) return { label: `f${document.source.objects.length + 1}`, expression: "x", min: "-10", max: "10",
    includeMin: true, includeMax: true, color: "#2563eb", width: "2", lineStyle: "solid", visible: true };
  const object = document.source.objects.find((entry) => entry.id === objectId);
  const style = document.display.objects.find((entry) => entry.objectId === objectId);
  if (!object || object.kind !== "explicit-cartesian" || !style) throw new TypeError("Only explicit functions can be authored on mobile.");
  return { label: object.label, expression: object.expression.source, min: String(object.domain.min), max: String(object.domain.max),
    includeMin: object.domain.includeMin, includeMax: object.domain.includeMax, color: style.color, width: String(style.lineWidth),
    lineStyle: style.lineStyle, visible: style.visible };
};

export const mobileGraphAuthoringAction = (editor: MobileGraphEditor): Graph2DAuthoringAction => {
  const value = editor.draft;
  const numeric = (text: string) => text.trim() && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
  const draft: Graph2DFunctionDraft = { label: value.label.trim(), expression: value.expression.trim(),
    domain: { min: numeric(value.min), max: numeric(value.max), includeMin: value.includeMin, includeMax: value.includeMax },
    style: { color: value.color.trim(), lineWidth: numeric(value.width), lineStyle: value.lineStyle, visible: value.visible } };
  return editor.objectId === null ? { type: "create", draft } : { type: "edit", objectId: editor.objectId, draft };
};

export const applyMobileGraphAuthoring = (document: Graph2DDocument, action: Graph2DAuthoringAction) => {
  return applyGraph2DAuthoring(document, action);
};
