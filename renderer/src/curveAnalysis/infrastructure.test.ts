import { describe, expect, it } from "vitest";
import { getGeometryExactCurvePreset } from "../geometry/exactCurveAnalysis";
import { buildCurveFromPreset } from "../math/curvePresetFactory";
import { adaptCoreCurveDefinition, adaptGeometryExactCurveDefinition } from "./adapters";
import type { CurveAdapterInput, CurveAnalysisPayload } from "./contracts";
import {
  adaptCurveDefinition,
  createCurveAnalysisRegistry,
  createCurveAnalysisRequest,
  createCurveAnalysisResultStore,
  getCurveAnalysisDefinition,
  getCurveAnalysisResult,
  inspectCurveAnalysisResult,
  publishCurveAnalysisResult,
  resolveCurveRevision,
} from "./infrastructure";

const domain = { parameter: "t", min: 0, max: 1, closed: false, periodic: false };
const common = { revision: 1, dimension: 2 as const, domain };

const inputs: CurveAdapterInput[] = [
  { ...common, id: "param", label: "Parametric", representation: "parametric", expressions: { x: "t", y: "t^2" } },
  { ...common, id: "explicit", label: "Explicit", representation: "explicit", formula: "x^2" },
  { ...common, id: "implicit", label: "Implicit", representation: "implicit", formula: "x^2+y^2-1" },
  { ...common, id: "polar", label: "Polar", representation: "polar", radiusExpression: "1+cos(t)" },
  { ...common, id: "bezier", label: "Bezier", representation: "bezier", controlPoints: [[0, 0], [1, 1], [2, 0]], degree: 2 },
  { ...common, id: "bspline", label: "B-spline", representation: "b-spline", controlPoints: [[0, 0], [1, 1], [2, 0]], degree: 2, knots: [0, 0, 0, 1, 1, 1] },
  { ...common, id: "nurbs", label: "NURBS", representation: "nurbs", controlPoints: [[0, 0], [1, 1], [2, 0]], degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, 0.7, 1] },
  { ...common, id: "polyline", label: "Polyline", representation: "polyline", points: [[0, 0], [1, 1]] },
  { ...common, id: "on-surface", label: "Surface path", representation: "curve-on-surface", dimension: 3, surfaceId: "surface-a", surfaceRevision: 4, parameterExpressions: { u: "t", v: "0.5" }, sourceModule: "surfaces" },
  { ...common, id: "derived", label: "Offset", representation: "derived", operation: "offset", sourceIds: ["param"], settings: { distance: 0.2 } },
];

