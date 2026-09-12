import { analysisResultKey } from "../analysis/resultStore";
import type { AnalysisResult, AnalysisResultState } from "../analysis/contracts";
import type { CurveAnalysisWorkspaceDocument } from "./persistence";
import type { CanonicalCurveDefinition, CurveAnalysisMethod, CurveIdentity, CurveResultKind, CurveUnits } from "./contracts";
import { upsertCurveAnalysisResult, type CurveAnalysisResultStore } from "./infrastructure";
import type { CurveScalarPlotKey } from "./scalarPlots";

export type CurveResultLayerAction = "show" | "hide" | "select" | "frame" | "pin" | "unpin" | "save" | "unsave";
export type CurveResultLayerState = { visible: boolean; selected: boolean; framed: boolean; pinned: boolean; saved: boolean };
export type CurvePresetState = "current" | "stale";
export type CurveAnalysisPresetId = "curvature-lab" | "frenet-evidence" | "bishop-stable-frame" | "planar-inflection-map" | "spline-continuity" | "tube-preparation";
export type CurveAnalysisPreset = { id: CurveAnalysisPresetId; label: string; description: string; layers: readonly CurvePresetLayer[] };
type CurvePresetLayer = { kind: CurveResultKind; variant: string; label: string; method: CurveAnalysisMethod; unit: string };

export type CurveResultLifecycleState = {
  version: 1;
  layers: Record<string, CurveResultLayerState>;
  activePreset: null | { presetId: CurveAnalysisPresetId; curveId: string; curveRevision: number; token: number; state: CurvePresetState };
  nextToken: number;
  compareKeys: string[];
};

export type CurveLayerSeries = { parameter: readonly number[]; value: readonly number[]; valid?: readonly boolean[] };
export type CurveScientificLayerPayload = {
  version: 1;
  kind: "scientific-layer";
  label: string;
  method: CurveAnalysisMethod;
  unit: string;
  statistics: { minimum: number | null; maximum: number | null; mean: number | null; validCount: number; sampleCount: number };
  uncertainty: { kind: "bounded" | "exact" | "unknown"; absolute: number | null; note: string };
  warnings: string[];
  series: CurveLayerSeries;
};

export type CurveResultCard = {
  resultKey: string;
  kind: CurveResultKind;
  variant: string;
  label: string;
  state: AnalysisResultState;
  identity: CurveIdentity;
  method: string;
  units: CurveUnits;
  valueUnit: string;
  statistics: CurveScientificLayerPayload["statistics"] | null;
  uncertainty: CurveScientificLayerPayload["uncertainty"] | null;
  warnings: readonly string[];
  dependencies: AnalysisResult<unknown, CurveResultKind, CurveIdentity>["dependencies"];
  computeTimeMs: number | null;
  backend: string;
  resultVersion: number;
  createdAt: number;
  updatedAt: number;
  layer: CurveResultLayerState;
  series: CurveLayerSeries | null;
};

export type CurveViewportEvidenceKind = "curvature-comb" | "evolute" | "frenet-frame" | "bishop-frame" | "inflection-markers" | "diagnostics" | "control-structure" | "samples" | "tube-preview";
export type CurveResultPresentation = {
  resultKeys: string[];
  layerLabels: string[];
  plotKeys: CurveScalarPlotKey[];
  viewportEvidence: CurveViewportEvidenceKind[];
  selectedResultKey: string | null;
  framedResultKey: string | null;
  pinnedResultKeys: string[];
};

