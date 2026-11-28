import { describe, expect, it } from "vitest";
import { benchmarkScientificOperation, generatableScientificWorkflowNodes,
  inspectScientificResult, MATH3D_PLATFORM_DISCOVERY, scientificOperationMarkdown,
  scientificParameterFields,
  type ScientificOperationDescriptor } from "@math3d/core";
import { apiScientificOperationDocumentation, apiScientificWorkflowNodes } from
  "../../packages/api-client/src/scientificOperations";
import { surfaceCurvatureOperation } from "../../renderer/src/surfaceAnalysis/surfaceCurvatureOperation";

const host = { environment: "browser" as const, implementations: ["math3d.surface.curvature-field"] };
const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations",
  "surface.curvature.compute") as ScientificOperationDescriptor;

describe("generated scientific operation products", () => {
  it("generates parameters, workflow nodes and API documentation from a complete contract", () => {
    expect(scientificParameterFields(descriptor).map(item => item.name)).toContain("histogramBins");
    expect(generatableScientificWorkflowNodes(host).map(item => item.operationId))
      .toEqual(["surface.curvature.compute"]);
    expect(generatableScientificWorkflowNodes({ environment: "browser", implementations: [] }))
      .toEqual([]);
    expect(apiScientificWorkflowNodes()).toEqual([]);
    expect(scientificOperationMarkdown(descriptor)).toContain('"histogramBins"');
    expect(apiScientificOperationDocumentation(descriptor.id)).toContain("## Output");
    expect(apiScientificOperationDocumentation("missing")).toBeNull();
    const partial = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations",
      "mesh.validation") as ScientificOperationDescriptor;
    expect(scientificParameterFields(partial)).toEqual([]);
    expect(generatableScientificWorkflowNodes({ environment: "desktop",
      implementations: ["worker:mesh.validation"] }).map(item => item.operationId))
      .not.toContain(partial.id);
  });

  it("benchmarks a verified implementation with schema checked fixtures and outputs", async () => {
    let tick = 0;
    const execute = (input: unknown, parameters: unknown) => surfaceCurvatureOperation.execute({
      source: (input as { surfaceSamples: Parameters<typeof surfaceCurvatureOperation.execute>[0]["source"] }).surfaceSamples,
      options: parameters as Parameters<typeof surfaceCurvatureOperation.execute>[0]["options"],
    });
    const fixture = { surfaceSamples: { sampleCount: 1, K: [-1], H: [0], k1: [1], k2: [-1] } };
    const report = await benchmarkScientificOperation({ id: descriptor.id, host,
      input: fixture, parameters: { histogramBins: 2 }, iterations: 2, execute,
      now: () => ++tick });
    expect(report).toMatchObject({ operationId: descriptor.id, iterations: 2, meanMs: 1, maxMs: 1 });
    await expect(benchmarkScientificOperation({ id: descriptor.id, host,
      input: {}, parameters: {}, iterations: 1, execute })).rejects.toThrow(/fixture/);
    await expect(benchmarkScientificOperation({ id: descriptor.id,
      host: { environment: "browser", implementations: [] }, input: fixture,
      parameters: {}, iterations: 1, execute })).rejects.toThrow(/verified/);
  });

  it("builds result inspection only from registered metric identities", () => {
    const result = { executionId: "run-1", operationId: descriptor.id,
      capabilityIds: descriptor.capabilityIds, sourceReference: "surface:1@1",
      metrics: [{ id: "metric.K.mean", value: -1, units: "m^-2" }],
      artifacts: [{ id: "artifact.surface.curvature-field", type: "SurfaceCurvatureField",
        reference: "stored:1", retained: true }] };
    expect(inspectScientificResult(result)?.metrics[0]).toMatchObject({ title: "K mean", value: -1 });
    expect(inspectScientificResult({ ...result,
      metrics: [{ id: "metric.missing", value: 1, units: null }] })).toBeNull();
  });
});
