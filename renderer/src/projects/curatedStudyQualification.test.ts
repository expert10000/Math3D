import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate } from "@math3d/core";
import { snapshotFromRendererProbe } from "../kernel/rendererPlatformCapabilities";
import { curatedStudy } from "./curatedStudyCatalog";
import { measureCuratedStudyAssets, qualifyCuratedStudy } from "./curatedStudyQualification";

const host = (desktopBridge: boolean, persistentStorage = true, webgl2 = true, mobileViewport = false) =>
  snapshotFromRendererProbe({ desktopBridge, hostFileSystem: desktopBridge, nativeDialog: desktopBridge,
    webgl2, backgroundWorker: true, persistentStorage, network: false, touchInput: mobileViewport,
    mobileViewport });

describe("active-host Gallery qualification", () => {
  it("uses probed storage, rendering and scene chooser capabilities for explicit limits", () => {
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(true)).mode).toBe("open");
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(false, false)).reason)
      .toMatch(/storage/);
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(false, true, false)).mode)
      .toBe("preview");
    expect(qualifyCuratedStudy(curatedStudy("edge-path-evidence")!, host(false)).reason)
      .toMatch(/desktop/);
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(false, true, true, true)).mode)
      .toBe("preview");
    expect(qualifyCuratedStudy(curatedStudy("quantum-qwz")!, host(true), { quantumChooser: false }).mode)
      .toBe("unavailable");
    expect(qualifyCuratedStudy(curatedStudy("quantum-qwz")!, host(true), { quantumChooser: true }).mode)
      .toBe("open");
    expect(qualifyCuratedStudy(curatedStudy("cas-structures")!, host(false), { casAvailable: true }).mode)
      .toBe("open");
  });

  it("quotes only measured Project and resource bytes", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "gallery-measure");
    const measured = measureCuratedStudyAssets(project);
    expect(measured.projectBytes).toBeGreaterThan(0);
    expect(measured.resourceBytes).toBe(0);
    expect(measured.totalBytes).toBe(measured.projectBytes);
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(true)).measuredBytes).toBeNull();
    expect(qualifyCuratedStudy(curatedStudy("catenary-study")!, host(true),
      { measuredBytes: measured.totalBytes, source: "prepared-copy" }).measuredBytes).toBe(measured.totalBytes);
  });
});
