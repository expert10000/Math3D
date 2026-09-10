import { describe, expect, it } from "vitest";
import {
  createMeshAnalysisMeshIdentity,
  createMeshAnalysisResultStore,
  getMeshAnalysisResult,
  getMeshAnalysisResultForParameters,
  invalidateMeshAnalysisResult,
  meshAnalysisParameterHash,
  meshAnalysisResultKindsForMesh,
  upsertMeshAnalysisResult,
} from "./analysisResultStore";
import { MESH_FIELD_CALCULUS_VERSION, meshFieldCalculusResultVariant } from "./meshSurfaceFieldCalculus";

const makeMesh = (label: string, z = 0) => ({
  label,
  positions: new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]),
  indices: new Uint32Array([0, 1, 2]),
  source: { kind: "polyhedronPreset" as const, id: "triangle" },
});

describe("mesh analysis result store", () => {
  it("keeps results for different mesh revisions separate", () => {
    const original = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    const edited = createMeshAnalysisMeshIdentity(makeMesh("Triangle", 2));
    expect(original.key).not.toBe(edited.key);

    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      mesh: original,
      payload: { K: new Float32Array([0, 1, 2]) },
      now: 1,
    });
    expect(getMeshAnalysisResult(store, original, "curvature")?.payload).not.toBeNull();
    expect(getMeshAnalysisResult(store, edited, "curvature")).toBeNull();
  });

  it("detects a same-size coordinate edit in the mesh revision", () => {
    const originalMesh = makeMesh("Triangle");
    const editedMesh = makeMesh("Triangle");
    editedMesh.positions[4] = 0.000001;
    expect(createMeshAnalysisMeshIdentity(originalMesh).revision).not.toBe(
      createMeshAnalysisMeshIdentity(editedMesh).revision
    );
  });

  it("hashes every value in a large mesh revision", () => {
    const positions = new Float32Array(300_000);
    const editedPositions = positions.slice();
    editedPositions[123_457] = 0.25;
    const base = {
      label: "Large mesh",
      indices: new Uint32Array([0, 1, 2]),
      source: { kind: "polyhedronPreset" as const, id: "large" },
    };
    expect(createMeshAnalysisMeshIdentity({ ...base, positions }).revision).not.toBe(
      createMeshAnalysisMeshIdentity({ ...base, positions: editedPositions }).revision
    );
  });

  it("keeps analysis kinds and configured variants independently", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = createMeshAnalysisResultStore();
    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      mesh,
      payload: { K: new Float32Array([0, 1, 2]) },
      now: 1,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "quality",
      variant: "threshold-8-listed-120",
      mesh,
      payload: { maxAspectRatio: 8 },
      now: 2,
    });
    expect(meshAnalysisResultKindsForMesh(store, mesh)).toEqual(["curvature", "quality"]);
    expect(getMeshAnalysisResult(store, mesh, "quality", "threshold-8-listed-120")?.payload).toEqual({ maxAspectRatio: 8 });
  });

  it("tracks progress and dependencies for deferred and running results", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "quality",
      mesh,
      state: "deferred",
      progress: null,
      dependencies: [{ kind: "diagnostics", state: "stale" }],
      now: 1,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "quality",
      mesh,
      state: "running",
      progress: 0.42,
      now: 2,
    });
    const result = getMeshAnalysisResult(store, mesh, "quality");
    expect(result?.state).toBe("running");
    expect(result?.progress).toBe(0.42);
    expect(result?.dependencies).toEqual([
      expect.objectContaining({ kind: "diagnostics", variant: "default", state: "stale" }),
    ]);
    expect(meshAnalysisResultKindsForMesh(store, mesh)).toEqual([]);
  });

  it("tracks queued and cancelled worker jobs without publishing partial results", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      mesh,
      state: "queued",
      progress: 0,
      payload: null,
      now: 1,
    });
    expect(getMeshAnalysisResult(store, mesh, "curvature")).toMatchObject({
      state: "queued",
      progress: 0,
      payload: null,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      mesh,
      state: "cancelled",
      progress: null,
      error: "cancelled",
      now: 2,
    });
    expect(getMeshAnalysisResult(store, mesh, "curvature")).toMatchObject({
      state: "cancelled",
      progress: null,
      payload: null,
      error: "cancelled",
    });
    expect(meshAnalysisResultKindsForMesh(store, mesh)).toEqual([]);
  });

  it("matches cache entries only when their input parameters match", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "quality",
      variant: "aspect-ratio",
      mesh,
      parameters: { threshold: 8, includeBoundary: true },
      payload: { values: new Float32Array([1]) },
      now: 1,
    });
    expect(
      getMeshAnalysisResultForParameters(store, mesh, "quality", { includeBoundary: true, threshold: 8 }, "aspect-ratio")
    ).not.toBeNull();
    expect(
      getMeshAnalysisResultForParameters(store, mesh, "quality", { includeBoundary: true, threshold: 10 }, "aspect-ratio")
    ).toBeNull();
  });

  it("fingerprints nested parameters deterministically without numeric collisions", () => {
    expect(meshAnalysisParameterHash({ b: { y: 2, x: 1 }, a: [true, "x"] })).toBe(
      meshAnalysisParameterHash({ a: [true, "x"], b: { x: 1, y: 2 } })
    );
    expect(meshAnalysisParameterHash({ value: Number.NaN })).not.toBe(
      meshAnalysisParameterHash({ value: null })
    );
    expect(meshAnalysisParameterHash({ value: -0 })).not.toBe(
      meshAnalysisParameterHash({ value: 0 })
    );
  });

  it("marks direct and transitive dependents stale when a prerequisite changes", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      mesh,
      payload: { K: new Float32Array([1]) },
      now: 1,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "principal-directions",
      mesh,
      dependencies: [{ kind: "curvature", state: "ready" }],
      payload: { d1: new Float32Array([1, 0, 0]) },
      now: 2,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "ridges-valleys",
      mesh,
      dependencies: [{ kind: "principal-directions", state: "ready" }],
      payload: { lines: [] },
      now: 3,
    });

    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      mesh,
      parameters: { smoothing: 1 },
      payload: { K: new Float32Array([2]) },
      now: 4,
    });

    expect(getMeshAnalysisResult(store, mesh, "curvature")?.state).toBe("ready");
    expect(getMeshAnalysisResult(store, mesh, "principal-directions")?.state).toBe("stale");
    expect(getMeshAnalysisResult(store, mesh, "ridges-valleys")?.state).toBe("stale");
  });

  it("retains prior revisions as stale history when a new revision is stored", () => {
    const original = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    const edited = createMeshAnalysisMeshIdentity(makeMesh("Triangle", 2));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      mesh: original,
      payload: { K: new Float32Array([1]) },
      now: 1,
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      mesh: edited,
      payload: { K: new Float32Array([2]) },
      now: 2,
    });
    expect(getMeshAnalysisResult(store, original, "curvature")?.state).toBe("stale");
    expect(getMeshAnalysisResult(store, edited, "curvature")?.state).toBe("ready");
  });

  it("supports explicit invalidation and preserves the stale payload for inspection", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      mesh,
      payload: { K: new Float32Array([7]) },
      now: 1,
    });
    store = invalidateMeshAnalysisResult(store, mesh, "curvature", "default", 2);
    const result = getMeshAnalysisResult<{ K: Float32Array }>(store, mesh, "curvature");
    expect(result?.state).toBe("stale");
    expect(result?.payload?.K[0]).toBe(7);
    expect(meshAnalysisResultKindsForMesh(store, mesh)).toEqual([]);
  });

  it("caches field-calculus operators by source and invalidates their exact dependencies", () => {
    const mesh = createMeshAnalysisMeshIdentity(makeMesh("Triangle"));
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), {
      kind: "curvature",
      variant: "discrete-differential-geometry-v2",
      mesh,
      payload: { K: Float64Array.from([1, 1, 1]) },
      now: 1,
    });
    const source = "K";
    const variant = meshFieldCalculusResultVariant("laplacian", source);
    const parameters = {
      version: MESH_FIELD_CALCULUS_VERSION,
      operator: "laplacian",
      source,
      mass: "lumped-barycentric",
    };
    store = upsertMeshAnalysisResult(store, {
      kind: "field-calculus",
      variant,
      mesh,
      parameters,
      dependencies: [{ kind: "curvature", variant: "discrete-differential-geometry-v2", state: "ready" }],
      payload: { values: Float64Array.from([0, 0, 0]) },
      now: 2,
    });
    expect(getMeshAnalysisResultForParameters(store, mesh, "field-calculus", parameters, variant)?.state).toBe("ready");
    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      variant: "discrete-differential-geometry-v2",
      mesh,
      payload: { K: Float64Array.from([2, 2, 2]) },
      now: 3,
    });
    expect(getMeshAnalysisResult(store, mesh, "field-calculus", variant)?.state).toBe("stale");
  });
});
