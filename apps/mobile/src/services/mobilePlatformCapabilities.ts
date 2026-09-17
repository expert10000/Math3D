import { createPlatformCapabilitySnapshot, type PlatformCapabilitySnapshot,
  type PlatformFacility, type PlatformFacilityStatus } from "@math3d/core";
import { Paths } from "expo-file-system";

export type MobilePlatformProbe = Readonly<{ persistentStorage: boolean; network: boolean; touchInput: boolean }>;
const status = (available: boolean, reason: string): PlatformFacilityStatus => ({ available, reason: available ? null : reason });

/** Expo GL and sandboxed files are deliberately not advertised as WebGL2 or desktop host files. */
export const snapshotFromMobileProbe = (probe: MobilePlatformProbe): PlatformCapabilitySnapshot => {
  const facilities: Record<PlatformFacility, PlatformFacilityStatus> = {
    dom: status(false, "React Native has no browser DOM."),
    webgl2: status(false, "Expo GL is not the browser WebGL2 contract."),
    backgroundWorker: status(false, "Browser Web Worker is unavailable in this mobile adapter."),
    persistentStorage: status(probe.persistentStorage, "Expo sandbox storage is unavailable."),
    hostFileSystem: status(false, "Desktop host filesystem bridge is unavailable."),
    nativeDialog: status(false, "Desktop native dialog bridge is unavailable."),
    network: status(probe.network, "Mobile network transport is unavailable."),
    touchInput: status(probe.touchInput, "Touch input is unavailable."),
  };
  return createPlatformCapabilitySnapshot({ runtime: "mobile", adapterId: "math3d.expo-mobile", adapterVersion: "1.0.0", facilities });
};

export const probeMobilePlatformCapabilities = (): PlatformCapabilitySnapshot => snapshotFromMobileProbe({
  persistentStorage: !!Paths.document,
  network: typeof fetch === "function",
  touchInput: true,
});
