import { describe, expect, it } from "vitest";
import { createPlatformDiscovery, MATH3D_PLATFORM_DISCOVERY, MATH3D_WORKER_OPERATION_REGISTRY,
  PLATFORM_REGISTRY_KINDS,
  type ScientificOperationDescriptor } from "@math3d/core";
import { discoverApiScientificOperations, listApiScientificOperationDescriptors } from
  "../../packages/api-client/src/scientificOperations";

describe("Math3D platform discovery", () => {
  it("exposes each registry through one interface with resolved links", () => {
    for (const kind of PLATFORM_REGISTRY_KINDS)
      expect(MATH3D_PLATFORM_DISCOVERY.list(kind).length).toBeGreaterThan(0);
    const operation = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", "surface.curvature.compute") as ScientificOperationDescriptor;
    expect(operation).toMatchObject({ module: "surface", schemaCompleteness: "complete",
      cancellable: true, cacheable: true, deterministic: true,
      requiredCapabilities: ["surface.curvature.gaussian", "surface.curvature.mean", "surface.curvature.principal"] });
    expect(MATH3D_PLATFORM_DISCOVERY.related("scientific-operations", operation.id, "visualizations")
      .map(view => view.id)).toEqual(["view.scalarField", "view.histogram"]);
    expect(MATH3D_PLATFORM_DISCOVERY.related("scientific-operations", operation.id, "journeys")
      .map(journey => journey.id)).toEqual(["journey.catenoid.study"]);
  });

  it("keeps unverified worker schemas partial and promotes verified Mesh normals", () => {
    const discovered = MATH3D_PLATFORM_DISCOVERY.list("scientific-operations");
    for (const worker of MATH3D_WORKER_OPERATION_REGISTRY)
      expect(discovered.find(entry => entry.id === worker.id))
        .toMatchObject({ schemaCompleteness: worker.id === "mesh.normals.compute" ? "complete" : "partial",
          implementationId: `worker:${worker.id}` });
  });

  it("does not advertise an API operation without a verified server binding", () => {
    expect(listApiScientificOperationDescriptors().some(item => item.id === "surface.curvature.compute"))
      .toBe(true);
    expect(discoverApiScientificOperations()).toEqual([]);
    expect(discoverApiScientificOperations(["math3d.surface.curvature-field"])).toEqual([]);
    const serverWorker = MATH3D_WORKER_OPERATION_REGISTRY.find(item => item.environments.includes("server"))!;
    expect(discoverApiScientificOperations([`worker:${serverWorker.id}`])).toEqual([]);
  });

  it("checks runtime availability and does not generate forms from incomplete schemas", () => {
    expect(MATH3D_PLATFORM_DISCOVERY.executableOperation("surface.curvature.compute", "desktop",
      id => id === "math3d.surface.curvature-field")?.id).toBe("surface.curvature.compute");
    expect(MATH3D_PLATFORM_DISCOVERY.executableOperation("surface.curvature.compute", "mobile", () => true)).toBeNull();
    expect(MATH3D_PLATFORM_DISCOVERY.executableOperation("surface.curvature.compute", "desktop", () => false)).toBeNull();
    expect(MATH3D_PLATFORM_DISCOVERY.generatableOperations("desktop", () => true).map(item => item.id))
      .toEqual(["surface.curvature.compute", "surface.curvature.analytic-reference",
        "mesh.normals.compute"]);
  });

  it("rejects dangling cross references and duplicate identifiers", () => {
    const view = MATH3D_PLATFORM_DISCOVERY.get("visualizations", "view.scalarField")!;
    expect(() => createPlatformDiscovery([view, view])).toThrow(/duplicate/);
    expect(() => createPlatformDiscovery([{ ...view, references: { journeys: ["missing"] } }]))
      .toThrow(/Unresolved/);
  });
});
