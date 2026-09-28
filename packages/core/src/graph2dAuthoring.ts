import { GRAPH2D_MAX_OBJECTS, validPointTableReference,
  type Graph2DDocument, type Graph2DDomain, type Graph2DObjectDisplay,
  type Graph2DPointTableReference } from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";
import { inspectGraph2DPiecewiseDomains } from "./graph2dPiecewise";

export type Graph2DScene = Pick<Graph2DDocument, "source" | "display" | "selection">;
export type Graph2DFunctionDraft = Readonly<{
  label: string;
  expression: string;
  domain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DParametricDraft = Readonly<{
  label: string;
  xExpression: string;
  yExpression: string;
  domain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DPolarDraft = Readonly<{
  label: string;
  rExpression: string;
  domain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DImplicitDraft = Readonly<{
  label: string;
  expression: string;
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DInequalityDraft = Readonly<{
  label: string;
  clauses: readonly Readonly<{ expression: string; comparator: "<" | "<=" | ">" | ">=" }>[];
  operator: "all" | "any";
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DPointSeriesDraft = Readonly<{
  label: string;
  table: Graph2DPointTableReference;
  mode: "points" | "line";
  domain: Graph2DDomain;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DPiecewiseDraft = Readonly<{
  label: string;
  pieces: readonly Readonly<{ expression: string; domain: Graph2DDomain }>[];
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DAuthoringAction =
  | Readonly<{ type: "create"; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "edit"; objectId: string; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "create-parametric"; draft: Graph2DParametricDraft }>
  | Readonly<{ type: "edit-parametric"; objectId: string; draft: Graph2DParametricDraft }>
  | Readonly<{ type: "create-polar"; draft: Graph2DPolarDraft }>
  | Readonly<{ type: "edit-polar"; objectId: string; draft: Graph2DPolarDraft }>
  | Readonly<{ type: "create-implicit"; draft: Graph2DImplicitDraft }>
  | Readonly<{ type: "edit-implicit"; objectId: string; draft: Graph2DImplicitDraft }>
  | Readonly<{ type: "create-inequality"; draft: Graph2DInequalityDraft }>
  | Readonly<{ type: "edit-inequality"; objectId: string; draft: Graph2DInequalityDraft }>
  | Readonly<{ type: "create-point-series"; draft: Graph2DPointSeriesDraft }>
  | Readonly<{ type: "edit-point-series"; objectId: string; draft: Graph2DPointSeriesDraft }>
  | Readonly<{ type: "create-piecewise"; draft: Graph2DPiecewiseDraft }>
  | Readonly<{ type: "edit-piecewise"; objectId: string; draft: Graph2DPiecewiseDraft }>
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

export const validateGraph2DParametricDraft = (draft: Graph2DParametricDraft,
  variables: readonly string[] = ["t"]): readonly string[] => {
  const errors: string[] = [];
  if (!draft.label.trim() || draft.label !== draft.label.trim() || draft.label.length > 160)
    errors.push("Enter a label of 1–160 characters without surrounding spaces.");
  for (const [name, expression] of [["x(t)", draft.xExpression], ["y(t)", draft.yExpression]]) {
    if (!expression.trim() || expression !== expression.trim() || expression.length > 2048)
      errors.push(`Enter a valid ${name} expression of 1–2048 characters.`);
    else {
      const parsed = parseGraph2DExpression(expression, variables);
      if (!parsed.ok) errors.push(...parsed.diagnostics.map((diagnostic) => diagnostic.message));
    }
  }
  if (!Number.isFinite(draft.domain.min) || !Number.isFinite(draft.domain.max) || draft.domain.min >= draft.domain.max ||
    typeof draft.domain.includeMin !== "boolean" || typeof draft.domain.includeMax !== "boolean")
    errors.push("Parameter minimum must be less than maximum.");
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.style.color) || !Number.isFinite(draft.style.lineWidth) ||
    draft.style.lineWidth < 0.5 || draft.style.lineWidth > 12 ||
    !["solid", "dashed", "dotted"].includes(draft.style.lineStyle) || typeof draft.style.visible !== "boolean")
    errors.push("Choose a valid color, line width, and line style.");
  return errors;
};

export const validateGraph2DPolarDraft = (draft: Graph2DPolarDraft,
  variables: readonly string[] = ["theta"]): readonly string[] => {
  const errors: string[] = [];
  if (!draft.label.trim() || draft.label !== draft.label.trim() || draft.label.length > 160)
    errors.push("Enter a label of 1–160 characters without surrounding spaces.");
  if (!draft.rExpression.trim() || draft.rExpression !== draft.rExpression.trim() || draft.rExpression.length > 2048)
    errors.push("Enter a valid r(θ) expression of 1–2048 characters.");
  else {
    const parsed = parseGraph2DExpression(draft.rExpression, variables);
    if (!parsed.ok) errors.push(...parsed.diagnostics.map((diagnostic) => diagnostic.message));
  }
  if (!Number.isFinite(draft.domain.min) || !Number.isFinite(draft.domain.max) || draft.domain.min >= draft.domain.max ||
    typeof draft.domain.includeMin !== "boolean" || typeof draft.domain.includeMax !== "boolean")
    errors.push("Angular minimum must be less than maximum.");
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.style.color) || !Number.isFinite(draft.style.lineWidth) ||
    draft.style.lineWidth < 0.5 || draft.style.lineWidth > 12 ||
    !["solid", "dashed", "dotted"].includes(draft.style.lineStyle) || typeof draft.style.visible !== "boolean")
    errors.push("Choose a valid color, line width, and line style.");
  return errors;
};

export const validateGraph2DImplicitDraft = (draft: Graph2DImplicitDraft,
  variables: readonly string[] = ["x", "y"]): readonly string[] => {
  const errors = [...validateGraph2DFunctionDraft(draft, variables)];
  if (!Number.isFinite(draft.yDomain.min) || !Number.isFinite(draft.yDomain.max) ||
    draft.yDomain.min >= draft.yDomain.max || typeof draft.yDomain.includeMin !== "boolean" ||
    typeof draft.yDomain.includeMax !== "boolean") errors.push("Y bound minimum must be less than maximum.");
  return errors;
};
export const validateGraph2DInequalityDraft = (draft: Graph2DInequalityDraft,
  variables: readonly string[] = ["x", "y"]): readonly string[] => {
  const errors = [...validateGraph2DImplicitDraft({ ...draft, expression: draft.clauses[0]?.expression ?? "" }, variables)];
  if (!["all", "any"].includes(draft.operator)) errors.push("Choose AND or OR for the region.");
  if (draft.clauses.length < 1 || draft.clauses.length > 8) errors.push("Use 1–8 region conditions.");
  for (const clause of draft.clauses) {
    if (!["<", "<=", ">", ">="].includes(clause.comparator)) errors.push("Choose a valid comparison.");
    if (clause.expression.length < 1 || clause.expression.length > 2048 ||
      clause.expression !== clause.expression.trim()) errors.push("Enter a valid region expression.");
    else {
      const parsed = parseGraph2DExpression(clause.expression, variables);
      if (!parsed.ok) errors.push(...parsed.diagnostics.map((item) => item.message));
    }
  }
  return errors;
};
export const validateGraph2DPointSeriesDraft = (draft: Graph2DPointSeriesDraft): readonly string[] => {
  const errors = [...validateGraph2DFunctionDraft({ ...draft, expression: "x" })];
  if (!validPointTableReference(draft.table)) errors.push("Point table reference is invalid.");
  if (!["points", "line"].includes(draft.mode)) errors.push("Choose points or connected line mode.");
  return errors;
};
export const validateGraph2DPiecewiseDraft = (draft: Graph2DPiecewiseDraft,
  variables: readonly string[] = ["x"]): readonly string[] => {
  const errors: string[] = [];
  if (draft.pieces.length < 1 || draft.pieces.length > 16) errors.push("Use 1–16 ordered pieces.");
  for (const piece of draft.pieces) errors.push(...validateGraph2DFunctionDraft({ ...draft,
    expression: piece.expression, domain: piece.domain }, variables));
  const parsedPieces = draft.pieces.flatMap((piece) => {
    const parsed = parseGraph2DExpression(piece.expression, variables);
    return parsed.ok ? [{ expression: { source: piece.expression, variable: "x" as const, ast: parsed.ast }, domain: piece.domain }] : [];
  });
  if (parsedPieces.length === draft.pieces.length && inspectGraph2DPiecewiseDomains({ pieces: parsedPieces })
    .some((issue) => issue.kind === "overlap")) errors.push("Piece domains must be ordered and must not overlap.");
  return [...new Set(errors)];
};

export const applyGraph2DAuthoring = (document: Graph2DDocument, action: Graph2DAuthoringAction): Graph2DScene => {
  const objects = [...document.source.objects];
  const displays = [...document.display.objects];
  let selection = document.selection;
  const index = "objectId" in action ? objects.findIndex((entry) => entry.id === action.objectId) : -1;
  if ("objectId" in action && index < 0) throw new TypeError("Function does not exist.");
  if (action.type === "create" || action.type === "edit") {
    if (action.type === "edit" && objects[index]?.kind !== "explicit-cartesian")
      throw new TypeError("Selected object is not an explicit function.");
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
  } else if (action.type === "create-parametric" || action.type === "edit-parametric") {
    if (action.type === "edit-parametric" && objects[index]?.kind !== "parametric")
      throw new TypeError("Selected object is not parametric.");
    if (document.source.variables.some((entry) => entry.name === "t"))
      throw new TypeError("The parameter name t conflicts with a document variable.");
    const names = ["t", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DParametricDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsedX = parseGraph2DExpression(action.draft.xExpression, names);
    const parsedY = parseGraph2DExpression(action.draft.yExpression, names);
    if (!parsedX.ok || !parsedY.ok) throw new TypeError("Parametric expressions are invalid.");
    if (action.type === "create-parametric" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-parametric" ? action.objectId : "parametric_1";
    if (action.type === "create-parametric") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "parametric_" + ++serial;
    }
    const object = { id, kind: "parametric" as const, label: action.draft.label,
      xExpression: { source: action.draft.xExpression, variable: "t" as const, ast: parsedX.ast },
      yExpression: { source: action.draft.yExpression, variable: "t" as const, ast: parsedY.ast },
      domain: action.draft.domain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-parametric") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-polar" || action.type === "edit-polar") {
    if (action.type === "edit-polar" && objects[index]?.kind !== "polar")
      throw new TypeError("Selected object is not polar.");
    if (document.source.variables.some((entry) => entry.name === "theta"))
      throw new TypeError("The parameter name theta conflicts with a document variable.");
    const names = ["theta", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DPolarDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsed = parseGraph2DExpression(action.draft.rExpression, names);
    if (!parsed.ok) throw new TypeError("Polar expression is invalid.");
    if (action.type === "create-polar" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-polar" ? action.objectId : "polar_1";
    if (action.type === "create-polar") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "polar_" + ++serial;
    }
    const object = { id, kind: "polar" as const, label: action.draft.label,
      rExpression: { source: action.draft.rExpression, variable: "theta" as const, ast: parsed.ast },
      domain: action.draft.domain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-polar") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-implicit" || action.type === "edit-implicit") {
    if (action.type === "edit-implicit" && objects[index]?.kind !== "implicit")
      throw new TypeError("Selected object is not an implicit contour.");
    if (document.source.variables.some((entry) => entry.name === "y"))
      throw new TypeError("The coordinate name y conflicts with a document variable.");
    const names = ["x", "y", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DImplicitDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsed = parseGraph2DExpression(action.draft.expression, names);
    if (!parsed.ok) throw new TypeError("Implicit expression is invalid.");
    if (action.type === "create-implicit" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-implicit" ? action.objectId : "implicit_1";
    if (action.type === "create-implicit") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "implicit_" + ++serial;
    }
    const object = { id, kind: "implicit" as const, label: action.draft.label,
      expression: { source: action.draft.expression, variable: "xy" as const, ast: parsed.ast },
      domain: action.draft.domain, yDomain: action.draft.yDomain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-implicit") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-inequality" || action.type === "edit-inequality") {
    if (action.type === "edit-inequality" && objects[index]?.kind !== "inequality")
      throw new TypeError("Selected object is not an inequality region.");
    if (document.source.variables.some((entry) => entry.name === "y"))
      throw new TypeError("The coordinate name y conflicts with a document variable.");
    const names = ["x", "y", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DInequalityDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const clauses = action.draft.clauses.map((clause) => {
      const parsed = parseGraph2DExpression(clause.expression, names);
      if (!parsed.ok) throw new TypeError("Region condition is invalid.");
      return { source: clause.expression, variable: "xy" as const, ast: parsed.ast, comparator: clause.comparator };
    });
    if (action.type === "create-inequality" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-inequality" ? action.objectId : "inequality_1";
    if (action.type === "create-inequality") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "inequality_" + ++serial;
    }
    const object = { id, kind: "inequality" as const, label: action.draft.label,
      clauses, operator: action.draft.operator, domain: action.draft.domain, yDomain: action.draft.yDomain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-inequality") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-piecewise" || action.type === "edit-piecewise") {
    if (action.type === "edit-piecewise" && objects[index]?.kind !== "piecewise")
      throw new TypeError("Selected object is not piecewise.");
    const names = ["x", ...document.source.variables.map((entry) => entry.name)];
    const errors = validateGraph2DPiecewiseDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    if (action.type === "create-piecewise" && objects.length >= GRAPH2D_MAX_OBJECTS) throw new TypeError("Function limit reached.");
    const pieces = action.draft.pieces.map((piece) => {
      const parsed = parseGraph2DExpression(piece.expression, names);
      if (!parsed.ok) throw new TypeError("Piece expression is invalid.");
      return { expression: { source: piece.expression, variable: "x" as const, ast: parsed.ast }, domain: piece.domain };
    });
    let id = action.type === "edit-piecewise" ? action.objectId : "piecewise_1";
    if (action.type === "create-piecewise") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "piecewise_" + ++serial;
    }
    const object = { id, kind: "piecewise" as const, label: action.draft.label, pieces };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-piecewise") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-point-series" || action.type === "edit-point-series") {
    if (action.type === "edit-point-series" && objects[index]?.kind !== "point-series")
      throw new TypeError("Selected object is not a point series.");
    const errors = validateGraph2DPointSeriesDraft(action.draft);
    if (errors.length) throw new TypeError(errors.join(" "));
    if (action.type === "create-point-series" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-point-series" ? action.objectId : "series_1";
    if (action.type === "create-point-series") {
      let serial = 1;
      while (objects.some((entry) => entry.id === id)) id = "series_" + ++serial;
    }
    const object = { id, kind: "point-series" as const, label: action.draft.label,
      table: action.draft.table, mode: action.draft.mode, missing: "gap" as const, domain: action.draft.domain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-point-series") { objects.push(object); displays.push(display); }
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
