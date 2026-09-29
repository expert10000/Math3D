import { canonicalJsonStringify } from "../documentIdentity";
import { applyGraph2DAuthoring, type Graph2DAuthoringAction } from "../graph2dAuthoring";
import { createGraph2DDocument, type Graph2DDocument } from "../graph2dDocument";
import { createGraph2DAnimationPlan, type Graph2DAnimationDraft } from "../graph2dAnimation";
import type { Graph2DParameterDraft } from "../graph2dParameterTypes";
import { createGraph2DPreset, type Graph2DPreset } from "../graph2dPresets";
import { getGraph2DPresetCatalog } from "./catalog";

export type Graph2DInteractivePresetGuidance = Readonly<{
  presetId: string; title: string; description: string;
  parameters: readonly Readonly<{ name: string; defaultValue: number; hint: string }>[];
  animation: Graph2DAnimationDraft;
}>;
type Recipe = {
  id: string; description: string;
  parameters: (Graph2DParameterDraft & { hint: string })[];
  expressions: Record<number, readonly string[]>;
  animate: string; from: number; to: number; frames?: number;
};
const p = (name: string, value: number, min: number, max: number, step: number, unit: string, hint: string) =>
  ({ name, value, min, max, step, unit, hint });
// Reviewed ranges bound work and preserve the original mathematical scene at defaults.
// These are opt-in v2 copies, never a silent edit of the frozen v1 catalog or thumbnails.
const recipes: readonly Recipe[] = [
  { id: "line-comparison", description: "Vary the slope and intercept of a*x+b against the unit-slope line.",
    parameters: [p("a", 2, -3, 3, .1, "ratio", "Slope; negative values reverse the line."), p("b", 1, -2, 2, .1, "graph units", "Vertical intercept.")],
    expressions: {}, animate: "a", from: -3, to: 3 },
  { id: "translated-quadratic", description: "Move the vertex of (x-h)^2+k while keeping x^2 for comparison.",
    parameters: [p("h", 1, -1, 2, .1, "graph units", "Horizontal vertex coordinate."), p("k", -1, -2, 2, .1, "graph units", "Vertical vertex coordinate.")],
    expressions: { 1: ["(x-h)^2+k"] }, animate: "h", from: -1, to: 2 },
  { id: "damped-wave", description: "Change damping d in exp(-d*x)*sin(3*x); both authored envelopes use the same binding.",
    parameters: [p("d", .2, .05, .5, .01, "1/graph unit", "Positive damping rate; no negative exponential growth.")],
    expressions: { 0: ["exp(-d*x)*sin(3*x)"], 1: ["exp(-d*x)"], 2: ["-exp(-d*x)"] }, animate: "d", from: .05, to: .5 },
  { id: "wave-beats", description: "Change the second frequency f in sin(4*x)+sin(f*x). The authored comparison 2*cos((f-4)*x/2) changes with it; it is a signed envelope, not an analysis result.",
    parameters: [p("f", 4.5, 4.1, 5, .05, "rad/graph unit", "Second frequency; the difference from 4 sets beat spacing.")],
    expressions: { 0: ["sin(4*x)+sin(f*x)"], 1: ["2*cos((f-4)*x/2)"] }, animate: "f", from: 4.1, to: 5 },
  { id: "circle-ellipse", description: "Change the ellipse's horizontal amplitude a against a unit circle; equal axes preserve shape.",
    parameters: [p("a", 2, .5, 2.3, .1, "graph units", "Positive horizontal semiaxis; the vertical semiaxis stays 1.")],
    expressions: { 1: ["a*cos(t)", "sin(t)"] }, animate: "a", from: .5, to: 2.3 },
  { id: "lissajous", description: "Shift phase phi in sin(3*t+phi),sin(2*t). Integer frequencies remain fixed so the path still closes over one turn.",
    parameters: [p("phi", 0, -3.14, 3.14, .02, "rad", "Horizontal harmonic phase; bounds approximate ±pi.")],
    expressions: { 0: ["sin(3*t+phi)", "sin(2*t)"] }, animate: "phi", from: -3.14, to: 3.14 },
  { id: "polar-rose", description: "Change integer n in sin(n*theta), retaining signed radius. Odd and even frequencies have different petal counts. Typed non-integers are allowed, but may not close over this bounded turn.",
    parameters: [p("n", 3, 1, 5, 1, "integer frequency", "Slider/playback uses integers; typed fractions may leave an open path.")],
    expressions: { 0: ["sin(n*theta)"] }, animate: "n", from: 1, to: 5, frames: 5 },
  { id: "cardioid", description: "Change c in c+cos(theta) through a family of limaçons. Only the default c=1 is a cardioid; negative radius is retained.",
    parameters: [p("c", 1, .5, 1.2, .05, "graph units", "Radial offset; c=1 gives the original cusp.")],
    expressions: { 0: ["c+cos(theta)"] }, animate: "c", from: .5, to: 1.2 },
  { id: "implicit-conics", description: "Change positive radius r in x^2+y^2-r^2 against the fixed hyperbola. Contours remain bounded numerical approximations.",
    parameters: [p("r", 1, .5, 1.8, .05, "graph units", "Circle radius; the hyperbola is unchanged.")],
    expressions: { 0: ["x^2+y^2-r^2"] }, animate: "r", from: .5, to: 1.8 },
  { id: "strict-disk", description: "Change radius r in x^2+y^2-r^2 < 0. The excluded boundary stays dashed; filled cells are approximate.",
    parameters: [p("r", 1, .5, 1.25, .05, "graph units", "Positive disk radius; strict boundary exclusion is unchanged.")],
    expressions: { 0: ["x^2+y^2-r^2"] }, animate: "r", from: .5, to: 1.25 },
];
const cache = new Map<string, { preset: Graph2DPreset; guidance: Graph2DInteractivePresetGuidance; signature: string }>();
const signature = (document: Graph2DDocument) => canonicalJsonStringify({ ...document.source,
  variables: document.source.variables.map(parameter => ({ ...parameter, value: 0 })) });

