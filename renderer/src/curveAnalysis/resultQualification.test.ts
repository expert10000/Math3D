import { describe, expect, it } from "vitest";
import { adaptCurveDefinition, createCurveAnalysisResultStore } from "./infrastructure";
import { applyCurveAnalysisPreset, beginCurveAnalysisPreset, createCurveResultLifecycleState,
  deriveCurveResultCards } from "./resultLifecycle";
import { qualifyCurveResult } from "./resultQualification";

const definition = adaptCurveDefinition({ id: "qualification", revision: 1, label: "Circle",
  representation: "parametric", dimension: 2,
  domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
  expressions: { x: "t", y: "t^2" }, sampling: { strategy: "uniform", tolerance: 0.01 },
  units: { position: "m", parameter: "s", angle: "rad" },
  derivatives: { first: "exact", second: "exact", third: "exact", arcLength: "unknown" } });
const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition, "curvature-lab");
const applied = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(),
  definition, points: [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0.25, z: 0 },
    { x: 1, y: 1, z: 0 }], now: 1 });
const card = deriveCurveResultCards(applied.store, definition, applied.state)[0]!;

describe("Curve result qualification", () => {
  it("calls sampled output current without claiming exact mathematics", () => {
    expect(qualifyCurveResult(card, definition)).toMatchObject({ status: "current",
      claim: "Sampled Curve result", canPublish: true });
    expect(qualifyCurveResult(card, definition).verification).toMatch(/no proven error bound/);
  });
  it("keeps older revisions and failed dependencies out of current publication", () => {
    expect(qualifyCurveResult({ ...card, identity: { ...card.identity, curveRevision: 2 } }, definition))
      .toMatchObject({ status: "historical", canPublish: false });
    expect(qualifyCurveResult({ ...card, dependencies: [{ ...card.dependencies[0]!, state: "stale" }] }, definition))
      .toMatchObject({ status: "unavailable", canPublish: false });
  });
});
