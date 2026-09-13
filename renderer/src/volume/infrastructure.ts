import type { VectorGrid, VolumeDataset, VolumeGrid } from "../scene/datasets";
import type {
  SerializedVolumeObject,
  VolumeDependency,
  VolumeDerivedResult,
  VolumeDerivedResultKind,
  VolumeDirectionMatrix,
  VolumeObject,
  VolumeRepresentation,
  VolumeSource,
  VolumeSpatialMetadata,
  VolumeStorageRef,
} from "./contracts";
import type { ManagedVolumeArray } from "./typedArrayStore";
import { VolumeTypedArrayStore } from "./typedArrayStore";

export type VolumeRevisionTrackerEntry = {
  definitionFingerprint: string;
  sampledGridFingerprint: string;
  volumeRevision: number;
  definitionRevision: number;
  sampledGridRevision: number;
  createdAt: number;
  updatedAt: number;
};

export type VolumeRevisionTracker = Map<string, VolumeRevisionTrackerEntry>;

export type VolumeAdapterOptions = {
  id: string;
  label: string;
  source: VolumeSource;
  representation: VolumeRepresentation;
  grid: VolumeGrid | VectorGrid;
  values: ManagedVolumeArray;
  components?: number;
  centering?: "point" | "cell";
  direction?: VolumeDirectionMatrix;
  coordinateSystem?: string;
  positionUnits?: string;
  valueUnits?: string;
  missingValuePolicy?: "none" | "nan" | "sentinel";
  missingValueSentinel?: number | null;
  dependencies?: readonly VolumeDependency[];
  engine?: string;
  engineVersion?: string;
  tracker: VolumeRevisionTracker;
  now?: number;
};

const IDENTITY_DIRECTION: VolumeDirectionMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
};

const fingerprint = (value: unknown): string => JSON.stringify(stableValue(value));

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const hashTypedArray = (values: ManagedVolumeArray): string => {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `${values.constructor.name}:${values.length}:${(hash >>> 0).toString(36)}`;
};

const normalizeId = (id: string): string => {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "-");
  if (!normalized) throw new Error("Volume ID is required.");
  return normalized;
};

const scalarTypeOf = (values: ManagedVolumeArray): VolumeSpatialMetadata["scalarType"] => {
  if (values instanceof Float64Array) return "float64";
  if (values instanceof Int32Array) return "int32";
  if (values instanceof Uint32Array) return "uint32";
  if (values instanceof Int16Array) return "int16";
  if (values instanceof Uint16Array) return "uint16";
  if (values instanceof Int8Array) return "int8";
  if (values instanceof Uint8Array) return "uint8";
  return "float32";
};

const finiteTuple = (values: readonly number[], label: string): void => {
  if (!values.every(Number.isFinite)) throw new Error(`Volume ${label} must contain finite values.`);
};

