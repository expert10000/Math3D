import { GRAPH2D_FUNCTIONS } from "./graph2dExpression";

export const GRAPH2D_PARAMETERS_CAPABILITY = "graph2d.parameters.v1" as const;
export const GRAPH2D_PARAMETER_LIMITS = Object.freeze({ count: 16, magnitude: 1e9, steps: 100000, unitLength: 64 });
export type Graph2DParameterControl = Readonly<{ min: number; max: number; step: number; unit: string }>;
export type Graph2DParameter = Readonly<{ name: string; value: number; control?: Graph2DParameterControl }>;
export type Graph2DParameterDraft = Readonly<{ name: string; value: number } & Graph2DParameterControl>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.sort().join("|");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const reserved = new Set<string>(["x", "y", "t", "theta", "pi", "e", "tau", ...GRAPH2D_FUNCTIONS]);
export const isGraph2DParameterName = (name: unknown): name is string => typeof name === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(name) && !reserved.has(name);
export const isGraph2DParameterControl = (value: unknown): value is Graph2DParameterControl => record(value) && exact(value, ["min", "max", "step", "unit"]) &&
  finite(value.min) && finite(value.max) && finite(value.step) && Math.max(Math.abs(value.min), Math.abs(value.max)) <= GRAPH2D_PARAMETER_LIMITS.magnitude &&
  value.max - value.min >= 1e-9 && value.step > 0 && value.step <= value.max - value.min && (value.max - value.min) / value.step <= GRAPH2D_PARAMETER_LIMITS.steps &&
  value.min + value.step > value.min && value.max - value.step < value.max && typeof value.unit === "string" && value.unit.length <= GRAPH2D_PARAMETER_LIMITS.unitLength &&
  value.unit.trim() === value.unit && !/[\u0000-\u001f\u007f]/.test(value.unit);
export const isGraph2DParameter = (value: unknown): value is Graph2DParameter => record(value) &&
  exact(value, ["name", "value", ...(value.control !== undefined ? ["control"] : [])]) && typeof value.name === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value.name) && value.name !== "x" && finite(value.value) &&
  (value.control === undefined || isGraph2DParameterName(value.name) && isGraph2DParameterControl(value.control) && value.value >= value.control.min && value.value <= value.control.max);
export const validateGraph2DParameterDraft = (draft: Graph2DParameterDraft): readonly string[] => {
  const errors: string[] = [];
  if (!isGraph2DParameterName(draft.name)) errors.push("Use a non-reserved lowercase parameter name (1–32 letters/digits/underscores).");
  const { min, max, step, unit } = draft;
  if (!isGraph2DParameterControl({ min, max, step, unit })) errors.push("Use finite increasing bounds within ±1e9, a positive representable step (at most 100,000 steps), and a unit label of at most 64 characters.");
  if (!finite(draft.value) || draft.value < min || draft.value > max) errors.push("Parameter value must be finite and inside its inclusive range.");
  return errors;
};

/** Slider grid is anchored at min; the max endpoint is always reachable. Typed in-range values remain exact. */
export const quantizeGraph2DParameterValue = (control: Graph2DParameterControl, value: number): number => {
  if (!isGraph2DParameterControl(control) || !finite(value)) throw new TypeError("Invalid parameter slider input.");
  if (value <= control.min) return control.min; if (value >= control.max) return control.max;
  const result = control.min + Math.round((value - control.min) / control.step) * control.step;
  return Math.min(control.max, Math.max(control.min, Number(result.toPrecision(15))));
};
export const defaultGraph2DParameterDraft = (parameter?: Graph2DParameter): Graph2DParameterDraft => {
  if (parameter?.control) return { name: parameter.name, value: parameter.value, ...parameter.control };
  const value = parameter?.value ?? 0, span = Math.max(1, Math.abs(value) * .5);
  const min = Math.max(-1e9, Math.min(-5, value - span)), max = Math.min(1e9, Math.max(5, value + span));
  return { name: parameter?.name ?? "a", value, min, max, step: Number(((max - min) / 100).toPrecision(12)), unit: "" };
};
export const graph2DParameterNumber = (text: string): number => {
  const value = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new TypeError("Enter finite decimal numbers (use a decimal point).");
  return Number(value);
};
