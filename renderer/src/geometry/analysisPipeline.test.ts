import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { createGeometryAnalysisSnapshot } from "./analysisBridge";
import {
  createGeometryAnalysisRegistry,
  createGeometryAnalysisResultStore,
  getGeometryAnalysisResult,
  registerGeometryAnalysis,
  upsertGeometryAnalysisResult,
} from "./analysisInfrastructure";
import {
  createGeometryAnalysisRequest,
  executeGeometryAnalysisRequest,
  geometryAnalysisIdentityForRequest,
  geometryAnalysisRequestParameters,
  type GeometryAnalysisPayload,
} from "./analysisPipeline";
import { getGeometryExactCurvePreset } from "./exactCurveAnalysis";
import { getGeometryExactSurfacePreset } from "./exactSurfaceAnalysis";

const triangle: SurfaceMeshData = {
  label: "triangle",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  normals: null,
  source: { kind: "detachedMesh" },
};

const snapshot = (sequence: number, createdAt = sequence) => createGeometryAnalysisSnapshot({
  mesh: triangle,
  sourceObjectId: "object-7",
  sourceObjectName: "Triangle",
  snapshotSequence: sequence,
  createdAt,
});

describe("Geometry AnalysisRequest pipeline", () => {
  it("captures canonical target, semantic selection, sampling, precision, and output metadata", () => {
    const source = snapshot(1);
    const request = createGeometryAnalysisRequest({
      id: "request-1",
      kind: "basic-metrics",
      snapshot: source,
      sourceRevision: 4,
      sceneEntityId: "geometry:object-7",
      selection: {
        entityId: "face:2",
        entityType: "face",
        semanticEntityId: "geometry:object-7:face:2",
        semanticKind: "surface-face",
        sourceRevision: 4,
      },
      domain: "face",
      sampling: { strategy: "mesh", sampleCount: 48 },
      precision: { mode: "double", digits: 10, tolerance: 1e-8 },
      parameters: { units: "scene" },
      requestedOutputs: ["scalar", "point", "table"],
      createdAt: 12,
    });
    expect(request).toMatchObject({
      target: { objectId: "object-7", sourceRevision: 4, sceneEntityId: "geometry:object-7" },
      selection: { semanticEntityId: "geometry:object-7:face:2" },
      domain: "face",
      sampling: { sampleCount: 48 },
      precision: { digits: 10, tolerance: 1e-8 },
      requestedOutputs: ["scalar", "point", "table"],
    });
    expect(geometryAnalysisIdentityForRequest(request, source).key).toBe("geometry:object-7@4");
  });

  it("executes live metrics through the shared result store and reuses an exact cached request", () => {
    const source = snapshot(2);
    const request = createGeometryAnalysisRequest({
      id: "request-2",
      kind: "basic-metrics",
      snapshot: source,
      sourceRevision: 8,
      domain: "object",
      requestedOutputs: ["scalar", "point", "table"],
      createdAt: 20,
    });
    const first = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry: createGeometryAnalysisRegistry(),
      request,
      snapshot: source,
      now: 21,
    });
    expect(first.cacheHit).toBe(false);
    expect(first.result).toMatchObject({
      state: "ready",
      backend: "Geometry analytical core",
      identity: { revision: "8" },
      payload: {
        summary: { area: 0.5 },
        provenance: { algorithm: "triangulated-object-metrics-v1", sourceRevision: 8 },
      },
    });
    expect(first.result.payload?.outputs.map((output) => output.kind)).toEqual(["scalar", "scalar", "point", "table"]);
    expect(first.store.history).toHaveLength(1);

    const cached = executeGeometryAnalysisRequest({
      store: first.store,
      registry: createGeometryAnalysisRegistry(),
      request,
      snapshot: source,
      now: 30,
    });
    expect(cached.cacheHit).toBe(true);
    expect(cached.store).toBe(first.store);
    expect(cached.result.resultVersion).toBe(first.result.resultVersion);
  });

  it("keeps stale payloads and computation history when a source revision changes", () => {
    const firstSnapshot = snapshot(3);
    const firstRequest = createGeometryAnalysisRequest({
      id: "request-3",
      kind: "basic-metrics",
      snapshot: firstSnapshot,
      sourceRevision: 1,
      domain: "object",
      requestedOutputs: ["summary"],
    });
    const first = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry: createGeometryAnalysisRegistry(),
      request: firstRequest,
      snapshot: firstSnapshot,
      now: 40,
    });
    const nextSnapshot = snapshot(4);
    const nextRequest = createGeometryAnalysisRequest({
      id: "request-4",
      kind: "basic-metrics",
      snapshot: nextSnapshot,
      sourceRevision: 2,
      domain: "object",
      requestedOutputs: ["summary"],
    });
    const next = executeGeometryAnalysisRequest({
      store: first.store,
      registry: createGeometryAnalysisRegistry(),
      request: nextRequest,
      snapshot: nextSnapshot,
      now: 50,
    });
    const oldIdentity = geometryAnalysisIdentityForRequest(firstRequest, firstSnapshot);
    const stale = getGeometryAnalysisResult<GeometryAnalysisPayload>(next.store, oldIdentity, "basic-metrics");
    expect(stale?.state).toBe("stale");
    expect(stale?.payload?.summary.area).toBe(0.5);
    expect(next.store.history.some((record) => record.identity.revision === "1" && record.state === "stale")).toBe(true);
  });

  it("resolves exact dependency keys and invalidates dependent reports", () => {
    const source = snapshot(5);
    const request = createGeometryAnalysisRequest({
      id: "request-5",
      kind: "basic-metrics",
      snapshot: source,
      sourceRevision: 5,
      domain: "object",
      requestedOutputs: ["summary"],
    });
    const registry = registerGeometryAnalysis(createGeometryAnalysisRegistry(), {
      kind: "measurement-report",
      label: "Measurement report",
      family: "geometry-report",
      domain: "object",
      dependencies: [{ kind: "basic-metrics" }],
    });
    const measured = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry,
      request,
      snapshot: source,
      now: 60,
    });
    const identity = geometryAnalysisIdentityForRequest(request, source);
    const dependency = measured.result;
    let store = upsertGeometryAnalysisResult(measured.store, {
      identity,
      kind: "measurement-report",
      payload: { outputs: [] },
      dependencies: [{
        kind: "basic-metrics",
        variant: "default",
        state: dependency.state,
        key: `${identity.key}:basic-metrics:default`,
        resultVersion: dependency.resultVersion,
      }],
      parameters: geometryAnalysisRequestParameters(request),
      now: 62,
    });
    store = upsertGeometryAnalysisResult(store, {
      identity,
      kind: "basic-metrics",
      payload: dependency.payload,
      parameters: { ...geometryAnalysisRequestParameters(request), recompute: true },
      now: 63,
    });
    expect(getGeometryAnalysisResult(store, identity, "measurement-report")?.state).toBe("stale");
  });

  it("adds a new family with a registry definition and Geometry implementation only", () => {
    const source = snapshot(6);
    const registry = registerGeometryAnalysis(createGeometryAnalysisRegistry(), {
      kind: "curve-speed",
      label: "Curve speed",
      family: "geometry-curve",
      domain: "curve",
    });
    const request = createGeometryAnalysisRequest({
      id: "request-6",
      kind: "curve-speed",
      snapshot: source,
      sourceRevision: 9,
      domain: "curve",
      parameters: { parameter: 0.25 },
      sampling: { strategy: "exact" },
      precision: { mode: "exact" },
      requestedOutputs: ["scalar"],
    });
    const implementations = new Map([
      ["curve-speed", () => ({
        algorithm: "test-analytic-curve-v1",
        outputs: [{ id: "speed", label: "Speed", kind: "scalar" as const, value: 2 }],
        summary: { speed: 2 },
        warnings: [],
      })],
    ]);
    const execution = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry,
      request,
      snapshot: source,
      implementations,
      now: 70,
    });
    expect(execution.result.payload?.summary.speed).toBe(2);
    expect(execution.result.parameters).toMatchObject({ domain: "curve", parameter: 0.25 });
  });

  it("publishes exact pointwise and sampled curve results through the shared pipeline", () => {
    const source = snapshot(7);
    const definition = getGeometryExactCurvePreset("helix");
    const request = createGeometryAnalysisRequest({
      id: "request-7",
      kind: "curve-analysis",
      snapshot: source,
      sourceRevision: 11,
      domain: "curve",
      sampling: { strategy: "exact", sampleCount: 65, tolerance: 1e-9 },
      precision: { mode: "exact", digits: 12, tolerance: 1e-9 },
      parameters: { curveDefinitionId: definition.id, parameter: Math.PI },
      requestedOutputs: ["scalar", "vector", "curve", "point", "table", "summary", "warning"],
    });
    const execution = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry: createGeometryAnalysisRegistry(),
      request,
      snapshot: source,
      context: { exactCurve: { definition, parameter: Math.PI, sampleCount: 65, tolerance: 1e-9 } },
      now: 80,
    });
    expect(execution.result).toMatchObject({
      state: "ready",
      backend: "Geometry exact curve core",
      payload: {
        provenance: { algorithm: "analytic-curve-differential-v1" },
        curveAnalysis: {
          definition: { id: "helix", capabilities: { third: "exact" } },
          arcLength: { method: "closed-form" },
        },
      },
    });
    expect(execution.result.payload?.outputs.some((output) => output.kind === "curve")).toBe(true);
    expect(execution.result.payload?.outputs.filter((output) => output.kind === "vector")).toHaveLength(3);
  });

  it("publishes exact pointwise and sampled surface results through the shared pipeline", () => {
    const source = snapshot(8);
    const definition = getGeometryExactSurfacePreset("sphere");
    const request = createGeometryAnalysisRequest({
      id: "request-8",
      kind: "surface-analysis",
      snapshot: source,
      sourceRevision: 12,
      domain: "surface",
      sampling: { strategy: "exact", sampleCount: 17 * 9, tolerance: 1e-9 },
      precision: { mode: "exact", digits: 12, tolerance: 1e-9 },
      parameters: { surfaceDefinitionId: definition.id, u: 0, v: Math.PI / 2 },
      requestedOutputs: ["scalar", "vector", "point", "table", "summary", "warning"],
    });
    const execution = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry: createGeometryAnalysisRegistry(),
      request,
      snapshot: source,
      context: { exactSurface: { definition, u: 0, v: Math.PI / 2, uCount: 17, vCount: 9, normalCurvatureAngle: 0, tolerance: 1e-9 } },
      now: 90,
    });
    expect(execution.result).toMatchObject({
      state: "ready",
      backend: "Geometry exact surface core",
      payload: {
        provenance: { algorithm: "analytic-surface-differential-v1" },
        surfaceAnalysis: {
          point: { classification: "umbilic", meanCurvature: 1, gaussianCurvature: 1 },
          conventions: { principalCurvatureOrder: "k1>=k2", meshCompatible: true },
        },
      },
    });
    expect(execution.result.payload?.outputs.some((output) => output.kind === "table")).toBe(true);
    expect(execution.result.payload?.outputs.filter((output) => output.kind === "vector").length).toBeGreaterThanOrEqual(5);
  });

  it("publishes intrinsic metric and canonical geodesic results with provenance", () => {
    const source = snapshot(9);
    const definition = getGeometryExactSurfacePreset("cylinder");
    const request = createGeometryAnalysisRequest({
      id: "request-9",
      kind: "intrinsic-geometry",
      snapshot: source,
      sourceRevision: 13,
      domain: "intrinsic",
      sampling: { strategy: "exact", sampleCount: 65, tolerance: 1e-9 },
      precision: { mode: "exact", digits: 12, tolerance: 1e-9 },
      parameters: { surfaceDefinitionId: definition.id },
      requestedOutputs: ["scalar", "curve", "table", "summary", "warning"],
    });
    const execution = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(),
      registry: createGeometryAnalysisRegistry(),
      request,
      snapshot: source,
      context: { intrinsicGeometry: { definition, start: { u: 0.1, v: 0 }, destination: { u: Math.PI * 2 - 0.1, v: 1 }, evaluation: { u: 0, v: 0 }, sampleCount: 65, gridResolution: 24, tolerance: 1e-9 } },
      now: 100,
    });
    expect(execution.result.state).toBe("ready");
    expect(execution.result.backend).toBe("Geometry analytic intrinsic adapter");
    expect(execution.result.payload?.intrinsicGeometry?.engine).toMatchObject({ exact: true, reusedEngine: "parametric" });
    expect(execution.result.payload?.intrinsicGeometry?.paths[0].method).toBe("analytic-cylinder-unwrapped");
    expect(execution.result.payload?.outputs.some((output) => output.kind === "curve")).toBe(true);
    expect(execution.result.payload?.summary.pathCount).toBe(3);
  });

  it("publishes reusable characteristic layers and typed contacts", () => {
    const source = snapshot(10);
    const definition = getGeometryExactSurfacePreset("torus");
    const request = createGeometryAnalysisRequest({ id: "request-10", kind: "feature-analysis", snapshot: source, sourceRevision: 14, domain: "surface", requestedOutputs: ["curve", "point", "table", "summary", "warning"] });
    const execution = executeGeometryAnalysisRequest({
      store: createGeometryAnalysisResultStore(), registry: createGeometryAnalysisRegistry(), request, snapshot: source,
      context: { characteristicGeometry: { definition, uCount: 25, vCount: 25, tolerance: 1e-6, intersectionProbes: [{ pair: "curve-curve", distance: 0, directionA: [1, 0, 0], directionB: [0, 1, 0] }] } }, now: 110,
    });
    expect(execution.result.backend).toBe("Geometry characteristic analysis core");
    expect(execution.result.payload?.characteristicGeometry?.counts["elliptic-region"]).toBeGreaterThan(0);
    expect(execution.result.payload?.characteristicGeometry?.counts["hyperbolic-region"]).toBeGreaterThan(0);
    expect(execution.result.payload?.characteristicGeometry?.intersections[0].type).toBe("transverse");
    expect(execution.result.payload?.characteristicGeometry?.layers.every((entry) => entry.displayOnly)).toBe(true);
  });
});