function build(recipe: Recipe) {
  const existing = cache.get(recipe.id); if (existing) return existing;
  const original = getGraph2DPresetCatalog().get(recipe.id)!;
  let document = original.template;
  for (const { hint: _hint, ...draft } of recipe.parameters) document = createGraph2DDocument({
    ...applyGraph2DAuthoring(document, document.source.variables.some(p => p.name === draft.name)
      ? { type: "parameter-configure", name: draft.name, draft } : { type: "parameter-create", draft }),
    stableKey: ["interactive-preset", recipe.id, 2] });
  for (const [index, expressions] of Object.entries(recipe.expressions)) {
    const object = document.source.objects[Number(index)]!, style = document.display.objects[Number(index)]!;
    const draft = { label: object.label, style };
    let action: Graph2DAuthoringAction;
    // Each replacement still uses the ordinary shared parser/authoring validator.
    if (object.kind === "explicit-cartesian") action = { type: "edit", objectId: object.id, draft: { ...draft, domain: object.domain, expression: expressions[0]! } };
    else if (object.kind === "parametric") action = { type: "edit-parametric", objectId: object.id, draft: { ...draft, domain: object.domain, xExpression: expressions[0]!, yExpression: expressions[1]! } };
    else if (object.kind === "polar") action = { type: "edit-polar", objectId: object.id, draft: { ...draft, domain: object.domain, rExpression: expressions[0]! } };
    else if (object.kind === "implicit") action = { type: "edit-implicit", objectId: object.id, draft: { ...draft, domain: object.domain, yDomain: object.yDomain, expression: expressions[0]! } };
    else if (object.kind === "inequality") action = { type: "edit-inequality", objectId: object.id, draft: { ...draft, domain: object.domain, yDomain: object.yDomain,
      operator: object.operator, clauses: object.clauses.map((clause, i) => ({ expression: expressions[i]!, comparator: clause.comparator })) } };
    else throw new TypeError("Unsupported interactive preset recipe.");
    document = createGraph2DDocument({ ...applyGraph2DAuthoring(document, action), stableKey: ["interactive-preset", recipe.id, 2] });
  }
  const animation = Object.freeze({ parameter: recipe.animate, from: recipe.from, to: recipe.to, frames: recipe.frames ?? 15, fps: 6 });
  createGraph2DAnimationPlan(document, animation);
  const title = `${original.title} (interactive)`;
  document = createGraph2DDocument({ ...document, stableKey: ["interactive-preset", recipe.id, 2], title });
  const preset = createGraph2DPreset({ ...original, version: 2, title, template: document,
    description: recipe.description, tags: [...original.tags, "interactive"], learningGoals: [recipe.description, "Open Parameters to preview, Apply once, or Cancel. Animation runs only when you press Play."] });
  const guidance: Graph2DInteractivePresetGuidance = Object.freeze({ presetId: recipe.id, title: preset.title, description: recipe.description,
    parameters: Object.freeze(recipe.parameters.map(p => Object.freeze({ name: p.name, defaultValue: p.value, hint: p.hint }))), animation });
  const entry = { preset, guidance, signature: signature(preset.template) }; cache.set(recipe.id, entry); return entry;
}

/** Only reviewed, exact frozen catalog entries can offer this opt-in variant. */
export function getGraph2DInteractivePreset(preset: Graph2DPreset): Graph2DPreset | undefined {
  const recipe = recipes.find(recipe => recipe.id === preset.id);
  if (!recipe || preset.digest !== getGraph2DPresetCatalog().get(preset.id)?.digest) return undefined;
  return build(recipe).preset;
}

/** Source-matched suggestions, not portable origin metadata. Edited recipes lose hints safely.
 * Values and display may change; expressions/domains/controls/assumptions must still match. */
export function getGraph2DInteractivePresetGuidance(document: Graph2DDocument): Graph2DInteractivePresetGuidance | undefined {
  if (!document.source.variables.some(p => p.control)) return undefined;
  const key = signature(document);
  return recipes.map(build).find(entry => entry.signature === key)?.guidance;
}