const PRESENTATION_BY_VARIANT: Readonly<Record<string, { plots: readonly CurveScalarPlotKey[]; viewport: readonly CurveViewportEvidenceKind[] }>> = {
  "preset:curvature": { plots: ["curvature"], viewport: ["curvature-comb", "evolute"] },
  "preset:curvature-quality": { plots: ["sampling-error"], viewport: ["diagnostics"] },
  "preset:frenet": { plots: ["curvature", "torsion"], viewport: ["frenet-frame"] },
  "preset:frenet-validity": { plots: [], viewport: ["diagnostics"] },
  "preset:bishop-frame": { plots: ["curvature"], viewport: ["bishop-frame"] },
  "preset:signed-curvature": { plots: ["signed-curvature", "curvature"], viewport: ["curvature-comb"] },
  "preset:inflections": { plots: [], viewport: ["inflection-markers", "diagnostics"] },
  "preset:spline-continuity": { plots: ["speed", "curvature"], viewport: ["control-structure"] },
  "preset:tube-samples": { plots: ["speed", "sampling-error"], viewport: ["samples"] },
  "preset:tube-frame": { plots: ["curvature", "torsion"], viewport: ["bishop-frame"] },
  "preset:tube-readiness": { plots: [], viewport: ["tube-preview"] },
};

export const CURVE_ANALYSIS_PRESETS: readonly CurveAnalysisPreset[] = [
  { id: "curvature-lab", label: "Curvature lab", description: "Curvature, radius and quality evidence.", layers: [
    { kind: "differential-geometry", variant: "preset:curvature", label: "Curvature", method: "numerical-derivatives", unit: "1 / position-unit" },
    { kind: "curve-diagnostics", variant: "preset:curvature-quality", label: "Curvature quality", method: "numerical-derivatives", unit: "unitless" },
  ] },
  { id: "frenet-evidence", label: "Frenet evidence", description: "Tangent, normal, binormal and torsion validity.", layers: [
    { kind: "differential-geometry", variant: "preset:frenet", label: "Frenet frame evidence", method: "numerical-derivatives", unit: "frame" },
    { kind: "curve-diagnostics", variant: "preset:frenet-validity", label: "Frame validity", method: "numerical-derivatives", unit: "unitless" },
  ] },
  { id: "bishop-stable-frame", label: "Bishop stable frame", description: "Rotation-minimizing frame prepared across low curvature spans.", layers: [
    { kind: "differential-geometry", variant: "preset:bishop-frame", label: "Bishop frame", method: "numerical-derivatives", unit: "frame" },
  ] },
  { id: "planar-inflection-map", label: "Planar inflection map", description: "Signed turning evidence and near-zero curvature candidates.", layers: [
    { kind: "differential-geometry", variant: "preset:signed-curvature", label: "Signed curvature", method: "numerical-derivatives", unit: "1 / position-unit" },
    { kind: "curve-diagnostics", variant: "preset:inflections", label: "Inflection candidates", method: "numerical-derivatives", unit: "unitless" },
  ] },
  { id: "spline-continuity", label: "Spline continuity", description: "Control spans, knot boundaries and continuity evidence.", layers: [
    { kind: "curve-continuity", variant: "preset:spline-continuity", label: "Spline continuity", method: "analytic", unit: "continuity order" },
  ] },
  { id: "tube-preparation", label: "Tube preparation", description: "Arc-length sampling, stable frames and CurveMesh readiness.", layers: [
    { kind: "curve-samples", variant: "preset:tube-samples", label: "Tube samples", method: "polyline-estimate", unit: "position-unit" },
    { kind: "differential-geometry", variant: "preset:tube-frame", label: "Tube frame", method: "numerical-derivatives", unit: "frame" },
    { kind: "derived-curve-mesh", variant: "preset:tube-readiness", label: "Tube readiness", method: "polyline-estimate", unit: "unitless" },
  ] },
] as const;

const DEFAULT_LAYER: CurveResultLayerState = { visible: true, selected: false, framed: false, pinned: false, saved: false };
export const createCurveResultLifecycleState = (): CurveResultLifecycleState => ({ version: 1, layers: {}, activePreset: null, nextToken: 1, compareKeys: [] });

const finite = (value: number): boolean => Number.isFinite(value);
const summarize = (values: readonly number[]) => {
  const usable = values.filter(finite);
  return { minimum: usable.length ? Math.min(...usable) : null, maximum: usable.length ? Math.max(...usable) : null, mean: usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null, validCount: usable.length, sampleCount: values.length };
};

