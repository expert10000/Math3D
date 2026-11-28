import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AddressInfo } from "node:net";
import { createScientificApiServer } from "./server";
import { connectApiScientificOperations } from "../../packages/api-client/src/scientificOperations";

const server = createScientificApiServer();
let origin = "";
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

const execute = (id: string, input: unknown, parameters: unknown = {}) =>
  fetch(`${origin}/v1/operations/${id}/execute`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, parameters }) });

describe("Scientific API verified server execution", () => {
  it("discovers only bound complete operations", async () => {
    const response = await fetch(`${origin}/v1/operations`);
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.operations).toHaveLength(15);
    expect(report.operations.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([
      "surface.curvature.compute", "surface.curvature.parametric",
      "surface.curvature.analytic-reference", "mesh.normals.compute",
      "graph2d.roots.quadratic", "graph3d.gradient.quadratic",
      "quantum.probability-density.samples",
    ]));
    expect(report.operations.some((item: { id: string }) => item.id === "curve.analyze")).toBe(false);
  });

  it("runs parametric Surface curvature and its reference validator", async () => {
    const response = await execute("surface.curvature.parametric", { surface: {
      kind: "parametric", expressions: { x: "u", y: "v", z: "0" },
      domain: { u: { min: -2, max: 2 }, v: { min: -2, max: 2 } },
      lengthUnit: "scene-unit", referencePresetId: "plane",
    } }, { resolutionU: 3, resolutionV: 3 });
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.output.field.sampleCount).toBe(9);
    expect(report.output.validation.referenceStatus).toBe("passed");
  });

  it("runs Mesh normals and rejects invalid input before execution", async () => {
    const response = await execute("mesh.normals.compute", { mesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
    } });
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.output.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const invalid = await execute("mesh.normals.compute", { mesh: { positions: "bad" } });
    expect(invalid.status).toBe(400);
    const outOfBounds = await execute("mesh.normals.compute", { mesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3],
    } });
    expect(outOfBounds.status).toBe(400);
    expect((await execute("curve.analyze", {})).status).toBe(404);
  });

  it("executes a new module operation through the HTTP client", async () => {
    const client = await connectApiScientificOperations(origin);
    const result = await client.execute("number-theory.modular-inverse.compute",
      { value: 3, modulus: 11 }) as { inverse: number };
    expect(result.inverse).toBe(4);
  });

  it("executes connected workflow nodes through the same verified bindings", async () => {
    const nodes = await (await fetch(`${origin}/v1/workflow-nodes`)).json();
    expect(nodes.nodes.map((node: { operationId: string }) => node.operationId))
      .toContain("mesh.normals.compute");
    const response = await fetch(`${origin}/v1/workflows/execute`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: [
        { id: "first", operationId: "mesh.normals.compute", input: { mesh: {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
        } }, parameters: {} },
        { id: "second", operationId: "mesh.normals.compute",
          input: { mesh: { $from: "first" } }, parameters: {} },
      ] }) });
    expect(response.status).toBe(200);
    expect((await response.json()).steps[1].output.normals).toEqual(
      [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("executes through the descriptor checked TypeScript API client", async () => {
    const client = await connectApiScientificOperations(origin);
    expect(client.operations.map(item => item.id)).toContain("mesh.normals.compute");
    const result = await client.execute("mesh.normals.compute", { mesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
    } }) as { normals: number[] };
    expect(result.normals[2]).toBe(1);
    const workflow = await client.runWorkflow([{ id: "normals",
      operationId: "mesh.normals.compute", input: { mesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
      } }, parameters: {} }]) as { steps: { output: { normals: number[] } }[] };
    expect(workflow.steps[0].output.normals[2]).toBe(1);
    await expect(client.execute("curve.analyze", {})).rejects.toThrow(/verified server operation/);
  });
});
