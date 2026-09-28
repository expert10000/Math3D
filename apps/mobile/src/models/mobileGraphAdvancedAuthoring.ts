import { GRAPH2D_OBJECT_KINDS, Graph2DPointTableStore, graph2DPointDomain, previewGraph2DPointImport,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DObjectKind, type Graph2DPointTableReference } from "@math3d/core";
import { mobileGraphFunctionDraft, type MobileGraphFunctionDraft } from "./mobileGraphAuthoring";

export const MOBILE_GRAPH_KINDS = GRAPH2D_OBJECT_KINDS;
type Piece = { expression: string; min: string; max: string; includeMin: boolean; includeMax: boolean };
type Clause = { expression: string; comparator: "<" | "<=" | ">" | ">=" };
export type MobileGraphAdvancedEditor = { objectId: string | null; kind: Graph2DObjectKind;
  draft: MobileGraphFunctionDraft & { second: string; yMin: string; yMax: string; operator: "all" | "any";
    clauses: Clause[]; pieces: Piece[]; data: string; table?: Graph2DPointTableReference; mode: "points" | "line" } };
export const mobileGraphKindEditor = (document: Graph2DDocument, kind: Graph2DObjectKind, objectId: string | null = null): MobileGraphAdvancedEditor => {
  const object = document.source.objects.find((entry) => entry.id === objectId);
  const style = document.display.objects.find((entry) => entry.objectId === objectId);
  if (objectId && (!object || object.kind !== kind || !style)) throw new TypeError("Unsupported graph editor.");
  const draft: MobileGraphAdvancedEditor["draft"] = { ...mobileGraphFunctionDraft(document, null), label: `${kind} ${document.source.objects.length + 1}`,
    expression: kind === "parametric" ? "cos(t)" : kind === "polar" ? "2*cos(3*theta)" : "x^2+y^2-4", second: "sin(t)",
    yMin: "-10", yMax: "10", operator: "all", clauses: [{ expression: "x^2+y^2-4", comparator: "<=" }],
    pieces: [{ expression: "-x", min: "-10", max: "0", includeMin: true, includeMax: false },
      { expression: "x", min: "0", max: "10", includeMin: true, includeMax: true }],
    data: "x,y\n-2,4\n-1,1\n0,0\n1,1\n2,4", mode: "points" };
  if (kind === "parametric" || kind === "polar") { draft.min = "0"; draft.max = String(2 * Math.PI); }
  if (object && style) {
    Object.assign(draft, { label: object.label, color: style.color, width: String(style.lineWidth), lineStyle: style.lineStyle, visible: style.visible });
    if ("domain" in object) Object.assign(draft, { min: String(object.domain.min), max: String(object.domain.max), includeMin: object.domain.includeMin, includeMax: object.domain.includeMax });
    if (object.kind === "parametric") { draft.expression = object.xExpression.source; draft.second = object.yExpression.source; }
    if (object.kind === "polar") draft.expression = object.rExpression.source;
    if (object.kind === "implicit" || object.kind === "explicit-cartesian") draft.expression = object.expression.source;
    if (object.kind === "implicit" || object.kind === "inequality") { draft.yMin = String(object.yDomain.min); draft.yMax = String(object.yDomain.max); }
    if (object.kind === "inequality") { draft.operator = object.operator; draft.clauses = object.clauses.map((clause) => ({ expression: clause.source, comparator: clause.comparator })); }
    if (object.kind === "piecewise") draft.pieces = object.pieces.map((piece) => ({ expression: piece.expression.source, min: String(piece.domain.min), max: String(piece.domain.max), includeMin: piece.domain.includeMin, includeMax: piece.domain.includeMax }));
    if (object.kind === "point-series") { draft.data = ""; draft.table = object.table; draft.mode = object.mode; }
  }
  return { objectId, kind, draft };
};
const number = (raw: string) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) ? Number(raw) : NaN;
/** Produces ordinary shared commands. The supplied table store may be transient for validation. */
export const mobileGraphKindAction = (editor: MobileGraphAdvancedEditor, tables: Graph2DPointTableStore): Graph2DAuthoringAction => {
  const d = editor.draft, domain = { min: number(d.min), max: number(d.max), includeMin: d.includeMin, includeMax: d.includeMax };
  const base = { label: d.label.trim(), domain, style: { color: d.color.trim(), lineWidth: number(d.width), lineStyle: d.lineStyle, visible: d.visible } };
  const action = (type: string, draft: unknown) => ({ type: `${editor.objectId ? "edit" : "create"}${type}`, ...(editor.objectId ? { objectId: editor.objectId } : {}), draft }) as Graph2DAuthoringAction;
  switch (editor.kind) {
    case "explicit-cartesian": return action("", { ...base, expression: d.expression.trim() });
    case "parametric": return action("-parametric", { ...base, xExpression: d.expression.trim(), yExpression: d.second.trim() });
    case "polar": return action("-polar", { ...base, rExpression: d.expression.trim() });
    case "implicit": return action("-implicit", { ...base, expression: d.expression.trim(), yDomain: { min: number(d.yMin), max: number(d.yMax), includeMin: true, includeMax: true } });
    case "inequality": return action("-inequality", { ...base, operator: d.operator, clauses: d.clauses.map((c) => ({ ...c, expression: c.expression.trim() })), yDomain: { min: number(d.yMin), max: number(d.yMax), includeMin: true, includeMax: true } });
    case "piecewise": return action("-piecewise", { ...base, pieces: d.pieces.map((p) => ({ expression: p.expression.trim(), domain: { min: number(p.min), max: number(p.max), includeMin: p.includeMin, includeMax: p.includeMax } })) });
    case "point-series": {
      if (!d.data.trim() && d.table) return action("-point-series", { ...base, table: d.table, mode: d.mode });
      const preview = previewGraph2DPointImport(d.data);
      if (preview.errors.length) throw new TypeError(preview.errors.join(" "));
      return action("-point-series", { ...base, domain: graph2DPointDomain(preview.rows), table: tables.publish(preview.rows), mode: d.mode });
    }
  }
};
