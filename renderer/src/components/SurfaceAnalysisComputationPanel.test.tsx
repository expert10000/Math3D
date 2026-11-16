import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { adaptSurfaceDefinition } from "../surfaceAnalysis/infrastructure";
import { SurfaceAnalysisComputationPanel } from "./SurfaceAnalysisWorkspacePanels";

const definition = adaptSurfaceDefinition({ id: "catenoid", revision: 4, label: "Catenoid", representation: "parametric",
  expressions: { x: "cos(u)", y: "sin(u)", z: "v" }, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } } });

const baseProps = {
  definition, selected: "differential-geometry" as const, onSelect: vi.fn(), configurationOpen: false,
  onOpenConfiguration: vi.fn(), derivedMesh: { available: true, label: "Catenoid mesh", vertexCount: 10, faceCount: 8 },
  onOpenDerivedMesh: vi.fn(),
};

describe("Surface representation header", () => {
  it("distinguishes the current source from an unregistered live tessellation", () => {
    const html = renderToStaticMarkup(<SurfaceAnalysisComputationPanel {...baseProps} />);
    expect(html).toContain("Catenoid · parametric · revision 4");
    expect(html).toContain("Live tessellation available · no registered mesh revision");
  });

  it("shows a selected derived mesh and its original source revision", () => {
    const callback = vi.fn();
    const html = renderToStaticMarkup(<SurfaceAnalysisComputationPanel {...baseProps} derivedMeshLifecycle={{
      selected: { id: "mesh-1", label: "Catenoid baked", state: "frozen-snapshot", sourceRevision: 3, meshRevision: 2,
        method: "parametric-sampling", backend: "native", backendVersion: null, variant: "native-tessellation",
        correspondence: "index/current", mappedVertexCount: 10, watertight: null, boundaryEdgeCount: null, historyCount: 1 },
      records: [{ id: "mesh-1", label: "Catenoid baked", state: "frozen-snapshot" }], status: "Ready",
      backendAvailability: "ready", backendAvailabilityMessage: "Ready", onSelect: callback, onRegenerate: callback,
      onShowLive: callback, onBake: callback, onDetach: callback, onDelete: callback, onOpenSource: callback,
      onInspect: callback, onMapSourceToMesh: callback, onMapMeshToSource: callback, onRemesh: callback, onRobustMesh: callback,
    }} />);
    expect(html).toContain("Catenoid · parametric · revision 4");
    expect(html).toContain("Catenoid baked · frozen-snapshot · mesh revision 2 · source revision 3");
  });
});
