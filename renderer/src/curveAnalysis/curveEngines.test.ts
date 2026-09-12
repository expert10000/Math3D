import { describe, expect, it } from "vitest";
import { adaptCurveDefinition } from "./infrastructure";
import { CurveEngineRegistry, createNativeCurveEngine, createOptionalCurveEngine, type CurveEngineRequest } from "./curveEngines";

const definition = adaptCurveDefinition({ id: "engine-curve", revision: 3, label: "Engine curve", representation: "polyline", dimension: 2, points: [[0, 0], [0.5, 1], [1, 0]], domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false }, dependencies: [{ module: "geometry", objectId: "edge-1", revision: "8", relation: "source" }] });
const points = [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }];
const request = (operation: CurveEngineRequest["operation"], preferredEngine: CurveEngineRequest["preferredEngine"]): CurveEngineRequest => ({ requestId: `${operation}:${preferredEngine}`, operation, preferredEngine, definition, points, tolerance: 1e-6 });

describe("optional Curve engine adapters", () => {
  it("publishes capabilities and leaves optional engines inspectably unavailable", () => {
    const registry = new CurveEngineRegistry();
    expect(registry.listAvailability()).toEqual([
      expect.objectContaining({ engine: "math3d-native", available: true, version: "curve-core-v1" }),
      expect.objectContaining({ engine: "vtk", available: false, version: "not-installed" }),
      expect.objectContaining({ engine: "cgal", available: false, version: "not-installed" }),
    ]);
    expect(registry.capability("tube")).toMatchObject({ engines: ["vtk"], nativeFallback: false });
    expect(registry.capability("analytical-evaluation")).toMatchObject({ exactAuthority: true });
  });

  it("uses deterministic native fallbacks with full metadata when optional engines are missing", async () => {
    const registry = new CurveEngineRegistry();
    const result = await registry.execute({ ...request("resample", "vtk"), parameters: { sampleCount: 5 } });
    expect(result).toMatchObject({ state: "fallback", backend: "math3d-native", backendVersion: "curve-core-v1", requestedBackend: "vtk", inputCount: 3, outputCount: 5, fallback: { used: true }, validation: { finite: true, sourceMapping: "complete" }, provenance: { curveId: "engine-curve", curveRevision: 3, correspondence: "source-index-per-output" } });
    expect(result.warnings.join(" ")).toContain("VTK Curve adapter unavailable");
    expect(result.runtimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns a structured unavailable result when neither engine nor native fallback supports the operation", async () => {
    const result = await new CurveEngineRegistry().execute(request("tube", "vtk"));
    expect(result).toMatchObject({ state: "unavailable", backend: "vtk", outputCount: 0, fallback: { used: false }, validation: { finite: true, sourceMapping: "unavailable" } });
  });

  it("keeps exact analytical evaluation native unless comparison is explicit", async () => {
    const vtk = createOptionalCurveEngine("vtk", { available: true, version: "vtk-9.4", execute: async (value) => ({ points: [...value.points] }) });
    const registry = new CurveEngineRegistry([createNativeCurveEngine(), vtk, createOptionalCurveEngine("cgal")]);
    const result = await registry.execute(request("analytical-evaluation", "vtk"));
    expect(result).toMatchObject({ state: "success", backend: "math3d-native", validation: { maximumParityDeviation: 0, parityWithinTolerance: true } });
    expect(result.warnings[0]).toContain("authoritative");
  });

  it("runs available capability adapters and validates native parity and source correspondence", async () => {
    const vtk = createOptionalCurveEngine("vtk", { available: true, version: "vtk-9.4", execute: async (value) => ({ points: value.points.map((point) => ({ ...point })), sourceIndices: Uint32Array.from(value.points.map((_, index) => index)) }) });
    const result = await new CurveEngineRegistry([createNativeCurveEngine(), vtk, createOptionalCurveEngine("cgal")]).execute(request("smooth", "vtk"));
    expect(result).toMatchObject({ state: "success", backend: "vtk", backendVersion: "vtk-9.4", validation: { finite: true, sourceMapping: "complete", maximumParityDeviation: 0, parityWithinTolerance: true } });
  });

  it("falls back after adapter failure and supports native simplify/intersection kernels", async () => {
    const cgal = createOptionalCurveEngine("cgal", { available: true, version: "cgal-6", execute: async () => { throw new Error("bridge closed"); } });
    const registry = new CurveEngineRegistry([createNativeCurveEngine(), createOptionalCurveEngine("vtk"), cgal]);
    const simplified = await registry.execute({ ...request("polyline-simplify", "cgal"), tolerance: 0.1 });
    expect(simplified).toMatchObject({ state: "fallback", backend: "math3d-native" });
    expect(simplified.warnings.join(" ")).toContain("bridge closed");
    const crossings = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }];
    const intersection = await registry.execute({ ...request("robust-2d-intersections", "math3d-native"), points: crossings });
    expect(intersection.points[0]).toEqual({ x: 0.5, y: 0.5, z: 0 });
  });
});
