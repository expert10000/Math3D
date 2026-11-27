import { describe, expect, it } from "vitest";
import { bindScientificOperation, createScientificCapabilityRegistry,
  SCIENTIFIC_CAPABILITY_REGISTRY, SCIENTIFIC_MODULES } from "@math3d/core";

describe("scientific capability registry", () => {
  it("catalogues every scientific module without advertising roadmap entries as executable", () => {
    for (const module of SCIENTIFIC_MODULES)
      expect(SCIENTIFIC_CAPABILITY_REGISTRY.forModule(module).length).toBeGreaterThan(0);
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.getCapability("topology.persistent-homology"))
      .toMatchObject({ status: "catalogued", execution: null, methods: [] });
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.runnableFor("topology", "desktop", () => true)).toEqual([]);
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.runnableFor("surface", "desktop", () => false)).toEqual([]);
  });

  it("describes the registered Gaussian curvature operation and checks host availability", () => {
    const capability = SCIENTIFIC_CAPABILITY_REGISTRY.getCapability("surface.curvature.gaussian");
    expect(capability).toMatchObject({ version: "1.0.0", module: "surface",
      status: "operation-registered", inputs: [{ name: "surfaceSamples", type: "SurfaceCurvatureSamples" }],
      outputs: [{ name: "gaussianCurvature", type: "ScalarField", units: "length^-2" },
        { name: "statistics", type: "StatisticalSummary" }],
      methods: ["numerical"], execution: { deterministic: true, cancellable: true, supportsProgress: true } });
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.runnableFor("surface", "desktop",
      id => id === "math3d.surface.curvature-field").map(item => item.id))
      .toEqual(["surface.curvature.gaussian", "surface.curvature.mean", "surface.curvature.principal"]);
    expect(SCIENTIFIC_CAPABILITY_REGISTRY.runnableFor("surface", "mobile", () => true)).toEqual([]);
    expect(bindScientificOperation(SCIENTIFIC_CAPABILITY_REGISTRY, "surface.curvature.compute",
      "math3d.surface.curvature-field", (value: number) => value + 1).execute(2)).toBe(3);
    expect(() => bindScientificOperation(SCIENTIFIC_CAPABILITY_REGISTRY, "surface.curvature.compute",
      "unrelated.implementation", (value: number) => value)).toThrow();
  });

  it("rejects duplicate capability IDs and operations without a declared capability", () => {
    const capability = SCIENTIFIC_CAPABILITY_REGISTRY.getCapability("surface.curvature.gaussian")!;
    const operation = SCIENTIFIC_CAPABILITY_REGISTRY.getOperation("surface.curvature.compute")!;
    expect(() => createScientificCapabilityRegistry([capability, capability], [operation])).toThrow(/duplicate/);
    expect(() => createScientificCapabilityRegistry([capability], [{ ...operation, capabilityIds: ["missing"] }]))
      .toThrow(/Invalid/);
    expect(() => createScientificCapabilityRegistry([capability], [])).toThrow(/no operation/);
  });
});
