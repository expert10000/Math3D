import { createPlatformCapabilitySnapshot, type PlatformCapabilitySnapshot, type PlatformFacility,
  type PlatformFacilityStatus } from "@math3d/core";

export type RendererPlatformProbe = Readonly<{
  desktopBridge: boolean;
  hostFileSystem: boolean;
  nativeDialog: boolean;
  webgl2: boolean;
  backgroundWorker: boolean;
  persistentStorage: boolean;
  network: boolean;
  touchInput: boolean;
}>;
const status = (available: boolean, reason: string): PlatformFacilityStatus => ({ available, reason: available ? null : reason });
export const snapshotFromRendererProbe = (probe: RendererPlatformProbe): PlatformCapabilitySnapshot => {
  const facilities: Record<PlatformFacility, PlatformFacilityStatus> = {
    dom: status(true, "DOM is unavailable."),
    webgl2: status(probe.webgl2, "WebGL2 context is unavailable."),
    backgroundWorker: status(probe.backgroundWorker, "Web Worker is unavailable."),
    persistentStorage: status(probe.persistentStorage, "Local persistent storage is blocked or unavailable."),
    hostFileSystem: status(probe.desktopBridge && probe.hostFileSystem, "Desktop file bridge is unavailable."),
    nativeDialog: status(probe.desktopBridge && probe.nativeDialog, "Desktop native dialog bridge is unavailable."),
    network: status(probe.network, "Fetch transport is unavailable."),
    touchInput: status(probe.touchInput, "No touch input is reported by this host."),
  };
  return createPlatformCapabilitySnapshot({ runtime: probe.desktopBridge ? "desktop" : "browser", adapterId: "math3d.renderer-host",
    adapterVersion: "1.0.0", facilities });
};

/** Runtime checks live in this adapter, never in the shared kernel or feature panels. */
export const probeRendererPlatformCapabilities = (): PlatformCapabilitySnapshot => {
  if (typeof window === "undefined") throw new TypeError("Renderer platform probing requires a window.");
  let webgl2 = false;
  let persistentStorage = false;
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    webgl2 = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { /* capability stays unavailable */ }
  try { const key = "math3d.platform.probe"; window.localStorage.setItem(key, "1"); window.localStorage.removeItem(key); persistentStorage = true; }
  catch { /* capability stays unavailable */ }
  return snapshotFromRendererProbe({ desktopBridge: !!window.appRuntime,
    hostFileSystem: typeof window.meshFiles?.open === "function" && typeof window.volumeFiles?.save === "function",
    nativeDialog: typeof window.meshFiles?.open === "function",
    webgl2, backgroundWorker: typeof Worker !== "undefined", persistentStorage,
    network: typeof window.fetch === "function", touchInput: (window.navigator?.maxTouchPoints ?? 0) > 0 });
};
