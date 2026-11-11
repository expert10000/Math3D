import { describe, expect, it } from "vitest";
import { createGraph2DWorkspaceProject, createMath3DProject, getGraph2DPresetCatalog, instantiateGraph2DPreset } from "@math3d/core";
import { snapshotFromRendererProbe } from "../kernel/rendererPlatformCapabilities";
import { inspectProjectCompatibility } from "../projects/projectTransfer";
import { projectImportControls } from "./ProjectCompatibilityPanel";

const host = (storage: boolean) => snapshotFromRendererProbe({ desktopBridge: false, hostFileSystem: false,
  nativeDialog: false, webgl2: true, backgroundWorker: true, persistentStorage: storage, network: false, touchInput: false });
const preview = (preset: string) => inspectProjectCompatibility(createMath3DProject(createGraph2DWorkspaceProject(
  instantiateGraph2DPreset(getGraph2DPresetCatalog().get(preset)!, "import-controls").document), { stableKey: preset }));

describe("Project import controls", () => {
  it("permits a verified preview but refuses save and open without persistent storage", () => {
    const controls = projectImportControls(preview("parabola-tangent"), host(false), true, false);
    expect(controls).toMatchObject({ canSave: false, canOpen: false, reason: expect.stringMatching(/storage/) });
  });

  it("lets a missing-source Project be kept in the library as a preview without enabling full open", () => {
    const controls = projectImportControls(preview("piecewise-data-gaps"), host(true), true, false);
    expect(controls.canSave).toBe(true);
    expect(controls.canOpen).toBe(false);
    expect(controls.reason).toMatch(/sidecars/);
  });

  it("keeps host restore and busy state as independent refusal reasons", () => {
    const compatible = preview("parabola-tangent");
    expect(projectImportControls(compatible, host(true), false, false)).toMatchObject({ canSave: true, canOpen: false });
    expect(projectImportControls(compatible, host(true), true, true)).toMatchObject({ canSave: false, canOpen: false });
  });
});