export const resolveVolumeRevision = (
  tracker: VolumeRevisionTracker,
  volumeId: string,
  definitionFingerprint: string,
  sampledGridFingerprint: string,
  now = Date.now()
): VolumeRevisionTrackerEntry => {
  const previous = tracker.get(volumeId);
  if (!previous) {
    const initial = {
      definitionFingerprint,
      sampledGridFingerprint,
      volumeRevision: 1,
      definitionRevision: 1,
      sampledGridRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    tracker.set(volumeId, initial);
    return initial;
  }
  const definitionChanged = previous.definitionFingerprint !== definitionFingerprint;
  const sampledGridChanged = previous.sampledGridFingerprint !== sampledGridFingerprint;
  if (!definitionChanged && !sampledGridChanged) return previous;
  const next = {
    definitionFingerprint,
    sampledGridFingerprint,
    volumeRevision: previous.volumeRevision + 1,
    definitionRevision: previous.definitionRevision + (definitionChanged ? 1 : 0),
    sampledGridRevision: previous.sampledGridRevision + (sampledGridChanged ? 1 : 0),
    createdAt: previous.createdAt,
    updatedAt: now,
  };
  tracker.set(volumeId, next);
  return next;
};

export const adaptVolumeObject = (options: VolumeAdapterOptions): VolumeObject => {
  const volumeId = normalizeId(options.id);
  const label = options.label.trim() || volumeId;
  const dimensions = [...options.grid.dims] as [number, number, number];
  const origin = [...(options.grid.origin ?? [0, 0, 0])] as [number, number, number];
  const spacing = [...(options.grid.spacing ?? [1, 1, 1])] as [number, number, number];
  const direction = [...(options.direction ?? options.grid.direction ?? IDENTITY_DIRECTION)] as unknown as VolumeDirectionMatrix;
  const components = Math.max(1, Math.floor(options.components ?? (options.representation === "dense-vector-grid" ? 3 : 1)));
  finiteTuple(dimensions, "dimensions");
  finiteTuple(origin, "origin");
  finiteTuple(spacing, "spacing");
  finiteTuple(direction, "direction matrix");
  if (!dimensions.every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Volume dimensions must be positive safe integers.");
  }
  if (!spacing.every((value) => value !== 0)) throw new Error("Volume spacing must be non-zero.");
  const sampleCount = dimensions[0] * dimensions[1] * dimensions[2];
  const elementCount = sampleCount * components;
  if (options.values.length !== elementCount) {
    throw new Error(`Volume payload has ${options.values.length} elements; expected ${elementCount}.`);
  }

  const definitionFingerprint = fingerprint({
    representation: options.representation,
    source: options.source,
    dependencies: options.dependencies ?? [],
  });
  const sampledGridFingerprint = fingerprint({
    dimensions,
    origin,
    spacing,
    direction,
    centering: options.centering ?? options.grid.centering ?? "point",
    scalarType: scalarTypeOf(options.values),
    components,
    missingValuePolicy: options.missingValuePolicy ?? "none",
    missingValueSentinel: options.missingValueSentinel ?? null,
    payload: hashTypedArray(options.values),
  });
  const revision = resolveVolumeRevision(
    options.tracker,
    volumeId,
    definitionFingerprint,
    sampledGridFingerprint,
    options.now
  );
  const storage: VolumeStorageRef = {
    handle: `volume-buffer:${volumeId}@${revision.sampledGridRevision}:${hashString(sampledGridFingerprint)}`,
    byteLength: options.values.byteLength,
    elementCount: options.values.length,
    scalarType: scalarTypeOf(options.values),
    components,
    ownership: "managed-memory",
  };
  const spatial: VolumeSpatialMetadata = {
    dimensions,
    origin,
    spacing,
    direction,
    centering: options.centering ?? options.grid.centering ?? "point",
    scalarType: storage.scalarType,
    components,
    componentLayout: "interleaved",
    coordinateSystem: options.coordinateSystem?.trim() || "world-cartesian",
    positionUnits: options.positionUnits?.trim() || "unit",
    valueUnits: options.valueUnits?.trim() || "unitless",
    missingValuePolicy: options.missingValuePolicy ?? "none",
    missingValueSentinel: options.missingValueSentinel ?? null,
    sampleCount,
    elementCount,
    byteSize: options.values.byteLength,
  };
  return {
    version: 1,
    identity: {
      volumeId,
      volumeRevision: revision.volumeRevision,
      definitionRevision: revision.definitionRevision,
      sampledGridRevision: revision.sampledGridRevision,
      key: `volume:${volumeId}@${revision.volumeRevision}`,
      label,
    },
    representation: options.representation,
    source: options.source,
    spatial,
    storage,
    provenance: {
      sourceRevision: revision.definitionRevision,
      sampledGridRevision: revision.sampledGridRevision,
      dependencies: [...(options.dependencies ?? [])],
      engine: options.engine?.trim() || "Math3D Volume",
      engineVersion: options.engineVersion?.trim() || "1",
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
      definitionFingerprint,
      sampledGridFingerprint,
    },
    state: "current",
    staleReason: null,
  };
};

export const adaptAnalyticVolume = (args: Omit<VolumeAdapterOptions, "source" | "representation" | "values"> & {
  presetId: string;
  expression: string;
  parameters?: Readonly<Record<string, number>>;
  dataset: VolumeDataset;
}): VolumeObject => adaptVolumeObject({
  ...args,
  source: { kind: "analytic-preset", presetId: args.presetId, expression: args.expression, parameters: args.parameters ?? {} },
  representation: "analytic-scalar-field",
  values: args.dataset.grid.scalars,
  grid: args.dataset.grid,
});

export const adaptCustomFieldVolume = (args: Omit<VolumeAdapterOptions, "source" | "representation" | "values"> & {
  expression: string;
  parameters?: Readonly<Record<string, number>>;
  dataset: VolumeDataset;
}): VolumeObject => adaptVolumeObject({
  ...args,
  source: { kind: "custom-field", expression: args.expression, parameters: args.parameters ?? {} },
  representation: "custom-scalar-field",
  values: args.dataset.grid.scalars,
  grid: args.dataset.grid,
});

export const adaptDenseGridVolume = (args: Omit<VolumeAdapterOptions, "source" | "representation" | "values"> & {
  sourceLabel: string;
  importRef?: string | null;
  dataset: VolumeDataset;
}): VolumeObject => adaptVolumeObject({
  ...args,
  source: { kind: "dense-grid", sourceLabel: args.sourceLabel, importRef: args.importRef ?? null },
  representation: "dense-scalar-grid",
  values: args.dataset.grid.scalars,
  grid: args.dataset.grid,
});

export const adaptVectorGridVolume = (args: Omit<VolumeAdapterOptions, "source" | "representation" | "values" | "components"> & {
  presetId: string;
  grid: VectorGrid;
}): VolumeObject => adaptVolumeObject({
  ...args,
  source: { kind: "vector-preset", presetId: args.presetId, components: 3 },
  representation: "dense-vector-grid",
  values: args.grid.vectors,
  components: 3,
});

export const adaptVtkDistanceVolume = (args: Omit<VolumeAdapterOptions, "source" | "representation" | "values"> & {
  sourceObjectId: string;
  sourceObjectRevision: number;
  signed: boolean;
  dataset: VolumeDataset;
}): VolumeObject => adaptVolumeObject({
  ...args,
  source: {
    kind: "vtk-distance",
    sourceObjectId: args.sourceObjectId,
    sourceObjectRevision: args.sourceObjectRevision,
    signed: args.signed,
  },
  representation: "distance-field",
  values: args.dataset.grid.scalars,
  grid: args.dataset.grid,
  valueUnits: args.valueUnits ?? args.positionUnits ?? "unit",
  engine: args.engine ?? "VTK",
  dependencies: args.dependencies ?? [{
    module: "surfaces",
    objectId: args.sourceObjectId,
    revision: args.sourceObjectRevision,
    relation: "derived-from",
  }],
});

export const serializeVolumeObject = (volume: VolumeObject): SerializedVolumeObject => JSON.parse(JSON.stringify(volume));

export const restoreVolumeObject = (serialized: SerializedVolumeObject): VolumeObject => {
  if (serialized.version !== 1) throw new Error(`Unsupported Volume object version: ${String(serialized.version)}.`);
  const dimensions = serialized.spatial.dimensions;
  const expectedSamples = dimensions[0] * dimensions[1] * dimensions[2];
  if (serialized.spatial.sampleCount !== expectedSamples) throw new Error("Serialized Volume sample count is invalid.");
  if (!serialized.storage.handle.trim()) throw new Error("Serialized Volume storage handle is required.");
  return JSON.parse(JSON.stringify(serialized)) as VolumeObject;
};

export const hydrateVolumeRevisionTracker = (
  tracker: VolumeRevisionTracker,
  serialized: SerializedVolumeObject
): VolumeObject => {
  const volume = restoreVolumeObject(serialized);
  tracker.set(volume.identity.volumeId, {
    definitionFingerprint: volume.provenance.definitionFingerprint,
    sampledGridFingerprint: volume.provenance.sampledGridFingerprint,
    volumeRevision: volume.identity.volumeRevision,
    definitionRevision: volume.identity.definitionRevision,
    sampledGridRevision: volume.identity.sampledGridRevision,
    createdAt: volume.provenance.createdAt,
    updatedAt: volume.provenance.updatedAt,
  });
  return volume;
};

export const volumeObjectToDataset = (volume: VolumeObject, store: VolumeTypedArrayStore): VolumeDataset => {
  if (volume.spatial.components !== 1) throw new Error("A vector Volume object cannot be restored as a scalar dataset.");
  const values = store.get(volume.storage);
  if (!(values instanceof Float32Array)) throw new Error(`Volume payload ${volume.storage.handle} is unavailable or not Float32.`);
  return {
    kind: "volume",
    label: volume.identity.label,
    grid: {
      dims: [...volume.spatial.dimensions] as [number, number, number],
      origin: [...volume.spatial.origin] as [number, number, number],
      spacing: [...volume.spatial.spacing] as [number, number, number],
      direction: [...volume.spatial.direction] as [number, number, number, number, number, number, number, number, number],
      centering: volume.spatial.centering,
      scalars: values,
    },
  };
};

export const createVolumeDerivedResult = (args: {
  id: string;
  label: string;
  kind: VolumeDerivedResultKind;
  source: VolumeObject;
  parameters?: Readonly<Record<string, number | string | boolean>>;
  storage?: VolumeStorageRef | null;
  now?: number;
}): VolumeDerivedResult => {
  const now = args.now ?? Date.now();
  return {
    id: normalizeId(args.id),
    label: args.label.trim() || args.id,
    kind: args.kind,
    sourceVolumeId: args.source.identity.volumeId,
    sourceVolumeRevision: args.source.identity.volumeRevision,
    sourceSampledGridRevision: args.source.identity.sampledGridRevision,
    parameters: { ...(args.parameters ?? {}) },
    storage: args.storage ?? null,
    state: "current",
    staleReason: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const reconcileVolumeDerivedResult = (
  result: VolumeDerivedResult,
  source: VolumeObject,
  now = Date.now(),
  currentParameters?: Readonly<Record<string, number | string | boolean>>
): VolumeDerivedResult => {
  if (result.state === "detached") return result;
  const parametersChanged = currentParameters != null && fingerprint(result.parameters) !== fingerprint(currentParameters);
  if (
    result.sourceVolumeId === source.identity.volumeId &&
    result.sourceVolumeRevision === source.identity.volumeRevision &&
    result.sourceSampledGridRevision === source.identity.sampledGridRevision &&
    !parametersChanged
  ) return result;
  const staleReason = parametersChanged
    ? "Derived-result parameters changed."
    : result.sourceVolumeId !== source.identity.volumeId
    ? `Source Volume changed from ${result.sourceVolumeId} to ${source.identity.volumeId}.`
    : `Source Volume advanced from revision ${result.sourceVolumeRevision} to ${source.identity.volumeRevision}.`;
  return { ...result, state: "stale", staleReason, updatedAt: now };
};

export const detachVolumeDerivedResult = (result: VolumeDerivedResult, now = Date.now()): VolumeDerivedResult => ({
  ...result,
  state: "detached",
  staleReason: null,
  updatedAt: now,
});

export const deleteVolumeDerivedResult = (
  results: readonly VolumeDerivedResult[],
  id: string,
  store?: VolumeTypedArrayStore
): VolumeDerivedResult[] => {
  const target = results.find((result) => result.id === id);
  if (target?.storage && store) store.release(target.storage.handle);
  return results.filter((result) => result.id !== id);
};

export const describeVolumeSource = (source: VolumeSource): string => {
  if (source.kind === "analytic-preset") return `Analytic preset · ${source.presetId}`;
  if (source.kind === "custom-field") return "Custom analytic field";
  if (source.kind === "dense-grid") return source.importRef ? `Imported grid · ${source.importRef}` : source.sourceLabel;
  if (source.kind === "vector-preset") return `Vector preset · ${source.presetId}`;
  return `${source.signed ? "Signed" : "Unsigned"} VTK distance field`;
};

export const describeVolumeDefinition = (source: VolumeSource): string => {
  if (source.kind === "analytic-preset" || source.kind === "custom-field") return source.expression;
  if (source.kind === "vtk-distance") return `distance(${source.sourceObjectId}@${source.sourceObjectRevision})`;
  if (source.kind === "vector-preset") return source.presetId;
  return source.importRef ?? source.sourceLabel;
};
