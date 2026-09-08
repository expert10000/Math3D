import { describe, expect, it } from "vitest";
import {
  createMeshAnalysisMeshIdentity,
  createMeshAnalysisResultStore,
  getMeshAnalysisResult,
  meshAnalysisResultKindsForMesh,
  upsertMeshAnalysisResult,
} from "./analysisResultStore";

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
    expect(result?.dependencies).toEqual([{ kind: "diagnostics", state: "stale" }]);
    expect(meshAnalysisResultKindsForMesh(store, mesh)).toEqual([]);
  });
});
