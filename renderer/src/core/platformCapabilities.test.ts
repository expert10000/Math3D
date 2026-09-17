import { describe, expect, it } from "vitest";
import { createPlatformCapabilitySnapshot, PLATFORM_FACILITIES, PlatformCapabilityError,
  requirePlatformFacilities, snapshotFromWorkerProbe,
  type PlatformCapabilitySnapshot, type PlatformFacility, type PlatformRuntimeId } from "@math3d/core";
import { snapshotFromRendererProbe } from "../kernel/rendererPlatformCapabilities";

const fixture = (runtime: PlatformRuntimeId, enabled: readonly PlatformFacility[]): PlatformCapabilitySnapshot =>
  createPlatformCapabilitySnapshot({ runtime, adapterId: `fixture.${runtime}`, adapterVersion: "1.0.0",
    facilities: Object.fromEntries(PLATFORM_FACILITIES.map((facility) => [facility,
      enabled.includes(facility) ? { available: true, reason: null } : { available: false, reason: `${facility} unavailable in fixture` }])) as PlatformCapabilitySnapshot["facilities"] });

describe("GK19 platform capability snapshots", () => {
  it("declares browser, desktop, mobile, worker, and remote fixture limitations without inferred privileges", () => {
    const matrix = [
      fixture("browser", ["dom", "webgl2", "backgroundWorker", "persistentStorage", "network"]),
      fixture("desktop", ["dom", "webgl2", "backgroundWorker", "persistentStorage", "hostFileSystem", "nativeDialog", "network"]),
      fixture("mobile", ["persistentStorage", "network", "touchInput"]),
      fixture("worker", ["network"]),
      fixture("remote-fixture", ["network"]),
    ];
    expect(matrix.map((entry) => entry.runtime)).toEqual(["browser", "desktop", "mobile", "worker", "remote-fixture"]);
    for (const snapshot of matrix) {
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.facilities)).toBe(true);
      expect(Object.isFrozen(snapshot.facilities.dom)).toBe(true);
      expect(Object.keys(snapshot.facilities).sort()).toEqual([...PLATFORM_FACILITIES].sort());
      if (snapshot.runtime !== "desktop") expect(snapshot.facilities.nativeDialog.available).toBe(false);
    }
    expect(() => requirePlatformFacilities(matrix[2]!, ["nativeDialog"])).toThrow(PlatformCapabilityError);
    expect(() => requirePlatformFacilities(matrix[1]!, ["hostFileSystem", "network"])).not.toThrow();
  });

  it("rejects missing reasons or fields and isolates the immutable snapshot from host mutations", () => {
    const desktop = snapshotFromRendererProbe({ desktopBridge: true, hostFileSystem: true, nativeDialog: true,
      webgl2: true, backgroundWorker: true, persistentStorage: true, network: true, touchInput: false });
    const browser = snapshotFromRendererProbe({ desktopBridge: false, hostFileSystem: true, nativeDialog: true,
      webgl2: false, backgroundWorker: true, persistentStorage: true, network: true, touchInput: false });
    expect(desktop.runtime).toBe("desktop");
    expect(browser.runtime).toBe("browser");
    expect(browser.facilities.hostFileSystem.available).toBe(false);
    expect(browser.facilities.nativeDialog.available).toBe(false);
    const worker = snapshotFromWorkerProbe({ network: true, persistentStorage: false });
    expect(worker.runtime).toBe("worker");
    expect(worker.facilities.network.available).toBe(true);
    expect(worker.facilities.dom.available).toBe(false);
    const { schemaVersion: _schemaVersion, ...input } = desktop;
    expect(() => createPlatformCapabilitySnapshot({ ...input, facilities: { ...desktop.facilities,
      touchInput: { available: false, reason: null } } })).toThrow(/touchInput/);
  });
});