const buildLayerPayload = (definition: CanonicalCurveDefinition, layer: CurvePresetLayer, points: readonly { x: number; y: number; z: number }[]): CurveScientificLayerPayload => {
  const span = definition.domain.max - definition.domain.min;
  const parameter = points.map((_, index) => definition.domain.min + span * (points.length <= 1 ? 0 : index / (points.length - 1)));
  const segment = points.map((point, index) => index === 0 ? 0 : Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y, point.z - points[index - 1].z));
  const value = points.map((point, index) => {
    if (layer.variant.includes("curvature") || layer.variant.includes("inflection")) {
      if (index === 0 || index === points.length - 1) return Number.NaN;
      const a = points[index - 1], c = points[index + 1];
      const ux = point.x - a.x, uy = point.y - a.y, uz = point.z - a.z;
      const vx = c.x - point.x, vy = c.y - point.y, vz = c.z - point.z;
      const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      const denom = Math.max(1e-15, Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) * Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z));
      return 2 * cross / denom;
    }
    return segment[index];
  });
  const uncertainty = definition.derivatives.second === "exact" ? { kind: "exact" as const, absolute: 0, note: "Exact derivative capability." } : { kind: "bounded" as const, absolute: definition.sampling.tolerance ?? null, note: "Bounded by the active sampling tolerance." };
  return { version: 1, kind: "scientific-layer", label: layer.label, method: layer.method, unit: layer.unit.replace("position-unit", definition.units.position), statistics: summarize(value), uncertainty, warnings: [...definition.warnings, ...(points.length < 3 ? ["At least three samples are required for differential evidence."] : [])], series: { parameter, value, valid: value.map(finite) } };
};

export const beginCurveAnalysisPreset = (state: CurveResultLifecycleState, definition: CanonicalCurveDefinition, presetId: CurveAnalysisPresetId): CurveResultLifecycleState => ({
  ...state, nextToken: state.nextToken + 1, activePreset: { presetId, curveId: definition.identity.curveId, curveRevision: definition.identity.curveRevision, token: state.nextToken, state: "current" },
});

export const applyCurveAnalysisPreset = (input: { state: CurveResultLifecycleState; store: CurveAnalysisResultStore; definition: CanonicalCurveDefinition; points: readonly { x: number; y: number; z: number }[]; token?: number; now?: number }): { accepted: boolean; state: CurveResultLifecycleState; store: CurveAnalysisResultStore; resultKeys: string[] } => {
  const active = input.state.activePreset;
  if (!active || (input.token != null && input.token !== active.token) || active.curveId !== input.definition.identity.curveId || active.curveRevision !== input.definition.identity.curveRevision) return { accepted: false, state: input.state, store: input.store, resultKeys: [] };
  const preset = CURVE_ANALYSIS_PRESETS.find((candidate) => candidate.id === active.presetId)!;
  let store = input.store; const resultKeys: string[] = []; const layers = Object.fromEntries(Object.entries(input.state.layers).map(([key, layer]) => [key, layer.pinned ? layer : { ...layer, visible: false, selected: false, framed: false }]));
  preset.layers.forEach((layer, index) => {
    const key = analysisResultKey(input.definition.identity, layer.kind, layer.variant); resultKeys.push(key);
    const dependencyKind: CurveResultKind = layer.kind === "curve-samples" || layer.kind === "curve-continuity" ? "curve-definition" : layer.kind === "derived-curve-mesh" ? "curve-samples" : "curve-definition";
    store = upsertCurveAnalysisResult(store, { kind: layer.kind, variant: layer.variant, identity: input.definition.identity, state: "ready", parameters: { presetId: preset.id, samplingStrategy: input.definition.sampling.strategy, tolerance: input.definition.sampling.tolerance ?? null }, payload: buildLayerPayload(input.definition, layer, input.points), dependencies: [{ kind: dependencyKind, state: "ready" }], computeTimeMs: 0, backend: "Math3D Curve Core", now: (input.now ?? Date.now()) + index });
    layers[key] = { ...(layers[key] ?? DEFAULT_LAYER), visible: true };
  });
  return { accepted: true, store, resultKeys, state: { ...input.state, layers } };
};

