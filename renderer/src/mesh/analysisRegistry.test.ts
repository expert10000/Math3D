import { describe, expect, it } from "vitest";
import {
  createMeshAnalysisRegistry,
  getMeshAnalysisDefinition,
  listMeshAnalysisDefinitions,
  registerMeshAnalysis,
  resolveMeshAnalysisDependencies,
} from "./analysisRegistry";
import {
  createMeshAnalysisMeshIdentity,
  createMeshAnalysisResultStore,
  upsertMeshAnalysisResult,
} from "./analysisResultStore";

describe("mesh analysis registry", () => {
  it("registers the canonical analysis families and dependency graph", () => {
    const registry = createMeshAnalysisRegistry();
    expect(getMeshAnalysisDefinition(registry, "curvature")?.domain).toBe("vertex");
    expect(getMeshAnalysisDefinition(registry, "principal-directions")?.dependencies).toEqual([
      { kind: "normals" },
      { kind: "curvature" },
    ]);
    expect(listMeshAnalysisDefinitions(registry).length).toBeGreaterThan(4);
  });

  it("supports extension while rejecting duplicates and missing dependencies", () => {
    const registry = createMeshAnalysisRegistry();
    const extended = registerMeshAnalysis(registry, {
      kind: "custom-field",
      label: "Custom field",
      family: "custom",
      domain: "vertex",
      dependencies: [{ kind: "curvature" }],
    });
    expect(getMeshAnalysisDefinition(extended, "custom-field")?.label).toBe("Custom field");
    expect(() => registerMeshAnalysis(extended, {
      kind: "custom-field",
      label: "Duplicate",
      family: "custom",
      domain: "vertex",
    })).toThrow(/already registered/i);
    expect(() => createMeshAnalysisRegistry([{
      kind: "broken",
      label: "Broken",
      family: "custom",
      domain: "vertex",
      dependencies: [{ kind: "missing" }],
    }])).toThrow(/unregistered analysis/i);
  });

  it("registers algorithm variants independently", () => {
    let registry = createMeshAnalysisRegistry();
    registry = registerMeshAnalysis(registry, {
      kind: "curvature",
      variant: "vtk-reference",
      label: "VTK reference curvature",
      family: "differential-geometry",
      domain: "vertex",
    });
    expect(getMeshAnalysisDefinition(registry, "curvature")?.label).toBe("Surface curvature");
    expect(getMeshAnalysisDefinition(registry, "curvature", "vtk-reference")?.label).toBe(
      "VTK reference curvature"
    );
  });

  it("rejects dependency cycles", () => {
    expect(() => createMeshAnalysisRegistry([
      { kind: "a", label: "A", family: "test", domain: "mesh", dependencies: [{ kind: "b" }] },
      { kind: "b", label: "B", family: "test", domain: "mesh", dependencies: [{ kind: "a" }] },
    ])).toThrow(/dependency cycle/i);
  });

  it("resolves definitions to exact result snapshots", () => {
    const mesh = createMeshAnalysisMeshIdentity({
      label: "Triangle",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      source: { kind: "polyhedronPreset", id: "triangle" },
    });
    let store = createMeshAnalysisResultStore();
    store = upsertMeshAnalysisResult(store, { kind: "normals", mesh, payload: {}, now: 1 });
    store = upsertMeshAnalysisResult(store, { kind: "curvature", mesh, payload: {}, now: 2 });

    const dependencies = resolveMeshAnalysisDependencies(
      createMeshAnalysisRegistry(),
      store,
      mesh,
      "principal-directions"
    );
    expect(dependencies).toEqual([
      expect.objectContaining({ kind: "normals", state: "ready", resultVersion: 1 }),
      expect.objectContaining({ kind: "curvature", state: "ready", resultVersion: 1 }),
    ]);
  });
});
