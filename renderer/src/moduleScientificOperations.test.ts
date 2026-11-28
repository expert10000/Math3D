import { describe, expect, it } from "vitest";
import { MATH3D_PLATFORM_DISCOVERY, MODULE_SCIENTIFIC_OPERATIONS, SCIENTIFIC_MODULES,
  SCIENTIFIC_CAPABILITY_REGISTRY, validateDiscoveryJsonValue, runScientificWorkflow } from "@math3d/core";
import { SCIENTIFIC_OPERATION_BINDINGS } from "./scientificOperationBindings";

const cases: readonly [string, object, object][] = [
  ["graph2d.roots.quadratic", { a: 1, b: 0, c: -1 }, { roots: [-1, 1], discriminant: 4 }],
  ["graph3d.gradient.quadratic", { coefficients: [1, 2, 3, 4, 5, 6, 7], point: [2, 3, 4] },
    { gradient: [8, 17, 30] }],
  ["curve.arc-length.polyline", { points: [[0, 0, 0], [3, 4, 0]] },
    { length: 5, segmentCount: 1 }],
  ["geometry.distance.euclidean", { first: [0, 0, 0], second: [0, 3, 4] }, { distance: 5 }],
  ["volume.interpolate.trilinear", { dimensions: [2, 2, 2], values: [0, 1, 2, 3, 4, 5, 6, 7],
    point: [0.5, 0.5, 0.5] }, { value: 3.5 }],
  ["topology.euler.triangle-mesh", { vertexCount: 4,
    faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] },
  { vertices: 4, edges: 6, faces: 4, eulerCharacteristic: 2 }],
  ["cas.differentiate.polynomial", { coefficients: [1, 2, 3] }, { coefficients: [2, 6] }],
  ["number-theory.modular-inverse.compute", { value: 3, modulus: 11 }, { gcd: 1, inverse: 4 }],
  ["complex.zeros.quadratic", { a: 1, b: 0, c: 1 },
    { zeros: [{ re: 0, im: -1 }, { re: 0, im: 1 }] }],
  ["field.divergence.affine", { matrixRowMajor: [1, 0, 0, 0, 2, 0, 0, 0, 3] },
    { divergence: 6 }],
  ["quantum.probability-density.samples", { amplitudes: [[1, 0], [0, 1]], spacing: 1 },
    { density: [0.5, 0.5], normBeforeNormalization: 2 }],
];

describe("scientific module operation coverage", () => {
  it("has a bounded complete operation for every catalogued capability in all 13 modules", () => {
    expect(MODULE_SCIENTIFIC_OPERATIONS).toHaveLength(73);
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.capabilities.filter(item =>
      item.status === "catalogued")).toHaveLength(0);
    const modules = new Set(MATH3D_PLATFORM_DISCOVERY.list("scientific-operations")
      .filter(item => item.kind === "scientific-operations" &&
        item.schemaCompleteness === "complete" && item.id in SCIENTIFIC_OPERATION_BINDINGS)
      .map(item => item.kind === "scientific-operations" ? item.module : ""));
    expect([...modules].sort()).toEqual([...SCIENTIFIC_MODULES].sort());
    expect(MATH3D_PLATFORM_DISCOVERY.list("scientific-operations").filter(item =>
      item.kind === "scientific-operations" && item.schemaCompleteness === "complete")).toHaveLength(77);
  });

  it.each(cases)("executes %s and matches its result contract", async (id, input, expected) => {
    const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", id);
    expect(descriptor?.kind).toBe("scientific-operations");
    if (descriptor?.kind !== "scientific-operations") return;
    expect(validateDiscoveryJsonValue(descriptor.inputSchema, input)).toBe(true);
    const result = await runScientificWorkflow({ steps: [
      { id: "sample", operationId: id, input, parameters: {} }],
    host: { environment: "browser", implementations: [descriptor.implementationId] },
    bindings: SCIENTIFIC_OPERATION_BINDINGS });
    expect(result.steps[0].output).toEqual(expected);
    expect(validateDiscoveryJsonValue(descriptor.outputSchema, result.steps[0].output)).toBe(true);
  });

  it("provides valid runnable starter inputs for every generated module node", async () => {
    for (const operation of MODULE_SCIENTIFIC_OPERATIONS) {
      const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", operation.id);
      if (descriptor?.kind !== "scientific-operations") throw new Error(operation.id);
      expect(validateDiscoveryJsonValue(descriptor.inputSchema, descriptor.inputSchema.example)).toBe(true);
      const run = await runScientificWorkflow({ steps: [{ id: "starter", operationId: operation.id,
        input: descriptor.inputSchema.example, parameters: {} }],
      host: { environment: "server", implementations: [descriptor.implementationId] },
      bindings: SCIENTIFIC_OPERATION_BINDINGS });
      expect(validateDiscoveryJsonValue(descriptor.outputSchema, run.steps[0].output)).toBe(true);
    }
  });

  it("satisfies independent mathematical invariants", async () => {
    const execute = (id: string, input: object) =>
      SCIENTIFIC_OPERATION_BINDINGS[id].execute(input, {}) as Record<string, unknown>;
    const roots = (await execute("graph2d.roots.quadratic", { a: 2, b: -3, c: -2 })).roots as number[];
    expect(roots.map(x => 2 * x * x - 3 * x - 2)).toEqual([0, 0]);
    const zeros = (await execute("complex.zeros.quadratic", { a: 1, b: 0, c: 4 })).zeros as
      { re: number; im: number }[];
    expect(zeros.map(z => z.re * z.re - z.im * z.im + 4)).toEqual([0, 0]);
    const inverse = (await execute("number-theory.modular-inverse.compute",
      { value: 17, modulus: 101 })).inverse as number;
    expect((17 * inverse) % 101).toBe(1);
    const density = (await execute("quantum.probability-density.samples", {
      amplitudes: [[1, 1], [2, 0]], spacing: 0.25 })).density as number[];
    expect(density.reduce((sum, value) => sum + value, 0) * 0.25).toBeCloseTo(1, 12);
  });

  it("rejects invalid mathematical domains", async () => {
    const run = (id: string, input: object) => runScientificWorkflow({
      steps: [{ id: "invalid", operationId: id, input, parameters: {} }],
      host: { environment: "server", implementations: [SCIENTIFIC_OPERATION_BINDINGS[id].implementationId] },
      bindings: SCIENTIFIC_OPERATION_BINDINGS,
    });
    await expect(run("number-theory.modular-inverse.compute", { value: 6, modulus: 9 }))
      .resolves.toMatchObject({ steps: [{ output: { gcd: 3, inverse: null } }] });
    await expect(run("topology.euler.triangle-mesh", { vertexCount: 3, faces: [[0, 1, 3]] }))
      .rejects.toThrow(/Face indices/);
    await expect(run("topology.euler.triangle-mesh", { vertexCount: 3,
      faces: [[0, 1, 2], [2, 1, 0]] })).rejects.toThrow(/Duplicate triangle/);
    await expect(run("volume.interpolate.trilinear", { dimensions: [2, 2, 2],
      values: [1, 2], point: [0, 0, 0] })).rejects.toThrow(/input contract|Grid size/);
    await expect(run("quantum.probability-density.samples", { amplitudes: [[0, 0]], spacing: 1 }))
      .rejects.toThrow(/zero norm/);
  });
});