export const reconcileCurveResultLifecycle = (state: CurveResultLifecycleState, definition: CanonicalCurveDefinition): CurveResultLifecycleState => state.activePreset && (state.activePreset.curveId !== definition.identity.curveId || state.activePreset.curveRevision !== definition.identity.curveRevision) ? { ...state, activePreset: { ...state.activePreset, state: "stale" } } : state;

export const updateCurveResultLayer = (state: CurveResultLifecycleState, resultKey: string, action: CurveResultLayerAction): CurveResultLifecycleState => {
  const current = state.layers[resultKey] ?? DEFAULT_LAYER;
  const next = { ...current };
  if (action === "show" || action === "hide") { next.visible = action === "show"; if (action === "hide") { next.selected = false; next.framed = false; } }
  if (action === "select") { next.selected = true; next.visible = true; }
  if (action === "frame") { next.framed = true; next.visible = true; }
  if (action === "pin" || action === "unpin") next.pinned = action === "pin";
  if (action === "save" || action === "unsave") next.saved = action === "save";
  const layers = Object.fromEntries(Object.entries(state.layers).map(([key, layer]) => [key, action === "select" ? { ...layer, selected: false } : action === "frame" ? { ...layer, framed: false } : layer]));
  return { ...state, layers: { ...layers, [resultKey]: next } };
};

export const setCurveComparisonSelection = (state: CurveResultLifecycleState, resultKey: string): CurveResultLifecycleState => {
  const compareKeys = state.compareKeys.includes(resultKey) ? state.compareKeys.filter((key) => key !== resultKey) : [...state.compareKeys, resultKey].slice(-2);
  return { ...state, compareKeys };
};

const isLayerPayload = (payload: unknown): payload is CurveScientificLayerPayload => !!payload && typeof payload === "object" && (payload as { kind?: string }).kind === "scientific-layer";
export const deriveCurveResultCards = (store: CurveAnalysisResultStore, definition: CanonicalCurveDefinition, state: CurveResultLifecycleState): CurveResultCard[] => Object.entries(store.entries)
  .filter(([, result]) => result.identity.curveId === definition.identity.curveId)
  .map(([resultKey, result]) => {
    const payload = isLayerPayload(result.payload) ? result.payload : null;
    return { resultKey, kind: result.kind, variant: result.variant, label: payload?.label ?? String(result.kind), state: result.state, identity: result.identity, method: payload?.method ?? String((result.payload as { method?: string } | null)?.method ?? "unknown"), units: definition.units, valueUnit: payload?.unit ?? definition.units.position, statistics: payload?.statistics ?? null, uncertainty: payload?.uncertainty ?? null, warnings: payload?.warnings ?? ((result.payload as { warnings?: string[] } | null)?.warnings ?? []), dependencies: result.dependencies, computeTimeMs: result.computeTimeMs, backend: result.backend, resultVersion: result.resultVersion, createdAt: result.createdAt, updatedAt: result.updatedAt, layer: state.layers[resultKey] ?? DEFAULT_LAYER, series: payload?.series ?? null };
  }).sort((left, right) => Number(right.layer.pinned) - Number(left.layer.pinned) || right.updatedAt - left.updatedAt || left.resultKey.localeCompare(right.resultKey));