describe("Curve Analysis canonical infrastructure", () => {
  it("adapts every supported Curve representation to one revisioned contract", () => {
    const definitions = inputs.map(adaptCurveDefinition);
    expect(definitions.map((definition) => definition.representation)).toEqual([
      "parametric", "explicit", "implicit", "polar", "bezier", "b-spline", "nurbs", "polyline", "curve-on-surface", "derived",
    ]);
    expect(definitions[0].identity.key).toBe("curve:param@1");
    expect(definitions[7]).toMatchObject({ sampling: { strategy: "source-samples" }, derivatives: { arcLength: "polyline" } });
    expect(definitions[5].source).toMatchObject({ controlPointCount: 3, controlPoints: [[0, 0], [1, 1], [2, 0]], knots: [0, 0, 0, 1, 1, 1] });
    expect(definitions[6].source).toMatchObject({ weights: [1, 0.7, 1] });
    expect(definitions[8]).toMatchObject({ identity: { sourceModule: "surfaces" }, source: { sourceIds: ["surface-a"], surfaceLink: { surfaceId: "surface-a", surfaceRevision: 4 }, settings: { surfaceRevision: 4 } } });
    expect(definitions[9].source).toMatchObject({ familyId: "offset", sourceIds: ["param"], settings: { distance: 0.2 } });
  });

  it("rejects invalid revisions, domains, and sampling tolerances", () => {
    expect(() => adaptCurveDefinition({ ...inputs[0], revision: -1 })).toThrow(/revision/i);
    expect(() => adaptCurveDefinition({ ...inputs[0], domain: { ...domain, min: 1, max: 1 } })).toThrow(/positive extent/i);
    expect(() => adaptCurveDefinition({ ...inputs[0], sampling: { tolerance: 0 } })).toThrow(/tolerance/i);
  });

  it("adapts the current Curve Core model without importing renderer concerns into the core", () => {
    const built = buildCurveFromPreset({
      id: "circle2d",
      label: "Circle",
      kind: "parametric",
      dimension: 2,
      formulas: { x: "cos(t)", y: "sin(t)" },
      domain: { tMin: 0, tMax: Math.PI * 2, closed: true },
    });
    expect(built.curve).not.toBeNull();
    const definition = adaptCoreCurveDefinition(built.curve!, { revision: 3, formulas: { x: "cos(t)", y: "sin(t)" } });
    expect(definition).toMatchObject({
      representation: "parametric",
      dimension: 2,
      domain: { closed: true, periodic: true },
      identity: { curveRevision: 3, sourceModule: "curves" },
    });
  });

  it("reuses exact Geometry definitions through a canonical Curve adapter", () => {
    const definition = adaptGeometryExactCurveDefinition(getGeometryExactCurvePreset("helix"));
    expect(definition).toMatchObject({
      representation: "parametric",
      dimension: 3,
      identity: { curveId: "helix", sourceModule: "geometry" },
      derivatives: { position: "exact", first: "exact", second: "exact", third: "exact", arcLength: "closed-form" },
      source: { familyId: "geometry-exact" },
    });
  });

  it("registers Curve result kinds and dependency chains in the shared registry", () => {
    const registry = createCurveAnalysisRegistry();
    expect(getCurveAnalysisDefinition(registry, "differential-geometry")).toMatchObject({
      domain: "curve",
      dependencies: [{ kind: "curve-samples" }],
    });
    expect(getCurveAnalysisDefinition(registry, "derived-curve-mesh")).toMatchObject({
      domain: "derived-mesh",
      dependencies: [{ kind: "curve-samples" }],
    });
  });

  it("publishes method-labelled results and dependency versions through the shared store", () => {
    const definition = adaptCurveDefinition(inputs[0]);
    const registry = createCurveAnalysisRegistry();
    let store = createCurveAnalysisResultStore();
    const definitionRequest = createCurveAnalysisRequest({ requestId: "definition", kind: "curve-definition", definition, domain: "curve", method: "analytic" });
    store = publishCurveAnalysisResult({
      store,
      registry,
      request: definitionRequest,
      payload: {
        version: 1,
        curveId: definition.identity.curveId,
        curveRevision: definition.identity.curveRevision,
        representation: definition.representation,
        method: "analytic",
        units: definition.units,
        orientation: definition.orientation,
        warnings: [],
        data: { kind: "summary", values: { closed: false } },
      },
      now: 10,
    });
    const sampleRequest = createCurveAnalysisRequest({ requestId: "samples", kind: "curve-samples", definition, domain: "curve", method: "analytic", requestedOutputs: ["positions"] });
    store = publishCurveAnalysisResult({ store, registry, request: sampleRequest, now: 11 });
    const differentialRequest = createCurveAnalysisRequest({ requestId: "differential", kind: "differential-geometry", definition, domain: "curve", method: "numerical-derivatives", requestedOutputs: ["T", "kappa", "tau"] });
    const payload: CurveAnalysisPayload = {
      version: 1,
      curveId: definition.identity.curveId,
      curveRevision: definition.identity.curveRevision,
      representation: definition.representation,
      method: "numerical-derivatives",
      units: definition.units,
      orientation: definition.orientation,
      warnings: ["Third derivatives use a sampled fallback."],
      data: { kind: "summary", values: { validSamples: 64 } },
    };
    store = publishCurveAnalysisResult({ store, registry, request: differentialRequest, payload, computeTimeMs: 3.5, now: 12 });
    const result = getCurveAnalysisResult(store, definition.identity, "differential-geometry");
    expect(result).toMatchObject({ state: "ready", backend: "Curve Analysis", dependencies: [{ state: "ready", resultVersion: 1 }] });
    expect(inspectCurveAnalysisResult(result!)).toMatchObject({
      curveId: "param",
      curveRevision: 1,
      representation: "parametric",
      sourceModule: "curves",
      method: "numerical-derivatives",
      warnings: ["Third derivatives use a sampled fallback."],
      dependencyStates: [{ kind: "curve-samples", state: "ready", resultVersion: 1 }],
    });
  });

  it("retains cancellation in history and stales earlier revisions", () => {
    const first = adaptCurveDefinition(inputs[0]);
    const second = adaptCurveDefinition({ ...inputs[0], revision: 2, expressions: { x: "t", y: "t^3" } });
    const registry = createCurveAnalysisRegistry();
    const requestFor = (definition: ReturnType<typeof adaptCurveDefinition>) => createCurveAnalysisRequest({ requestId: definition.identity.key, kind: "curve-definition", definition, domain: "curve", method: "analytic" });
    let store = publishCurveAnalysisResult({ store: createCurveAnalysisResultStore(), registry, request: requestFor(first), state: "running", progress: 0.5, now: 20 });
    store = publishCurveAnalysisResult({ store, registry, request: requestFor(first), state: "cancelled", error: "Cancelled by user", progress: null, now: 21 });
    expect(store.history).toHaveLength(1);
    expect(store.history[0].state).toBe("cancelled");
    store = publishCurveAnalysisResult({ store, registry, request: requestFor(first), now: 22 });
    store = publishCurveAnalysisResult({ store, registry, request: requestFor(second), now: 23 });
    expect(getCurveAnalysisResult(store, first.identity, "curve-definition")?.state).toBe("stale");
    expect(getCurveAnalysisResult(store, second.identity, "curve-definition")?.state).toBe("ready");
  });

  it("advances a Curve revision only when its definition fingerprint changes", () => {
    const tracker = new Map();
    expect(resolveCurveRevision(tracker, "curve-a", "formula:a")).toBe(1);
    expect(resolveCurveRevision(tracker, "curve-a", "formula:a")).toBe(1);
    expect(resolveCurveRevision(tracker, "curve-a", "formula:b")).toBe(2);
    expect(resolveCurveRevision(tracker, "curve-b", "formula:a")).toBe(1);
  });
});
