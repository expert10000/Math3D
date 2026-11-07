import { KERNEL_WORKSPACE_MODULES, type KernelWorkspaceModule } from "./mixedWorkspace";
import { PLATFORM_FACILITIES, PLATFORM_CAPABILITY_SCHEMA_VERSION,
  type PlatformCapabilitySnapshot, type PlatformFacility } from "./platformCapabilities";
import { getMath3DWorkerOperation, type Math3DWorkerOperationId } from "./workerOperationRegistry";
import { isScientificSourceGeneration, matchesScientificSourceGeneration,
  type ScientificSourceGeneration } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const CROSS_MODULE_ADAPTER_SCHEMA_VERSION = 1 as const;
export type AdapterSelectionKind = "point" | "entity" | "region" | "path";
export type AdapterFrame = Readonly<{
  kind: "cartesian" | "parameter" | "reciprocal" | "index";
  frameId: string;
  axes: readonly Readonly<{ name: string; dimension: string; unit: string }>[];
}>;
/** This is a qualification description, not a persisted selection or an executable transform. */
export type CrossModuleAdapter = Readonly<{
  schemaVersion: typeof CROSS_MODULE_ADAPTER_SCHEMA_VERSION;
  id: string;
  sourceModule: KernelWorkspaceModule;
  targetModule: KernelWorkspaceModule;
  selectionKind: AdapterSelectionKind;
  sourceFrame: AdapterFrame;
  targetFrame: AdapterFrame;
  mapping: Readonly<{ id: string; version: number; accuracy: "exact" | "interpolated" | "approximate" }>;
  requiredFacilities: readonly PlatformFacility[];
  workerOperationId: Math3DWorkerOperationId | null;
}>;
export type AdapterSelectionReference = Readonly<{
  source: ScientificSourceGeneration;
  sourceModule: KernelWorkspaceModule;
  resourceSha256: string | null;
  kind: AdapterSelectionKind;
  frame: AdapterFrame;
}>;
export type AdapterDisabledCode = "unknown-adapter" | "invalid-selection" | "wrong-kind" | "wrong-module" |
  "source-unavailable" | "stale-source" | "source-frame-mismatch" | "target-frame-mismatch" |
  "facility-unavailable" | "resource-unavailable" | "operation-unavailable" | "mapping-unavailable";