export const deriveCurveResultPresentation = (cards: readonly CurveResultCard[], definition: CanonicalCurveDefinition): CurveResultPresentation => {
  const variantOrder = Object.keys(PRESENTATION_BY_VARIANT);
  const visible = cards.filter((card) => card.identity.key === definition.identity.key && card.state === "ready" && card.layer.visible && PRESENTATION_BY_VARIANT[card.variant]).sort((left, right) => variantOrder.indexOf(left.variant) - variantOrder.indexOf(right.variant));
  const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)];
  const plotOrder: CurveScalarPlotKey[] = ["speed", "curvature", "signed-curvature", "torsion", "sampling-error"];
  const viewportOrder: CurveViewportEvidenceKind[] = ["curvature-comb", "evolute", "frenet-frame", "bishop-frame", "inflection-markers", "diagnostics", "control-structure", "samples", "tube-preview"];
  return {
    resultKeys: visible.map((card) => card.resultKey),
    layerLabels: visible.map((card) => card.label),
    plotKeys: unique(visible.flatMap((card) => PRESENTATION_BY_VARIANT[card.variant].plots)).sort((left, right) => plotOrder.indexOf(left) - plotOrder.indexOf(right)),
    viewportEvidence: unique(visible.flatMap((card) => PRESENTATION_BY_VARIANT[card.variant].viewport)).sort((left, right) => viewportOrder.indexOf(left) - viewportOrder.indexOf(right)),
    selectedResultKey: visible.find((card) => card.layer.selected)?.resultKey ?? null,
    framedResultKey: visible.find((card) => card.layer.framed)?.resultKey ?? null,
    pinnedResultKeys: visible.filter((card) => card.layer.pinned).map((card) => card.resultKey),
  };
};

export const removeCurveResult = (store: CurveAnalysisResultStore, state: CurveResultLifecycleState, resultKey: string): { store: CurveAnalysisResultStore; state: CurveResultLifecycleState } => {
  const entries = { ...store.entries }; delete entries[resultKey]; const layers = { ...state.layers }; delete layers[resultKey];
  return { store: { ...store, entries, history: store.history.filter((record) => record.resultKey !== resultKey) }, state: { ...state, layers, compareKeys: state.compareKeys.filter((key) => key !== resultKey) } };
};

export const saveCurveResultReference = (document: CurveAnalysisWorkspaceDocument, card: CurveResultCard): CurveAnalysisWorkspaceDocument => {
  const reference = { id: `saved:${card.resultKey}`, resultKey: card.resultKey, kind: card.kind, variant: card.variant, identity: card.identity, label: card.label, visible: card.layer.visible };
  return { ...document, savedResults: [reference, ...document.savedResults.filter((saved) => saved.id !== reference.id)].slice(0, 96) };
};

