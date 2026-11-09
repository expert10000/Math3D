import { describe, expect, it } from "vitest";
import { createMeshAnalysisResultStore, invalidateMeshAnalysisResult, upsertMeshAnalysisResult,
  type MeshAnalysisMeshIdentity } from "./analysisResultStore";
import { qualifyMeshAnalysisResult, qualifyMeshComputationRecord, selectFocusedMeshResult } from "./meshResultQualification";

const mesh: MeshAnalysisMeshIdentity = { meshId: "m", revision: "v1", key: "m@v1",
  label: "Mesh", sourceLabel: "import:mesh", vertexCount: 4, faceCount: 2 };
const settings = { highAspectRatioThreshold: 8, maxListedDefects: 12 };

describe("Mesh result qualification", () => {
  it("requires exact mesh, variant and parameters before calling a ready result current", () => {
    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      variant: "quality-v1", parameters: settings, payload: { faceCount: 2 }, now: 1 });
    const result = Object.values(store.entries)[0]!;
    const qualify = (overrides: Partial<Parameters<typeof qualifyMeshAnalysisResult>[0]> = {}) =>
      qualifyMeshAnalysisResult({ store, mesh, result, kind: "quality", variant: "quality-v1", parameters: settings, ...overrides });
    expect(qualify()).toMatchObject({ status: "current", canUseCurrentValues: true });
    expect(qualify({ variant: "quality-v2" })).toMatchObject({ status: "historical", canUseCurrentValues: false });
    expect(qualify({ parameters: { ...settings, maxListedDefects: 20 } }).reason).toMatch(/different analysis settings/);
    expect(qualify({ mesh: { ...mesh, key: "m@v2", revision: "v2" } })).toMatchObject({ status: "historical" });
  });

  it("distinguishes pending, failed, missing and invalidated results", () => {
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "curvature", mesh,
      state: "running", progress: 0.3, now: 1 });
    const qualify = () => qualifyMeshAnalysisResult({ store, mesh,
      result: Object.values(store.entries)[0]!, kind: "curvature" });
    expect(qualify().status).toBe("computing");
    store = upsertMeshAnalysisResult(store, { kind: "curvature", mesh, state: "error", error: "Worker failed", now: 2 });
    expect(qualify()).toMatchObject({ status: "failed", reason: "Worker failed" });
    store = upsertMeshAnalysisResult(store, { kind: "curvature", mesh, state: "ready", payload: { values: [1] }, now: 3 });
    store = invalidateMeshAnalysisResult(store, mesh, "curvature", "default", 4);
    expect(qualify().status).toBe("historical");
    expect(qualifyMeshAnalysisResult({ store, mesh, result: null, kind: "curvature" }).status).toBe("unavailable");
  });

  it("does not call a ready record current after its dependency changes", () => {
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "normals", mesh,
      payload: { values: [0, 0, 1] }, now: 1 });
    store = upsertMeshAnalysisResult(store, { kind: "curvature", mesh,
      dependencies: [{ kind: "normals", state: "ready" }], payload: { values: [2] }, now: 2 });
    const result = store.entries[`${mesh.key}:curvature:default`]!;
    expect(qualifyMeshAnalysisResult({ store, mesh, result, kind: "curvature" }).status).toBe("current");
    store = upsertMeshAnalysisResult(store, { kind: "normals", mesh,
      payload: { values: [0, 1, 0] }, now: 3 });
    expect(qualifyMeshAnalysisResult({ store, mesh,
      result: store.entries[`${mesh.key}:curvature:default`]!, kind: "curvature" }))
      .toMatchObject({ status: "historical", canUseCurrentValues: false });
  });

  it("selects the exact visible variant before a newer unrelated run", () => {
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      variant: "threshold-8", parameters: { threshold: 8 }, payload: { metric: 1 }, now: 1 });
    store = upsertMeshAnalysisResult(store, { kind: "quality", mesh,
      variant: "threshold-9", parameters: { threshold: 9 }, payload: { metric: 2 }, now: 2 });
    expect(selectFocusedMeshResult({ store, mesh, kind: "quality", variant: "threshold-8",
      parameters: { threshold: 8 } })?.variant).toBe("threshold-8");
    expect(selectFocusedMeshResult({ store, mesh, kind: "quality", variant: "threshold-10" })?.variant)
      .toBe("threshold-9");
    expect(selectFocusedMeshResult({ store, mesh: { ...mesh, key: "other@v1" }, kind: "quality" })).toBeNull();
  });

  it("opens a history row as current only for its exact live result version", () => {
    let store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      variant: "quality-v1", parameters: settings, payload: { faceCount: 2 }, now: 1 });
    const first = store.history[0]!;
    expect(qualifyMeshComputationRecord({ store, mesh, record: first }).status).toBe("current");
    store = upsertMeshAnalysisResult(store, { kind: "quality", mesh,
      variant: "quality-v1", parameters: settings, payload: { faceCount: 3 }, now: 2 });
    expect(qualifyMeshComputationRecord({ store, mesh, record: first })).toMatchObject({ status: "historical", canUseCurrentValues: false });
    expect(qualifyMeshComputationRecord({ store, mesh, record: store.history[0]! }).status).toBe("current");
    expect(qualifyMeshComputationRecord({ store, mesh: { ...mesh, key: "m@v2" }, record: store.history[0]! }).status).toBe("historical");
  });
});
