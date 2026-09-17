import { createPlatformCapabilitySnapshot, type PlatformCapabilitySnapshot, type PlatformFacilityStatus } from "./platformCapabilities";

export type WorkerPlatformProbe = Readonly<{ network: boolean; persistentStorage: boolean }>;
const status = (available: boolean, reason: string): PlatformFacilityStatus => ({ available, reason: available ? null : reason });

/** A worker has no DOM or host UI, even when created by the desktop renderer. */
export const snapshotFromWorkerProbe = (probe: WorkerPlatformProbe): PlatformCapabilitySnapshot =>
  createPlatformCapabilitySnapshot({ runtime: "worker", adapterId: "math3d.web-worker", adapterVersion: "1.0.0", facilities: {
    dom: status(false, "Worker has no DOM."),
    webgl2: status(false, "Worker WebGL2 is not supported by this adapter."),
    backgroundWorker: status(false, "Nested workers are not provided by this adapter."),
    persistentStorage: status(probe.persistentStorage, "Worker persistence is unavailable."),
    hostFileSystem: status(false, "Desktop file bridge is unavailable in the worker."),
    nativeDialog: status(false, "Native dialogs are unavailable in the worker."),
    network: status(probe.network, "Fetch transport is unavailable in the worker."),
    touchInput: status(false, "Worker has no touch input."),
  } });

export const probeWorkerPlatformCapabilities = (): PlatformCapabilitySnapshot =>
  snapshotFromWorkerProbe({ network: typeof fetch === "function", persistentStorage: false });
