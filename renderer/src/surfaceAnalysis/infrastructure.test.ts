import { describe, expect, it } from "vitest";
import type { SurfaceAdapterInput, SurfaceAnalysisPayload } from "./contracts";
import {
  adaptSurfaceDefinition,
  createSurfaceAnalysisRegistry,
  createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore,
  getSurfaceAnalysisDefinition,
  getSurfaceAnalysisResult,
  inspectSurfaceAnalysisResult,
  publishSurfaceAnalysisResult,
  resolveSurfaceRevision,
} from "./infrastructure";

const parameterDomain = {
  kind: "parameter" as const,
  u: { min: 0, max: 1 },
  v: { min: 0, max: 1 },
};

const inputs: SurfaceAdapterInput[] = [
  { id: "explicit-1", revision: 1, label: "Graph", representation: "explicit", formula: "x^2+y^2", domain: { kind: "graph", x: { min: -1, max: 1 }, y: { min: -1, max: 1 } } },
  { id: "implicit-1", revision: 2, label: "Sphere level set", representation: "implicit", formula: "x^2+y^2+z^2", isoValue: 1, domain: { kind: "spatial-bounds", min: [-1, -1, -1], max: [1, 1, 1] } },
  { id: "param-1", revision: 3, label: "Plane", representation: "parametric", expressions: { x: "u", y: "v", z: "0" }, domain: parameterDomain },
  { id: "spline-1", revision: 4, label: "NURBS patch", representation: "spline", familyId: "nurbs", settings: { degreeU: 3, degreeV: 3 }, domain: parameterDomain },
  { id: "constructed-1", revision: 5, label: "Ruled", representation: "constructed", familyId: "ruled", sourceIds: ["curve-a", "curve-b"], domain: parameterDomain },
  { id: "weierstrass-1", revision: 6, label: "Enneper", representation: "weierstrass", gExpression: "z", phiExpression: "1", domain: parameterDomain },
  { id: "mesh-1", revision: 7, label: "Imported shell", representation: "mesh-backed", meshId: "mesh:7", domain: { kind: "mesh", vertexCount: 20, faceCount: 32 } },
];

