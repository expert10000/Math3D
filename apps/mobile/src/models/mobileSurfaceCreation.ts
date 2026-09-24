import type { SceneDocument, SurfaceDefinition } from "@math3d/core";
import { createUniqueMobileSceneObjectId } from "./mobileSceneObjectOperations";

export type MobilePrimitiveKind = "plane" | "sphere" | "cylinder" | "torus";

export type MobileExplicitSurfaceDraft = {
  id: string;
  expression: string;
  xSpan: string;
  ySpan: string;
  resolution: string;
};

export type MobileParametricSurfaceDraft = {
  id: string;
  xExpr: string;
  yExpr: string;
  zExpr: string;
  uMin: string;
  uMax: string;
  vMin: string;
  vMax: string;
  resolution: string;
};

export const DEFAULT_MOBILE_EXPLICIT_DRAFT: MobileExplicitSurfaceDraft = {
  id: "graph",
  expression: "sin(x)*cos(y)",
  xSpan: "3.14",
  ySpan: "3.14",
  resolution: "56",
};

export const DEFAULT_MOBILE_PARAMETRIC_DRAFT: MobileParametricSurfaceDraft = {
  id: "parametric-surface",
  xExpr: "cos(u)*(1 + 0.3*cos(v))",
  yExpr: "sin(u)*(1 + 0.3*cos(v))",
  zExpr: "0.3*sin(v)",
  uMin: String(-Math.PI),
  uMax: String(Math.PI),
  vMin: String(-Math.PI),
  vMax: String(Math.PI),
  resolution: "56",
};

type MobileSurfaceBuildResult =
  | { ok: true; surface: SurfaceDefinition }
  | { ok: false; message: string };

const expressionIdentifiers = new Set([
  "sin", "cos", "tan", "sinh", "cosh", "tanh", "asin", "acos", "atan", "atan2",
  "exp", "log", "sqrt", "abs", "pow", "min", "max", "floor", "ceil", "round", "PI", "E",
]);

export const validateMobileSurfaceExpression = (expression: string, variables: readonly string[]): string | null => {
  const trimmed = expression.trim();
  if (!trimmed) return "Expression cannot be empty.";
  if (trimmed.length > 500) return "Expression is too long.";
  if (trimmed.includes("^")) return "Use ** or pow(a,b) for powers; ^ is not exponentiation.";
  if (/[^0-9A-Za-z_+\-*/().,\s]/.test(trimmed)) return "Expression contains unsupported characters.";
  const allowed = new Set([...expressionIdentifiers, ...variables]);
  const unknown = [...trimmed.matchAll(/[A-Za-z_]\w*/g)].map((match) => match[0]).find((token) => !allowed.has(token));
  if (unknown) return `Unknown name ${unknown}.`;
  try {
    const args = variables.join(",");
    const evaluator = new Function(
      args,
      "const { sin, cos, tan, sinh, cosh, tanh, asin, acos, atan, atan2, exp, log, sqrt, abs, pow, min, max, floor, ceil, round, PI, E } = Math;" +
        `return (${trimmed});`
    );
    const value = evaluator(...variables.map(() => 0.37));
    if (!Number.isFinite(value)) return "Expression must produce a finite number at a sample point.";
  } catch {
    return "Expression syntax is invalid.";
  }
  return null;
};

const parseNumber = (value: string, label: string): { ok: true; value: number } | { ok: false; message: string } => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false, message: `${label} must be a finite number.` };
};

const parseResolution = (value: string): { ok: true; value: number } | { ok: false; message: string } => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 12 || parsed > 192) {
    return { ok: false, message: "Resolution must be an integer from 12 to 192." };
  }
  return { ok: true, value: parsed };
};

const validateObjectId = (scene: SceneDocument | null, requested: string): { ok: true; value: string } | { ok: false; message: string } => {
  const id = requested.trim().replace(/\s+/g, "-");
  if (!id) return { ok: false, message: "Object name cannot be empty." };
  if ((scene?.surfaces ?? []).some((surface) => surface.id === id)) return { ok: false, message: `An object named ${id} already exists.` };
  return { ok: true, value: id };
};

