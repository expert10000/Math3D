import { describe, expect, it } from "vitest";
import { runScientificWorkflow } from "@math3d/core";
import { SCIENTIFIC_OPERATION_BINDINGS } from "./scientificOperationBindings";

const host = { environment: "browser" as const,
  implementations: Object.values(SCIENTIFIC_OPERATION_BINDINGS).map(item => item.implementationId) };
const triangle = { mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } };

describe("Scientific workflow execution", () => {
  it("connects verified operation outputs and checks each port", async () => {
    const result = await runScientificWorkflow({ host,
      bindings: SCIENTIFIC_OPERATION_BINDINGS, steps: [
        { id: "first", operationId: "mesh.normals.compute", input: triangle, parameters: {} },
        { id: "second", operationId: "mesh.normals.compute",
          input: { mesh: { $from: "first" } }, parameters: {} },
      ] });
    expect((result.steps[1].output as { normals: number[] }).normals)
      .toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("rejects missing bindings, forward references and incompatible ports", async () => {
    const first = { id: "first", operationId: "mesh.normals.compute",
      input: triangle, parameters: {} };
    await expect(runScientificWorkflow({ host: { ...host, implementations: [] },
      bindings: SCIENTIFIC_OPERATION_BINDINGS, steps: [first] }))
      .rejects.toThrow(/verified workflow binding/);
    await expect(runScientificWorkflow({ host, bindings: SCIENTIFIC_OPERATION_BINDINGS,
      steps: [{ ...first, input: { mesh: { $from: "later" } } }] }))
      .rejects.toThrow(/has not run/);
    await expect(runScientificWorkflow({ host, bindings: SCIENTIFIC_OPERATION_BINDINGS,
      steps: [first, { id: "second", operationId: "mesh.normals.compute",
        input: { mesh: { $from: "first", path: "normals" } }, parameters: {} }] }))
      .rejects.toThrow(/input contract/);
  });
});