export type CurveResultExportManifest = { schema: "math3d.curve-result/v1"; identity: CurveIdentity; result: { kind: CurveResultKind; variant: string; version: number; state: AnalysisResultState }; definition: { representation: string; fingerprint: string; domain: CanonicalCurveDefinition["domain"] }; sampling: CanonicalCurveDefinition["sampling"]; method: string; units: CurveUnits & { value: string }; tolerances: { sampling: number | null; uncertainty: number | null }; warnings: readonly string[]; software: { product: "Math3D"; schemaVersion: 1; backend: string; backendVersion: string } };
export const createCurveResultExportManifest = (card: CurveResultCard, definition: CanonicalCurveDefinition): CurveResultExportManifest => ({ schema: "math3d.curve-result/v1", identity: card.identity, result: { kind: card.kind, variant: card.variant, version: card.resultVersion, state: card.state }, definition: { representation: definition.representation, fingerprint: definition.fingerprint, domain: definition.domain }, sampling: definition.sampling, method: card.method, units: { ...definition.units, value: card.valueUnit }, tolerances: { sampling: definition.sampling.tolerance ?? null, uncertainty: card.uncertainty?.absolute ?? null }, warnings: card.warnings, software: { product: "Math3D", schemaVersion: 1, backend: card.backend, backendVersion: "1" } });
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : typeof value === "number" && !Number.isFinite(value) ? null : value;
export const curveResultToJson = (card: CurveResultCard, definition: CanonicalCurveDefinition): string => JSON.stringify(stable({ manifest: createCurveResultExportManifest(card, definition), statistics: card.statistics, uncertainty: card.uncertainty, series: card.series }), null, 2);
const csvCell = (value: unknown): string => `"${String(value ?? "").replace(/"/g, '""')}"`;
export const curveResultToCsv = (card: CurveResultCard, definition: CanonicalCurveDefinition): string => {
  const manifest = JSON.stringify(stable(createCurveResultExportManifest(card, definition)));
  const lines = [`# Math3D-Curve-Manifest: ${manifest}`, "parameter,value,valid"];
  card.series?.parameter.forEach((parameter, index) => lines.push([parameter, card.series!.value[index], card.series!.valid?.[index] ?? Number.isFinite(card.series!.value[index])].map(csvCell).join(",")));
  return lines.join("\n");
};
const esc = (value: string): string => value.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]!));
export const curveResultToSvg = (card: CurveResultCard, definition: CanonicalCurveDefinition): string => {
  const series = card.series; const pairs = series ? series.parameter.map((x, index) => ({ x, y: series.value[index] })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  const xs = pairs.map((point) => point.x), ys = pairs.map((point) => point.y); const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1, minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
  const points = pairs.map((point) => `${20 + 600 * (point.x - minX) / Math.max(1e-15, maxX - minX)},${220 - 190 * (point.y - minY) / Math.max(1e-15, maxY - minY)}`).join(" ");
  const manifest = esc(JSON.stringify(stable(createCurveResultExportManifest(card, definition))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"><metadata>${manifest}</metadata><rect width="640" height="240" fill="white"/><text x="20" y="18" font-family="sans-serif" font-size="12">${esc(card.label)} (${esc(card.valueUnit)})</text><polyline fill="none" stroke="#2563eb" stroke-width="2" points="${points}"/></svg>`;
};

const interpolate = (series: CurveLayerSeries, parameter: number): number | null => {
  const x = series.parameter, y = series.value; if (!x.length || parameter < x[0] || parameter > x[x.length - 1]) return null;
  let high = x.findIndex((value) => value >= parameter); if (high < 0) high = x.length - 1; if (high === 0) return Number.isFinite(y[0]) ? y[0] : null;
  const low = high - 1, span = x[high] - x[low], value = span === 0 ? y[high] : y[low] + (parameter - x[low]) / span * (y[high] - y[low]); return Number.isFinite(value) ? value : null;
};
export type CurveResultComparison = { domain: readonly [number, number] | null; samples: { parameter: number; left: number; right: number; delta: number }[]; maximumAbsoluteDelta: number | null; rmsDelta: number | null };
export const compareCurveResultCards = (left: CurveResultCard, right: CurveResultCard, sampleCount = 128): CurveResultComparison => {
  if (!left.series || !right.series || !left.series.parameter.length || !right.series.parameter.length) return { domain: null, samples: [], maximumAbsoluteDelta: null, rmsDelta: null };
  const min = Math.max(left.series.parameter[0], right.series.parameter[0]), max = Math.min(left.series.parameter.at(-1)!, right.series.parameter.at(-1)!); if (!(max >= min)) return { domain: null, samples: [], maximumAbsoluteDelta: null, rmsDelta: null };
  const samples: CurveResultComparison["samples"] = []; const count = Math.max(2, Math.floor(sampleCount));
  for (let index = 0; index < count; index++) { const parameter = min + (max - min) * index / (count - 1); const a = interpolate(left.series, parameter), b = interpolate(right.series, parameter); if (a != null && b != null) samples.push({ parameter, left: a, right: b, delta: b - a }); }
  const maximumAbsoluteDelta = samples.length ? Math.max(...samples.map((sample) => Math.abs(sample.delta))) : null; const rmsDelta = samples.length ? Math.sqrt(samples.reduce((sum, sample) => sum + sample.delta ** 2, 0) / samples.length) : null;
  return { domain: [min, max], samples, maximumAbsoluteDelta, rmsDelta };
};
