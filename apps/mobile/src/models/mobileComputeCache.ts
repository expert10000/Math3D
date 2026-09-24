import type { WorkerEngineIdentity } from "@math3d/core";

export const MOBILE_COMPUTE_CACHE_SCHEMA_VERSION = 2;

export type MobileComputeCacheIdentity = {
  operation: "vtk.preview-implicit";
  inputHash: string;
  sceneId: string;
  sceneSchemaVersion: number;
  engine: WorkerEngineIdentity;
};

export type MobileComputeCacheProvenance = MobileComputeCacheIdentity & {
  computedAt: number;
  resolution: number;
  serverVersion?: string;
};

export type MobileComputeCacheLookup = Omit<MobileComputeCacheIdentity, "engine"> & {
  engine?: WorkerEngineIdentity;
};

const encodePart = (value: string | number): string => encodeURIComponent(String(value));

export const createMobileComputeCacheKey = (identity: MobileComputeCacheIdentity): string =>
  [
    MOBILE_COMPUTE_CACHE_SCHEMA_VERSION,
    identity.operation,
    identity.sceneSchemaVersion,
    identity.sceneId,
    identity.inputHash,
    identity.engine.id,
    identity.engine.version,
  ].map(encodePart).join("|");

export const mobileComputeCacheMatchesLookup = (
  provenance: MobileComputeCacheProvenance,
  lookup: MobileComputeCacheLookup
): boolean =>
  provenance.operation === lookup.operation &&
  provenance.inputHash === lookup.inputHash &&
  provenance.sceneId === lookup.sceneId &&
  provenance.sceneSchemaVersion === lookup.sceneSchemaVersion;

export const isMobileComputeCacheStale = (
  provenance: MobileComputeCacheProvenance,
  expectedEngine?: WorkerEngineIdentity
): boolean => Boolean(expectedEngine) && (
  provenance.engine.id !== expectedEngine?.id || provenance.engine.version !== expectedEngine?.version
);
