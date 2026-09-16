import { describe, expect, it } from "vitest";
import { createMeshAnalysisMeshIdentity, createMeshAnalysisResultStore } from "./analysisResultStore";
import { MeshAnalysisKernelBridge, decodeMeshAnalysisPayload, encodeMeshAnalysisPayload } from "./meshAnalysisKernelBridge";
import { MeshDocumentAdapter } from "./meshDocumentAdapter";
import type { SurfaceMeshData } from "./surfaceMesh";

const triangle = (): SurfaceMeshData => ({
  label: "Triangle", source: { kind: "polyhedronPreset", id: "triangle" },
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
});

describe("GK09 Mesh analysis artifact bridge", () => {
  it("round-trips dense typed fields and non-finite scientific values", () => {
    const payload = { field: new Float64Array([1, Number.NaN, Number.POSITIVE_INFINITY]), mask: new Uint8Array([1, 0, 1]), range: { min: Number.NEGATIVE_INFINITY } };
    expect(decodeMeshAnalysisPayload(encodeMeshAnalysisPayload(payload))).toEqual(payload);
  });

  it("keeps dense payloads out of React result/history state and binds artifacts to MeshDocument generation", () => {
    const adapter = MeshDocumentAdapter.fromMesh(triangle());
    const bridge = new MeshAnalysisKernelBridge(() => adapter);
    const identity = createMeshAnalysisMeshIdentity(triangle());
    const payload = { gaussianCurvature: new Float64Array([0, 1, 2]), validMask: new Uint8Array([1, 1, 1]) };
    const store = bridge.upsert(createMeshAnalysisResultStore(), { kind: "curvature", variant: "test-v1", mesh: identity, state: "ready", parameters: { method: "test" }, payload });
    expect(JSON.stringify(store)).not.toContain("gaussianCurvature");
    expect(JSON.stringify(store)).not.toContain("Float64Array");
    expect(bridge.getForParameters(store, identity, "curvature", { method: "test" }, "test-v1")?.payload).toEqual(payload);
    const result = bridge.results()[0]!;
    expect(result.provenance.source).toEqual(adapter.sourceGeneration());
    expect(result.artifacts).toHaveLength(1);
    expect(bridge.artifactRegistry().resolve(result.artifacts[0]!, result.provenance.source).ok).toBe(true);
    const edited = triangle(); edited.positions[5] = 0.5;
    adapter.replaceMesh(edited);
    bridge.invalidateCurrentSource();
    expect(bridge.get(store, identity, "curvature", "test-v1")).toMatchObject({ state: "stale", payload: null });
  });

  it("also artifactizes implicit-ready normals and keeps computation history compact", () => {
    const mesh = triangle();
    const adapter = MeshDocumentAdapter.fromMesh(mesh);
    const bridge = new MeshAnalysisKernelBridge(() => adapter);
    const identity = createMeshAnalysisMeshIdentity(mesh);
    const store = bridge.upsert(createMeshAnalysisResultStore(), {
      kind: "normals", variant: "area-weighted-v1", mesh: identity,
      parameters: { method: "area-weighted-input-winding" },
      payload: { values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), validMask: new Uint8Array([1, 1, 1]) },
    });
    expect(JSON.stringify(store)).not.toContain('"values"');
    expect(bridge.get(store, identity, "normals", "area-weighted-v1")?.state).toBe("ready");
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ status: "clean", availability: "available" });
  });
});
