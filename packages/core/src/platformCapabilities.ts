import { immutableCanonicalJsonClone } from "./commands";

export const PLATFORM_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLATFORM_RUNTIME_IDS = ["browser", "desktop", "mobile", "worker", "remote-fixture"] as const;
export const PLATFORM_FACILITIES = ["dom", "webgl2", "backgroundWorker", "persistentStorage", "hostFileSystem",
  "nativeDialog", "network", "touchInput"] as const;
export type PlatformRuntimeId = typeof PLATFORM_RUNTIME_IDS[number];
export type PlatformFacility = typeof PLATFORM_FACILITIES[number];
export type PlatformFacilityStatus = Readonly<{ available: boolean; reason: string | null }>;
export type PlatformCapabilitySnapshot = Readonly<{
  schemaVersion: typeof PLATFORM_CAPABILITY_SCHEMA_VERSION;
  runtime: PlatformRuntimeId;
  adapterId: string;
  adapterVersion: string;
  facilities: Readonly<Record<PlatformFacility, PlatformFacilityStatus>>;
}>;
export type PlatformCapabilityInput = Omit<PlatformCapabilitySnapshot, "schemaVersion">;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const bounded = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

/** Host adapters supply probes; the shared contract never guesses from a runtime name. */
export const createPlatformCapabilitySnapshot = (input: PlatformCapabilityInput): PlatformCapabilitySnapshot => {
  if (!record(input) || !sameKeys(input, ["runtime", "adapterId", "adapterVersion", "facilities"])
    || !PLATFORM_RUNTIME_IDS.includes(input.runtime) || !bounded(input.adapterId) || !bounded(input.adapterVersion)
    || !record(input.facilities) || !sameKeys(input.facilities, PLATFORM_FACILITIES))
    throw new TypeError("Platform capability snapshot fields are invalid.");
  for (const facility of PLATFORM_FACILITIES) {
    const status = input.facilities[facility];
    if (!record(status) || !sameKeys(status, ["available", "reason"]) || typeof status.available !== "boolean"
      || (status.available ? status.reason !== null : !bounded(status.reason)))
      throw new TypeError(`Platform facility '${facility}' requires explicit availability and reason.`);
  }
  return immutableCanonicalJsonClone({ schemaVersion: PLATFORM_CAPABILITY_SCHEMA_VERSION, ...input }) as PlatformCapabilitySnapshot;
};

export const platformFacilityAvailable = (snapshot: PlatformCapabilitySnapshot, facility: PlatformFacility): boolean =>
  snapshot.facilities[facility].available;

export class PlatformCapabilityError extends Error {
  readonly unavailable: readonly PlatformFacility[];
  constructor(snapshot: PlatformCapabilitySnapshot, unavailable: readonly PlatformFacility[]) {
    super(`Platform '${snapshot.runtime}' lacks ${unavailable.join(", ")}: ${unavailable.map((facility) => snapshot.facilities[facility].reason).join("; ")}`);
    this.name = "PlatformCapabilityError";
    this.unavailable = Object.freeze([...unavailable]);
  }
}

/** Call before starting a job or opening a host transport. */
export const requirePlatformFacilities = (snapshot: PlatformCapabilitySnapshot, facilities: readonly PlatformFacility[]): void => {
  const unavailable = [...new Set(facilities)].filter((facility) => !platformFacilityAvailable(snapshot, facility));
  if (unavailable.length) throw new PlatformCapabilityError(snapshot, unavailable);
};
