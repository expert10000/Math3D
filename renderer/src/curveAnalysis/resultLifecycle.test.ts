import { describe, expect, it } from "vitest";
import { analysisResultKey } from "../analysis/resultStore";
import { adaptCurveDefinition, createCurveAnalysisResultStore } from "./infrastructure";
import { createCurveAnalysisWorkspaceDocument, parseCurveAnalysisWorkspace, serializeCurveAnalysisWorkspace } from "./persistence";
import {
  CURVE_ANALYSIS_PRESETS,
  applyCurveAnalysisPreset,
  beginCurveAnalysisPreset,
  compareCurveResultCards,
  createCurveResultExportManifest,
  createCurveResultLifecycleState,
  curveResultToCsv,
  curveResultToJson,
  curveResultToSvg,
  deriveCurveResultCards,
  reconcileCurveResultLifecycle,
  removeCurveResult,
  saveCurveResultReference,
  setCurveComparisonSelection,
  updateCurveResultLayer,
} from "./resultLifecycle";

const definition = (revision = 3) => adaptCurveDefinition({
  id: "circle", revision, label: "Unit circle", representation: "parametric", dimension: 2,
  domain: { parameter: "t", min: 0, max: Math.PI * 2, closed: true, periodic: true },
  expressions: { x: "cos(t)", y: "sin(t)" }, sampling: { strategy: "adaptive", tolerance: 1e-4 },
  units: { position: "m", parameter: "rad", angle: "rad" }, derivatives: { first: "exact", second: "exact", third: "exact", arcLength: "closed-form" },
});
const points = Array.from({ length: 33 }, (_, index) => { const angle = index / 32 * Math.PI * 2; return { x: Math.cos(angle), y: Math.sin(angle), z: 0 }; });

describe("Curve scientific result lifecycle", () => {
  it("keeps source selection separate from six useful analysis-layer presets", () => {
    expect(CURVE_ANALYSIS_PRESETS.map((preset) => preset.id)).toEqual(["curvature-lab", "frenet-evidence", "bishop-stable-frame", "planar-inflection-map", "spline-continuity", "tube-preparation"]);
    expect(CURVE_ANALYSIS_PRESETS.every((preset) => preset.layers.length > 0)).toBe(true);
    expect(CURVE_ANALYSIS_PRESETS.some((preset) => preset.id.includes("circle"))).toBe(false);
  });

  it("publishes typed cards into the canonical result store with full scientific metadata", () => {
    const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition(), "curvature-lab");
    const applied = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(), definition: definition(), points, token: begun.activePreset!.token, now: 100 });
    expect(applied.accepted).toBe(true);
    expect(applied.resultKeys).toHaveLength(2);
    const cards = deriveCurveResultCards(applied.store, definition(), applied.state);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ state: "ready", method: "numerical-derivatives", units: { position: "m" }, backend: "Math3D Curve Core", computeTimeMs: 0, layer: { visible: true } });
    expect(cards[0].statistics?.validCount).toBeGreaterThan(0);
    expect(cards[0].uncertainty).toMatchObject({ kind: "exact", absolute: 0 });
    expect(cards[0].dependencies).toHaveLength(1);
  });

  it("handles independent display actions, persistence, comparison selection, and canonical removal", () => {
    const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition(), "curvature-lab");
    const applied = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(), definition: definition(), points, now: 100 });
    const key = applied.resultKeys[0];
    let state = updateCurveResultLayer(applied.state, key, "hide"); state = updateCurveResultLayer(state, key, "select"); state = updateCurveResultLayer(state, key, "frame"); state = updateCurveResultLayer(state, key, "pin"); state = updateCurveResultLayer(state, key, "save"); state = setCurveComparisonSelection(state, key);
    expect(state.layers[key]).toEqual({ visible: false, selected: true, framed: true, pinned: true, saved: true });
    expect(state.compareKeys).toEqual([key]);
    const card = deriveCurveResultCards(applied.store, definition(), state).find((candidate) => candidate.resultKey === key)!;
    const persisted = parseCurveAnalysisWorkspace(serializeCurveAnalysisWorkspace(saveCurveResultReference(createCurveAnalysisWorkspaceDocument(), card)));
    expect(persisted.savedResults[0]).toMatchObject({ resultKey: key, visible: false, identity: { curveRevision: 3 } });
    const removed = removeCurveResult(applied.store, state, key);
    expect(removed.store.entries[key]).toBeUndefined(); expect(removed.store.history.some((record) => record.resultKey === key)).toBe(false); expect(removed.state.layers[key]).toBeUndefined();
  });

  it("rejects rapid preset races and marks preset orchestration stale when identity revisions change", () => {
    const first = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition(), "curvature-lab");
    const second = beginCurveAnalysisPreset(first, definition(), "tube-preparation");
    expect(applyCurveAnalysisPreset({ state: second, store: createCurveAnalysisResultStore(), definition: definition(), points, token: first.activePreset!.token }).accepted).toBe(false);
    expect(applyCurveAnalysisPreset({ state: second, store: createCurveAnalysisResultStore(), definition: definition(), points, token: second.activePreset!.token }).accepted).toBe(true);
    expect(reconcileCurveResultLifecycle(second, definition(4)).activePreset?.state).toBe("stale");
  });

  it("exports reproducible JSON, CSV, and SVG manifests", () => {
    const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition(), "curvature-lab");
    const applied = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(), definition: definition(), points, now: 200 });
    const card = deriveCurveResultCards(applied.store, definition(), applied.state)[0];
    const manifest = createCurveResultExportManifest(card, definition());
    expect(manifest).toMatchObject({ schema: "math3d.curve-result/v1", identity: { curveId: "circle", curveRevision: 3 }, definition: { representation: "parametric" }, sampling: { tolerance: 1e-4 }, method: "numerical-derivatives", software: { product: "Math3D", backend: "Math3D Curve Core" } });
    expect(curveResultToJson(card, definition())).toBe(curveResultToJson(card, definition()));
    expect(curveResultToCsv(card, definition())).toContain("# Math3D-Curve-Manifest:");
    expect(curveResultToSvg(card, definition())).toContain("<metadata>{&quot;definition&quot;");
  });

  it("aligns comparisons over the common domain independent of sampling", () => {
    const make = (preset: "curvature-lab" | "planar-inflection-map", samplePoints: typeof points, now: number) => {
      const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition(), preset);
      const applied = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(), definition: definition(), points: samplePoints, now });
      return deriveCurveResultCards(applied.store, definition(), applied.state).find((card) => card.series)!;
    };
    const comparison = compareCurveResultCards(make("curvature-lab", points, 1), make("planar-inflection-map", points.filter((_, index) => index % 2 === 0), 2), 17);
    expect(comparison.domain).toEqual([0, Math.PI * 2]); expect(comparison.samples.length).toBeGreaterThanOrEqual(14); // endpoint-adjacent values are intentionally invalid curvature estimates
    expect(comparison.maximumAbsoluteDelta).not.toBeNull(); expect(comparison.rmsDelta).not.toBeNull();
  });

  it("uses stable canonical result keys", () => {
    expect(analysisResultKey(definition().identity, "differential-geometry", "preset:curvature")).toBe("curve:circle@3:differential-geometry:preset:curvature");
  });
});