export const buildMobileExplicitSurface = (
  scene: SceneDocument | null,
  draft: MobileExplicitSurfaceDraft
): MobileSurfaceBuildResult => {
  const id = validateObjectId(scene, draft.id);
  if (!id.ok) return id;
  const expressionError = validateMobileSurfaceExpression(draft.expression, ["x", "y"]);
  if (expressionError) return { ok: false, message: expressionError };
  const xSpan = parseNumber(draft.xSpan, "X span");
  if (!xSpan.ok) return xSpan;
  const ySpan = parseNumber(draft.ySpan, "Y span");
  if (!ySpan.ok) return ySpan;
  if (xSpan.value <= 0 || ySpan.value <= 0 || xSpan.value > 100 || ySpan.value > 100) {
    return { ok: false, message: "Domain spans must be greater than 0 and at most 100." };
  }
  const resolution = parseResolution(draft.resolution);
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    surface: {
      id: id.value,
      kind: "explicit",
      expression: draft.expression.trim(),
      domain: { xSpan: xSpan.value, ySpan: ySpan.value },
      resolution: resolution.value,
    },
  };
};

export const buildMobileParametricSurface = (
  scene: SceneDocument | null,
  draft: MobileParametricSurfaceDraft
): MobileSurfaceBuildResult => {
  const id = validateObjectId(scene, draft.id);
  if (!id.ok) return id;
  for (const [label, expression] of [["X", draft.xExpr], ["Y", draft.yExpr], ["Z", draft.zExpr]] as const) {
    const error = validateMobileSurfaceExpression(expression, ["u", "v"]);
    if (error) return { ok: false, message: `${label} expression: ${error}` };
  }
  const bounds = [
    parseNumber(draft.uMin, "U minimum"), parseNumber(draft.uMax, "U maximum"),
    parseNumber(draft.vMin, "V minimum"), parseNumber(draft.vMax, "V maximum"),
  ];
  const invalid = bounds.find((bound) => !bound.ok);
  if (invalid && !invalid.ok) return invalid;
  const [uMin, uMax, vMin, vMax] = bounds.map((bound) => bound.ok ? bound.value : 0);
  if (uMin >= uMax || vMin >= vMax) return { ok: false, message: "Each domain minimum must be smaller than its maximum." };
  if (uMax - uMin > 200 || vMax - vMin > 200) return { ok: false, message: "Each parameter range must be at most 200." };
  const resolution = parseResolution(draft.resolution);
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    surface: {
      id: id.value,
      kind: "parametric",
      xExpr: draft.xExpr.trim(),
      yExpr: draft.yExpr.trim(),
      zExpr: draft.zExpr.trim(),
      domain: { uMin, uMax, vMin, vMax },
      resolution: resolution.value,
    },
  };
};

const primitiveBaseId: Record<MobilePrimitiveKind, string> = {
  plane: "plane",
  sphere: "sphere",
  cylinder: "cylinder",
  torus: "torus",
};

export const createMobilePrimitiveSurface = (
  kind: MobilePrimitiveKind,
  scene: SceneDocument | null
): SurfaceDefinition => {
  const placeholder: SceneDocument = scene ?? { id: "new", title: "New scene", createdAt: 0, updatedAt: 0, surfaces: [] };
  const id = createUniqueMobileSceneObjectId(placeholder, primitiveBaseId[kind]);
  if (kind === "plane") {
    return { id, kind: "explicit", expression: "0", domain: { xSpan: 2, ySpan: 2 }, resolution: 36 };
  }
  if (kind === "sphere") {
    return {
      id,
      kind: "parametric",
      xExpr: "cos(u)*cos(v)",
      yExpr: "sin(u)*cos(v)",
      zExpr: "sin(v)",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2 },
      resolution: 56,
    };
  }
  if (kind === "cylinder") {
    return {
      id,
      kind: "parametric",
      xExpr: "cos(u)",
      yExpr: "sin(u)",
      zExpr: "v",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -1.5, vMax: 1.5 },
      resolution: 48,
    };
  }
  return {
    id,
    kind: "parametric",
    xExpr: "(1.6 + 0.5*cos(v))*cos(u)",
    yExpr: "(1.6 + 0.5*cos(v))*sin(u)",
    zExpr: "0.5*sin(v)",
    domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI },
    resolution: 64,
  };
};

export const appendMobileSurface = (
  scene: SceneDocument | null,
  surface: SurfaceDefinition,
  now = Date.now()
): SceneDocument => scene
  ? { ...scene, surfaces: [...(scene.surfaces ?? []), surface], updatedAt: now }
  : {
      id: `scene-mobile-created-${now}`,
      title: "Untitled scene",
      createdAt: now,
      updatedAt: now,
      surfaces: [surface],
    };
