import { GRAPH2D_MAX_OBJECTS, validPointTableReference, validGraph2DScientificDatasetOrigin,
  validGraph2DAnalyticFieldOrigin, validGraph2DDerivedFieldOrigin, validGraph2DLinkedOverlayOrigin,
  type Graph2DDocument, type Graph2DDomain, type Graph2DObjectDisplay,
  type Graph2DPointTableReference, type Graph2DScientificDatasetOrigin,
  type Graph2DAnalyticFieldOrigin, type Graph2DDerivedFieldOrigin,
  type Graph2DLinkedOverlayOrigin } from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";
import { inspectGraph2DPiecewiseDomains } from "./graph2dPiecewise";
import { applyGraph2DParameterAction, isGraph2DParameterAction, type Graph2DParameterAction } from "./graph2dParameters";
import { isGraph2DFieldReference, reviewGraph2DFieldRelink, type Graph2DFieldReference } from "./graph2dFieldReference";
import { isGraph2DVectorFieldReference, reviewGraph2DVectorFieldRelink,
  type Graph2DVectorFieldReference } from "./graph2dVectorFieldReference";

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
export type Graph2DSlopeFieldDraft = Graph2DImplicitDraft;
export type Graph2DTrajectoryDraft = Readonly<{
  label: string; sourceFieldId: string; seed: Readonly<{ x: number; y: number }>;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DPhasePortraitDraft = Readonly<{
  label: string; xDerivative: string; yDerivative: string;
  domain: Graph2DDomain; yDomain: Graph2DDomain; timeSpan: number;
  seeds: readonly Readonly<{ x: number; y: number }>[];
  fieldDensity?: number;
  fieldUnits?: Readonly<{ x: string; y: string; time: string }>;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DTimeOdeDraft = Readonly<{
  label: string; expression: string; domain: Graph2DDomain; stateDomain: Graph2DDomain;
  seed: Readonly<{ t: number; x: number }>;
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
  origin?: Graph2DScientificDatasetOrigin;
  analyticOrigin?: Graph2DAnalyticFieldOrigin;
  derivedOrigin?: Graph2DDerivedFieldOrigin;
  linkedOrigin?: Graph2DLinkedOverlayOrigin;
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DPiecewiseDraft = Readonly<{
  label: string;
  pieces: readonly Readonly<{ expression: string; domain: Graph2DDomain }>[];
  style: Pick<Graph2DObjectDisplay, "color" | "lineWidth" | "lineStyle" | "visible">;
}>;
export type Graph2DAuthoringAction =
  | Graph2DParameterAction
  | Readonly<{ type: "save-field-reference"; reference: Graph2DFieldReference }>
  | Readonly<{ type: "relink-field-reference"; referenceId: string; replacement: Graph2DFieldReference }>
  | Readonly<{ type: "remove-field-reference"; referenceId: string }>
  | Readonly<{ type: "save-vector-field-reference"; reference: Graph2DVectorFieldReference }>
  | Readonly<{ type: "relink-vector-field-reference"; referenceId: string; replacement: Graph2DVectorFieldReference }>
  | Readonly<{ type: "remove-vector-field-reference"; referenceId: string }>
  | Readonly<{ type: "create"; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "edit"; objectId: string; draft: Graph2DFunctionDraft }>
  | Readonly<{ type: "create-parametric"; draft: Graph2DParametricDraft }>
  | Readonly<{ type: "edit-parametric"; objectId: string; draft: Graph2DParametricDraft }>
  | Readonly<{ type: "create-polar"; draft: Graph2DPolarDraft }>
  | Readonly<{ type: "edit-polar"; objectId: string; draft: Graph2DPolarDraft }>
  | Readonly<{ type: "create-implicit"; draft: Graph2DImplicitDraft }>
  | Readonly<{ type: "edit-implicit"; objectId: string; draft: Graph2DImplicitDraft }>
  | Readonly<{ type: "create-slope-field"; draft: Graph2DSlopeFieldDraft }>
  | Readonly<{ type: "edit-slope-field"; objectId: string; draft: Graph2DSlopeFieldDraft }>
  | Readonly<{ type: "create-trajectory"; draft: Graph2DTrajectoryDraft }>
  | Readonly<{ type: "edit-trajectory"; objectId: string; draft: Graph2DTrajectoryDraft }>
  | Readonly<{ type: "create-phase-portrait"; draft: Graph2DPhasePortraitDraft }>
  | Readonly<{ type: "edit-phase-portrait"; objectId: string; draft: Graph2DPhasePortraitDraft }>
  | Readonly<{ type: "create-time-ode"; draft: Graph2DTimeOdeDraft }>
  | Readonly<{ type: "edit-time-ode"; objectId: string; draft: Graph2DTimeOdeDraft }>
  | Readonly<{ type: "create-inequality"; draft: Graph2DInequalityDraft }>
  | Readonly<{ type: "edit-inequality"; objectId: string; draft: Graph2DInequalityDraft }>
  | Readonly<{ type: "create-point-series"; draft: Graph2DPointSeriesDraft }>
  | Readonly<{ type: "create-point-series-pair"; drafts: readonly [Graph2DPointSeriesDraft, Graph2DPointSeriesDraft] }>
  | Readonly<{ type: "edit-point-series"; objectId: string; draft: Graph2DPointSeriesDraft }>
  | Readonly<{ type: "edit-point-series-pair"; edits: readonly [
    Readonly<{ objectId: string; draft: Graph2DPointSeriesDraft }>,
    Readonly<{ objectId: string; draft: Graph2DPointSeriesDraft }> ] }>
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
export const validateGraph2DSlopeFieldDraft = validateGraph2DImplicitDraft;
export const validateGraph2DTrajectoryDraft = (draft: Graph2DTrajectoryDraft, document: Graph2DDocument): readonly string[] => {
  const field = document.source.objects.find(entry => entry.id === draft.sourceFieldId);
  const errors = [...validateGraph2DFunctionDraft({ ...draft, expression: "x",
    domain: { min: -1, max: 1, includeMin: true, includeMax: true } })];
  if (!field || field.kind !== "slope-field") errors.push("Choose an existing slope field.");
  if (!Number.isFinite(draft.seed.x) || !Number.isFinite(draft.seed.y) ||
      field?.kind === "slope-field" && (draft.seed.x < field.domain.min || draft.seed.x > field.domain.max ||
      draft.seed.y < field.yDomain.min || draft.seed.y > field.yDomain.max))
    errors.push("Initial point must be finite and inside the slope field bounds.");
  return errors;
};
export const validateGraph2DPhasePortraitDraft = (draft: Graph2DPhasePortraitDraft,
  variables: readonly string[] = ["x", "y"]): readonly string[] => {
  const errors = [...validateGraph2DImplicitDraft({ ...draft, expression: draft.xDerivative }, variables),
    ...validateGraph2DImplicitDraft({ ...draft, expression: draft.yDerivative }, variables)];
  if (!Number.isFinite(draft.timeSpan) || draft.timeSpan <= 0 || draft.timeSpan > 100)
    errors.push("Time horizon must be greater than 0 and at most 100.");
  if (draft.fieldDensity !== undefined && (!Number.isInteger(draft.fieldDensity) || draft.fieldDensity < 4 || draft.fieldDensity > 24))
    errors.push("Field density must be an integer from 4 to 24 arrows per longest side.");
  if (draft.fieldUnits !== undefined && Object.values(draft.fieldUnits).some(unit =>
    typeof unit !== "string" || unit.length > 24 || unit.trim() !== unit))
    errors.push("Coordinate and time units must be at most 24 characters without surrounding spaces.");
  if (draft.seeds.length > 8) errors.push("Use at most eight initial points.");
  for (const seed of draft.seeds) if (!Number.isFinite(seed.x) || !Number.isFinite(seed.y) ||
    seed.x < draft.domain.min || seed.x > draft.domain.max || seed.y < draft.yDomain.min || seed.y > draft.yDomain.max)
    errors.push("Every initial point must be finite and inside the phase domain.");
  return [...new Set(errors)];
};
export const validateGraph2DTimeOdeDraft = (draft: Graph2DTimeOdeDraft,
  variables: readonly string[] = ["t", "x"]): readonly string[] => {
  const errors = [...validateGraph2DFunctionDraft(draft, variables)];
  const state = draft.stateDomain, seed = draft.seed;
  if (!draft.domain.includeMin || !draft.domain.includeMax || !state.includeMin || !state.includeMax)
    errors.push("Time and state bounds include both endpoints.");
  if (!Number.isFinite(state.min) || !Number.isFinite(state.max) || state.min >= state.max ||
      typeof state.includeMin !== "boolean" || typeof state.includeMax !== "boolean")
    errors.push("State minimum must be less than maximum.");
  if (!Number.isFinite(seed.t) || !Number.isFinite(seed.x) || seed.t < draft.domain.min ||
      seed.t > draft.domain.max || seed.x < state.min || seed.x > state.max)
    errors.push("Initial time and value must be finite and inside the authored bounds.");
  if (seed.t - draft.domain.min > 100 || draft.domain.max - seed.t > 100)
    errors.push("Each time direction may span at most 100 units.");
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
  if (draft.origin !== undefined && !validGraph2DScientificDatasetOrigin(draft.origin)) errors.push("Scientific dataset provenance is invalid.");
  if (draft.analyticOrigin !== undefined && !validGraph2DAnalyticFieldOrigin(draft.analyticOrigin))
    errors.push("Analytic field provenance is invalid.");
  if (draft.derivedOrigin !== undefined && !validGraph2DDerivedFieldOrigin(draft.derivedOrigin))
    errors.push("Derived field provenance is invalid.");
  if (draft.linkedOrigin !== undefined && !validGraph2DLinkedOverlayOrigin(draft.linkedOrigin))
    errors.push("Linked field provenance is invalid.");
  if ([draft.origin, draft.analyticOrigin, draft.derivedOrigin, draft.linkedOrigin].filter(item => item !== undefined).length > 1)
    errors.push("Choose one provenance source for the point series.");
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
  if (isGraph2DParameterAction(action)) return applyGraph2DParameterAction(document, action);
  if (action.type === "save-field-reference") {
    if (!isGraph2DFieldReference(action.reference)) throw new TypeError("Invalid field reference.");
    const existing = document.source.fieldReferences ?? [];
    if (existing.some(item => item.id === action.reference.id)) throw new TypeError("Field component is already saved.");
    if (existing.length >= 16) throw new TypeError("Field reference limit reached.");
    return { source: { ...document.source, fieldReferences: [...existing, action.reference] },
      display: document.display, selection: document.selection };
  }
  if (action.type === "relink-field-reference") {
    const existing = document.source.fieldReferences ?? [];
    const saved = existing.find(item => item.id === action.referenceId);
    if (!saved) throw new TypeError("Field reference does not exist.");
    const review = reviewGraph2DFieldRelink(saved, action.replacement);
    if (!review.eligible) throw new TypeError("Replacement field component, axes, shape or checksum do not match.");
    const updated = { ...action.replacement, id: saved.id };
    return { source: { ...document.source, fieldReferences: existing.map(item =>
      item.id === saved.id ? updated : item) }, display: document.display, selection: document.selection };
  }
  if (action.type === "remove-field-reference") {
    const existing = document.source.fieldReferences ?? [];
    if (!existing.some(item => item.id === action.referenceId)) throw new TypeError("Field reference does not exist.");
    const remaining = existing.filter(item => item.id !== action.referenceId);
    const { fieldReferences: _removed, ...source } = document.source;
    return { source: remaining.length ? { ...source, fieldReferences: remaining } : source,
      display: document.display, selection: document.selection };
  }
  if (action.type === "save-vector-field-reference") {
    if (!isGraph2DVectorFieldReference(action.reference)) throw new TypeError("Invalid paired vector field reference.");
    const existing = document.source.vectorFieldReferences ?? [];
    if (existing.some(item => item.id === action.reference.id)) throw new TypeError("Vector field is already saved.");
    if (existing.length >= 8) throw new TypeError("Vector field reference limit reached.");
    return { source: { ...document.source, vectorFieldReferences: [...existing, action.reference] },
      display: document.display, selection: document.selection };
  }
  if (action.type === "relink-vector-field-reference") {
    const existing = document.source.vectorFieldReferences ?? [];
    const saved = existing.find(item => item.id === action.referenceId);
    if (!saved) throw new TypeError("Vector field reference does not exist.");
    if (!reviewGraph2DVectorFieldRelink(saved, action.replacement).eligible)
      throw new TypeError("Replacement vector components, axes, shape or checksums do not match.");
    const updated = { ...action.replacement, id: saved.id };
    return { source: { ...document.source, vectorFieldReferences: existing.map(item =>
      item.id === saved.id ? updated : item) }, display: document.display, selection: document.selection };
  }
  if (action.type === "remove-vector-field-reference") {
    const existing = document.source.vectorFieldReferences ?? [];
    if (!existing.some(item => item.id === action.referenceId)) throw new TypeError("Vector field reference does not exist.");
    const remaining = existing.filter(item => item.id !== action.referenceId);
    const { vectorFieldReferences: _removed, ...source } = document.source;
    return { source: remaining.length ? { ...source, vectorFieldReferences: remaining } : source,
      display: document.display, selection: document.selection };
  }
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
  } else if (action.type === "create-slope-field" || action.type === "edit-slope-field") {
    if (action.type === "edit-slope-field" && objects[index]?.kind !== "slope-field")
      throw new TypeError("Selected object is not a slope field.");
    if (document.source.variables.some(entry => entry.name === "y"))
      throw new TypeError("The coordinate name y conflicts with a document variable.");
    const names = ["x", "y", ...document.source.variables.map(entry => entry.name)];
    const errors = validateGraph2DSlopeFieldDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    if (action.type === "edit-slope-field" && objects.some(entry => entry.kind === "trajectory" &&
      entry.sourceFieldId === action.objectId && (entry.seed.x < action.draft.domain.min ||
        entry.seed.x > action.draft.domain.max || entry.seed.y < action.draft.yDomain.min ||
        entry.seed.y > action.draft.yDomain.max)))
      throw new TypeError("Move linked trajectory seeds inside the new field bounds before saving.");
    const parsed = parseGraph2DExpression(action.draft.expression, names);
    if (!parsed.ok) throw new TypeError("Slope expression is invalid.");
    if (action.type === "create-slope-field" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-slope-field" ? action.objectId : "slope_field_1";
    if (action.type === "create-slope-field") {
      let serial = 1;
      while (objects.some(entry => entry.id === id)) id = "slope_field_" + ++serial;
    }
    const object = { id, kind: "slope-field" as const, label: action.draft.label,
      expression: { source: action.draft.expression, variable: "xy" as const, ast: parsed.ast },
      domain: action.draft.domain, yDomain: action.draft.yDomain };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-slope-field") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-trajectory" || action.type === "edit-trajectory") {
    if (action.type === "edit-trajectory" && objects[index]?.kind !== "trajectory")
      throw new TypeError("Selected object is not a trajectory.");
    const errors = validateGraph2DTrajectoryDraft(action.draft, document);
    if (errors.length) throw new TypeError(errors.join(" "));
    if (action.type === "create-trajectory" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-trajectory" ? action.objectId : "trajectory_1";
    if (action.type === "create-trajectory") {
      let serial = 1;
      while (objects.some(entry => entry.id === id)) id = "trajectory_" + ++serial;
    }
    const object = { id, kind: "trajectory" as const, label: action.draft.label,
      sourceFieldId: action.draft.sourceFieldId, seed: action.draft.seed };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-trajectory") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-phase-portrait" || action.type === "edit-phase-portrait") {
    if (action.type === "edit-phase-portrait" && objects[index]?.kind !== "phase-portrait")
      throw new TypeError("Selected object is not a phase portrait.");
    if (document.source.variables.some(entry => entry.name === "y"))
      throw new TypeError("The coordinate name y conflicts with a document variable.");
    const names = ["x", "y", ...document.source.variables.map(entry => entry.name)];
    const errors = validateGraph2DPhasePortraitDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsedX = parseGraph2DExpression(action.draft.xDerivative, names);
    const parsedY = parseGraph2DExpression(action.draft.yDerivative, names);
    if (!parsedX.ok || !parsedY.ok) throw new TypeError("Phase equations are invalid.");
    if (action.type === "create-phase-portrait" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-phase-portrait" ? action.objectId : "phase_portrait_1";
    if (action.type === "create-phase-portrait") {
      let serial = 1;
      while (objects.some(entry => entry.id === id)) id = "phase_portrait_" + ++serial;
    }
    const object = { id, kind: "phase-portrait" as const, label: action.draft.label,
      xDerivative: { source: action.draft.xDerivative, variable: "xy" as const, ast: parsedX.ast },
      yDerivative: { source: action.draft.yDerivative, variable: "xy" as const, ast: parsedY.ast },
      domain: action.draft.domain, yDomain: action.draft.yDomain, timeSpan: action.draft.timeSpan,
      seeds: action.draft.seeds,
      ...(action.draft.fieldDensity === undefined ? {} : { fieldDensity: action.draft.fieldDensity }),
      ...(action.draft.fieldUnits === undefined ? {} : { fieldUnits: action.draft.fieldUnits }) };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-phase-portrait") { objects.push(object); displays.push(display); }
    else { objects[index] = object; displays[index] = display; }
    selection = { objectId: id, probe: null };
  } else if (action.type === "create-time-ode" || action.type === "edit-time-ode") {
    if (action.type === "edit-time-ode" && objects[index]?.kind !== "time-ode")
      throw new TypeError("Selected object is not a time-dependent ODE.");
    if (document.source.variables.some(entry => entry.name === "t" || entry.name === "x"))
      throw new TypeError("The coordinate names t and x conflict with document variables.");
    const names = ["t", "x", ...document.source.variables.map(entry => entry.name)];
    const errors = validateGraph2DTimeOdeDraft(action.draft, names);
    if (errors.length) throw new TypeError(errors.join(" "));
    const parsed = parseGraph2DExpression(action.draft.expression, names);
    if (!parsed.ok) throw new TypeError("Time-dependent ODE expression is invalid.");
    if (action.type === "create-time-ode" && objects.length >= GRAPH2D_MAX_OBJECTS)
      throw new TypeError("Function limit reached.");
    let id = action.type === "edit-time-ode" ? action.objectId : "time_ode_1";
    if (action.type === "create-time-ode") {
      let serial = 1;
      while (objects.some(entry => entry.id === id)) id = "time_ode_" + ++serial;
    }
    const object = { id, kind: "time-ode" as const, label: action.draft.label,
      expression: { source: action.draft.expression, variable: "tx" as const, ast: parsed.ast },
      domain: action.draft.domain, stateDomain: action.draft.stateDomain, seed: action.draft.seed };
    const display = { objectId: id, ...action.draft.style };
    if (action.type === "create-time-ode") { objects.push(object); displays.push(display); }
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
  } else if (action.type === "edit-point-series-pair") {
    const [first, second] = action.edits;
    if (first.objectId === second.objectId) throw new TypeError("Choose two distinct point series.");
    for (const edit of action.edits) {
      const target = objects.findIndex(entry => entry.id === edit.objectId);
      if (target < 0 || objects[target]?.kind !== "point-series")
        throw new TypeError("Both selected objects must be point series.");
      const errors = validateGraph2DPointSeriesDraft(edit.draft);
      if (errors.length) throw new TypeError(errors.join(" "));
    }
    for (const edit of action.edits) {
      const target = objects.findIndex(entry => entry.id === edit.objectId);
      const draft = edit.draft;
      objects[target] = { id: edit.objectId, kind: "point-series", label: draft.label,
        table: draft.table, mode: draft.mode, missing: "gap", domain: draft.domain,
        ...(draft.origin ? { origin: draft.origin } : {}),
        ...(draft.analyticOrigin ? { analyticOrigin: draft.analyticOrigin } : {}),
        ...(draft.derivedOrigin ? { derivedOrigin: draft.derivedOrigin } : {}) };
      if (draft.linkedOrigin) objects[target] = { ...objects[target], linkedOrigin: draft.linkedOrigin };
      displays[target] = { objectId: edit.objectId, ...draft.style };
    }
    selection = { objectId: document.selection.objectId, probe: null };
  } else if (action.type === "create-point-series-pair") {
    if (objects.length > GRAPH2D_MAX_OBJECTS - 2) throw new TypeError("Function limit reached.");
    for (const draft of action.drafts) {
      const errors = validateGraph2DPointSeriesDraft(draft);
      if (errors.length) throw new TypeError(errors.join(" "));
    }
    for (const draft of action.drafts) {
      let serial = 1, id = "series_1";
      while (objects.some(entry => entry.id === id)) id = "series_" + ++serial;
      objects.push({ id, kind: "point-series", label: draft.label, table: draft.table,
        mode: draft.mode, missing: "gap", domain: draft.domain,
        ...(draft.origin ? { origin: draft.origin } : {}),
        ...(draft.analyticOrigin ? { analyticOrigin: draft.analyticOrigin } : {}),
        ...(draft.derivedOrigin ? { derivedOrigin: draft.derivedOrigin } : {}),
        ...(draft.linkedOrigin ? { linkedOrigin: draft.linkedOrigin } : {}) });
      displays.push({ objectId: id, ...draft.style });
      selection = { objectId: id, probe: null };
    }
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
      table: action.draft.table, mode: action.draft.mode, missing: "gap" as const, domain: action.draft.domain,
      ...(action.draft.origin ? { origin: action.draft.origin } : {}),
      ...(action.draft.analyticOrigin ? { analyticOrigin: action.draft.analyticOrigin } : {}),
      ...(action.draft.derivedOrigin ? { derivedOrigin: action.draft.derivedOrigin } : {}),
      ...(action.draft.linkedOrigin ? { linkedOrigin: action.draft.linkedOrigin } : {}) };
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
    if (objects.some(entry => entry.kind === "trajectory" && entry.sourceFieldId === action.objectId))
      throw new TypeError("Remove trajectories depending on this slope field before deleting it.");
    if (document.source.constructions?.objects.some(construction => construction.inputs.some(input =>
      input.kind === "source" && input.objectId === action.objectId)))
      throw new TypeError("Remove constructions depending on this graph source before deleting it.");
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
  return { source: { ...document.source, objects }, display: { ...document.display, objects: displays,
    ...(document.display.pinnedProbes !== undefined ? { pinnedProbes: document.display.pinnedProbes.filter((probe) =>
      objects.some((object) => object.id === probe.objectId)) } : {}) }, selection };
};