describe("Surface Analysis canonical infrastructure", () => {
  it("adapts every supported Surface representation to one revisioned contract", () => {
    const definitions = inputs.map(adaptSurfaceDefinition);
    expect(definitions.map((definition) => definition.representation)).toEqual([
      "explicit", "implicit", "parametric", "spline", "constructed", "weierstrass", "mesh-backed",
    ]);
    expect(definitions.map((definition) => definition.identity.key)).toEqual([
      "surface:explicit-1@1", "surface:implicit-1@2", "surface:param-1@3", "surface:spline-1@4",
      "surface:constructed-1@5", "surface:weierstrass-1@6", "surface:mesh-1@7",
    ]);
    expect(definitions[0].orientation.convention).toBe("graph-up");
    expect(definitions[1].orientation.convention).toBe("gradient");
    expect(definitions[6].orientation.convention).toBe("mesh-winding");
    expect(definitions[4].source.sourceIds).toEqual(["curve-a", "curve-b"]);
  });

  it("rejects invalid revisions and degenerate domains", () => {
    expect(() => adaptSurfaceDefinition({ ...inputs[0], revision: -1 })).toThrow(/revision/i);
    expect(() => adaptSurfaceDefinition({
      ...inputs[2],
      domain: { kind: "parameter", u: { min: 1, max: 1 }, v: { min: 0, max: 1 } },
    })).toThrow(/positive extent/i);
  });

  it("registers Surface result kinds and their domain dependencies in the shared registry", () => {
    const registry = createSurfaceAnalysisRegistry();
    expect(getSurfaceAnalysisDefinition(registry, "curvature-field")).toMatchObject({
      domain: "surface",
      dependencies: [{ kind: "differential-geometry" }],
    });
    expect(getSurfaceAnalysisDefinition(registry, "derived-surface-mesh")).toMatchObject({
      domain: "derived-mesh",
      dependencies: [{ kind: "surface-definition" }],
    });
  });

  it("publishes method-labelled results and dependency versions through the shared result store", () => {
    const definition = adaptSurfaceDefinition(inputs[2]);
    const registry = createSurfaceAnalysisRegistry();
    let store = createSurfaceAnalysisResultStore();
    const definitionRequest = createSurfaceAnalysisRequest({
      requestId: "definition",
      kind: "surface-definition",
      definition,
      domain: "surface",
      method: "analytic",
    });
    store = publishSurfaceAnalysisResult({
      store,
      registry,
      request: definitionRequest,
      payload: {
        version: 1,
        surfaceId: definition.identity.surfaceId,
        surfaceRevision: definition.identity.surfaceRevision,
        representation: definition.representation,
        method: "analytic",
        units: definition.units,
        orientation: definition.orientation,
        warnings: [],
        data: { kind: "summary", values: { regular: true } },
      },
      now: 10,
    });

    const differentialRequest = createSurfaceAnalysisRequest({
      requestId: "differential",
      kind: "differential-geometry",
      definition,
      domain: "surface",
      method: "automatic-differentiation",
      requestedOutputs: ["K", "H", "k1", "k2"],
    });
    const payload: SurfaceAnalysisPayload = {
      version: 1,
      surfaceId: definition.identity.surfaceId,
      surfaceRevision: definition.identity.surfaceRevision,
      representation: definition.representation,
      method: "automatic-differentiation",
      units: definition.units,
      orientation: definition.orientation,
      warnings: ["Boundary samples use one-sided derivatives."],
      data: { kind: "summary", values: { validSamples: 81 } },
    };
    store = publishSurfaceAnalysisResult({ store, registry, request: differentialRequest, payload, computeTimeMs: 4, now: 11 });

    const result = getSurfaceAnalysisResult(store, definition.identity, "differential-geometry");
    expect(result).toMatchObject({ state: "ready", backend: "Surface Analysis", dependencies: [{ state: "ready", resultVersion: 1 }] });
    expect(inspectSurfaceAnalysisResult(result!)).toMatchObject({
      surfaceId: "param-1",
      surfaceRevision: 3,
      representation: "parametric",
      method: "automatic-differentiation",
      warnings: ["Boundary samples use one-sided derivatives."],
      dependencyStates: [{ kind: "surface-definition", state: "ready", resultVersion: 1 }],
    });
    expect(store.history[0]).toMatchObject({ kind: "differential-geometry", durationMs: 4 });
  });

  it("keeps cancelled computations in history without publishing them as ready", () => {
    const definition = adaptSurfaceDefinition(inputs[0]);
    const request = createSurfaceAnalysisRequest({ requestId: "cancel-me", kind: "surface-definition", definition, domain: "surface", method: "numerical-derivatives" });
    const registry = createSurfaceAnalysisRegistry();
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry, request, state: "running", progress: 0.4, now: 20 });
    store = publishSurfaceAnalysisResult({ store, registry, request, state: "cancelled", progress: null, error: "Cancelled by user", now: 21 });
    expect(getSurfaceAnalysisResult(store, definition.identity, "surface-definition")).toMatchObject({ state: "cancelled", error: "Cancelled by user" });
    expect(store.history).toHaveLength(1);
    expect(store.history[0].state).toBe("cancelled");
  });

  it("marks prior-revision Surface results stale when a new revision publishes", () => {
    const first = adaptSurfaceDefinition(inputs[0]);
    const next = adaptSurfaceDefinition({ ...inputs[0], revision: 2, formula: "x^2-y^2" });
    const registry = createSurfaceAnalysisRegistry();
    const requestFor = (definition: ReturnType<typeof adaptSurfaceDefinition>) => createSurfaceAnalysisRequest({
      requestId: `definition-${definition.identity.surfaceRevision}`,
      kind: "surface-definition",
      definition,
      domain: "surface",
      method: "symbolic",
    });
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry, request: requestFor(first), now: 30 });
    store = publishSurfaceAnalysisResult({ store, registry, request: requestFor(next), now: 31 });
    expect(getSurfaceAnalysisResult(store, first.identity, "surface-definition")?.state).toBe("stale");
    expect(getSurfaceAnalysisResult(store, next.identity, "surface-definition")?.state).toBe("ready");
  });

  it("advances a Surface revision only when its definition fingerprint changes", () => {
    const tracker = new Map();
    expect(resolveSurfaceRevision(tracker, "surface-a", "formula:a")).toBe(1);
    expect(resolveSurfaceRevision(tracker, "surface-a", "formula:a")).toBe(1);
    expect(resolveSurfaceRevision(tracker, "surface-a", "formula:b")).toBe(2);
    expect(resolveSurfaceRevision(tracker, "surface-b", "formula:a")).toBe(1);
  });
});
