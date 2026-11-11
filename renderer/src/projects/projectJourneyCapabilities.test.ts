import { describe, expect, it } from "vitest";
import { createGraph2DWorkspaceProject, createMath3DProject, getGraph2DPresetCatalog, instantiateGraph2DPreset } from "@math3d/core";
import { snapshotFromRendererProbe } from "../kernel/rendererPlatformCapabilities";
import { inspectProjectCompatibility } from "./projectTransfer";
import { resolveProjectJourneys } from "./projectJourneyCapabilities";

const host = (storage = true, webgl2 = true, network = false, worker = true) => snapshotFromRendererProbe({
  desktopBridge: false, hostFileSystem: false, nativeDialog: false, webgl2,
  backgroundWorker: worker, persistentStorage: storage, network, touchInput: false,
});

describe("Project journey decisions", () => {
  const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "journey-capability").document;
  const compatible = inspectProjectCompatibility(createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "journey-capability" }));

  it("keeps verified Graph Project opening separate from storage and WebGL guesses", () => {
    expect(resolveProjectJourneys(host(), compatible).project.mode).toBe("open");
    expect(resolveProjectJourneys(host(true, false), compatible).project.mode).toBe("open");
    expect(resolveProjectJourneys(host(false), compatible).projectSave).toMatchObject({ mode: "unavailable", reason: expect.stringMatching(/storage/) });
    expect(resolveProjectJourneys(host(false), compatible).gallery.mode).toBe("preview");
  });

  it("previews missing required sources and never infers a compute service from network alone", () => {
    const missing = inspectProjectCompatibility(createMath3DProject(createGraph2DWorkspaceProject(
      instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "journey-source").document),
      { stableKey: "journey-source" }));
    const decisions = resolveProjectJourneys(host(true, true, true), missing);
    expect(decisions.project.mode).toBe("preview");
    expect(decisions.project.reason).toMatch(/sidecars/);
    expect(decisions.compute.mode).toBe("unavailable");
    expect(resolveProjectJourneys(host(true, true, false), compatible,
      { route: "remote", verified: true, reason: null }).compute.reason).toMatch(/transport/);
    expect(resolveProjectJourneys(host(true, true, true), compatible,
      { route: "remote", verified: true, reason: null }).compute.mode).toBe("open");
  });
});
