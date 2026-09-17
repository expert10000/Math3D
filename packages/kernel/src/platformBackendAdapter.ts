import { PlatformCapabilityError, requirePlatformFacilities,
  type PlatformCapabilitySnapshot, type PlatformFacility } from "@math3d/core";
import type { ScientificExecutionBackend } from "./scientificExecutionBroker";

/** Keep host requirements at the F08 adapter edge, before routing/transport. */
export const guardScientificBackendForPlatform = (backend: ScientificExecutionBackend,
  snapshot: PlatformCapabilitySnapshot, required: readonly PlatformFacility[]): ScientificExecutionBackend => {
  const unavailable = () => {
    try { requirePlatformFacilities(snapshot, required); return null; }
    catch (error) { if (error instanceof PlatformCapabilityError) return error; throw error; }
  };
  return {
    ...backend,
    discover: async () => {
      const error = unavailable();
      return error ? { available: false, operations: [], unavailableReason: error.message } : backend.discover();
    },
    execute: (request) => {
      requirePlatformFacilities(snapshot, required);
      return backend.execute(request);
    },
    ...(backend.cancel ? { cancel: (jobId: string) => backend.cancel!(jobId) } : {}),
  };
};