export type AdapterQualification = Readonly<{
  enabled: boolean;
  adapterId: string;
  mapping: CrossModuleAdapter["mapping"] | null;
  disabled: readonly Readonly<{ code: AdapterDisabledCode; reason: string }>[];
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const token = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 160 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const kinds: readonly AdapterSelectionKind[] = ["point", "entity", "region", "path"];
const frames = ["cartesian", "parameter", "reciprocal", "index"];
const accuracies = ["exact", "interpolated", "approximate"];

export const normalizeAdapterFrame = (value: unknown): ValidationResult<AdapterFrame> => {
  if (!record(value) || !exact(value, ["kind", "frameId", "axes"]) ||
      !frames.includes(String(value.kind)) || !token(value.frameId) ||
      !Array.isArray(value.axes) || value.axes.length < 1 || value.axes.length > 4 ||
      value.axes.some(axis => !record(axis) || !exact(axis, ["name", "dimension", "unit"]) ||
        !token(axis.name) || !token(axis.dimension) || !token(axis.unit)) ||
      new Set(value.axes.map(axis => axis.name)).size !== value.axes.length)
    return { ok: false, errors: ["Invalid adapter frame, axes, dimensions, or units."] };
  return { ok: true, value: value as AdapterFrame };
};

export const normalizeCrossModuleAdapter = (value: unknown): ValidationResult<CrossModuleAdapter> => {
  if (!record(value) || !exact(value, ["schemaVersion", "id", "sourceModule", "targetModule",
      "selectionKind", "sourceFrame", "targetFrame", "mapping", "requiredFacilities", "workerOperationId"]) ||
      value.schemaVersion !== CROSS_MODULE_ADAPTER_SCHEMA_VERSION || !token(value.id) ||
      !KERNEL_WORKSPACE_MODULES.includes(value.sourceModule as KernelWorkspaceModule) ||
      !KERNEL_WORKSPACE_MODULES.includes(value.targetModule as KernelWorkspaceModule) ||
      value.sourceModule === value.targetModule || !kinds.includes(value.selectionKind as AdapterSelectionKind) ||
      !normalizeAdapterFrame(value.sourceFrame).ok || !normalizeAdapterFrame(value.targetFrame).ok ||
      !record(value.mapping) || !exact(value.mapping, ["id", "version", "accuracy"]) ||
      !token(value.mapping.id) || !Number.isSafeInteger(value.mapping.version) || Number(value.mapping.version) < 1 ||
      !accuracies.includes(String(value.mapping.accuracy)) ||
      !Array.isArray(value.requiredFacilities) || value.requiredFacilities.length > PLATFORM_FACILITIES.length ||
      value.requiredFacilities.some(facility => !PLATFORM_FACILITIES.includes(facility)) ||
      new Set(value.requiredFacilities).size !== value.requiredFacilities.length ||
      value.workerOperationId !== null &&
        (typeof value.workerOperationId !== "string" || !getMath3DWorkerOperation(value.workerOperationId as Math3DWorkerOperationId)))
    return { ok: false, errors: ["Invalid cross-module adapter definition."] };
  return { ok: true, value: structuredClone(value) as CrossModuleAdapter };
};

export const createCrossModuleAdapterRegistry = (values: readonly unknown[]) => {
  if (!Array.isArray(values) || values.length > 128) throw new TypeError("Invalid adapter registry size.");
  const entries = new Map<string, CrossModuleAdapter>();
  for (const value of values) {
    const result = normalizeCrossModuleAdapter(value);
    if (!result.ok) throw new TypeError(result.errors.join(" "));
    if (entries.has(result.value.id)) throw new TypeError(`Duplicate adapter ID: ${result.value.id}`);
    entries.set(result.value.id, result.value);
  }
  return Object.freeze({
    list: (): readonly CrossModuleAdapter[] => [...entries.values()].map(value => structuredClone(value)),
    get: (id: string): CrossModuleAdapter | null => {
      const value = entries.get(id);
      return value ? structuredClone(value) : null;
    },
  });
};
export type CrossModuleAdapterRegistry = ReturnType<typeof createCrossModuleAdapterRegistry>;

const sameFrame = (left: AdapterFrame, right: AdapterFrame): boolean =>
  left.kind === right.kind && left.frameId === right.frameId &&
  left.axes.length === right.axes.length && left.axes.every((axis, index) => {
    const other = right.axes[index];
    return axis.name === other?.name && axis.dimension === other.dimension && axis.unit === other.unit;
  });

/** A host may show a local selection even when this qualification refuses propagation. */
export const qualifyCrossModuleAdapter = (registry: CrossModuleAdapterRegistry, input: {
  adapterId: string;
  selection: AdapterSelectionReference;
  targetModule: KernelWorkspaceModule;
  currentSource: ScientificSourceGeneration | null;
  targetFrame: AdapterFrame;
  platform: PlatformCapabilitySnapshot;
  resourceAvailable?: (sha256: string) => boolean;
  operationAvailable?: (id: Math3DWorkerOperationId) => boolean;
  mappingAvailable?: (id: string, version: number) => boolean;
}): AdapterQualification => {
  const adapter = registry.get(input.adapterId);
  const disabled: { code: AdapterDisabledCode; reason: string }[] = [];
  if (!adapter) disabled.push({ code: "unknown-adapter", reason: `Adapter '${input.adapterId}' is not registered.` });
  if (!record(input.selection) || !isScientificSourceGeneration(input.selection.source) ||
      !KERNEL_WORKSPACE_MODULES.includes(input.selection.sourceModule) ||
      !kinds.includes(input.selection.kind) || !normalizeAdapterFrame(input.selection.frame).ok ||
      !(input.selection.resourceSha256 === null || sha256(input.selection.resourceSha256)))
    disabled.push({ code: "invalid-selection", reason: "Selection reference is invalid." });
  if (adapter && !disabled.some(item => item.code === "invalid-selection")) {
    if (adapter.sourceModule !== input.selection.sourceModule || adapter.targetModule !== input.targetModule)
      disabled.push({ code: "wrong-module", reason: "Selection or target module does not match the adapter." });
    if (adapter.selectionKind !== input.selection.kind)
      disabled.push({ code: "wrong-kind", reason: `Adapter requires a ${adapter.selectionKind} selection.` });
    if (!sameFrame(adapter.sourceFrame, input.selection.frame))
      disabled.push({ code: "source-frame-mismatch", reason: "Selection frame, dimension, or units do not match the adapter source." });
    if (!normalizeAdapterFrame(input.targetFrame).ok || !sameFrame(adapter.targetFrame, input.targetFrame))
      disabled.push({ code: "target-frame-mismatch", reason: "Target frame, dimension, or units do not match the adapter target." });
    if (!input.currentSource) disabled.push({ code: "source-unavailable", reason: "Current source generation is unavailable." });
    else if (!isScientificSourceGeneration(input.currentSource) ||
      !matchesScientificSourceGeneration(input.selection.source, input.currentSource))
      disabled.push({ code: "stale-source", reason: "Selection does not match the current source generation." });
    if (input.selection.resourceSha256 && !input.resourceAvailable?.(input.selection.resourceSha256))
      disabled.push({ code: "resource-unavailable", reason: "Pinned source resource is unavailable or unverified." });
    for (const facility of adapter.requiredFacilities) {
      const status = input.platform?.schemaVersion === PLATFORM_CAPABILITY_SCHEMA_VERSION ?
        input.platform.facilities?.[facility] : null;
      if (!status?.available) disabled.push({ code: "facility-unavailable",
        reason: `Facility '${facility}' is unavailable: ${status?.reason ?? "no verified host probe"}.` });
    }
    if (adapter.workerOperationId && !input.operationAvailable?.(adapter.workerOperationId))
      disabled.push({ code: "operation-unavailable", reason: `Operation '${adapter.workerOperationId}' is unavailable on this host.` });
    if (!input.mappingAvailable?.(adapter.mapping.id, adapter.mapping.version))
      disabled.push({ code: "mapping-unavailable", reason: `Mapping '${adapter.mapping.id}' v${adapter.mapping.version} is not implemented on this host.` });
  }
  return { enabled: disabled.length === 0, adapterId: input.adapterId,
    mapping: adapter?.mapping ?? null, disabled };
};
