export type VolumeRepresentation =
  | "analytic-scalar-field"
  | "custom-scalar-field"
  | "dense-scalar-grid"
  | "dense-vector-grid"
  | "distance-field"
  | "binary-mask"
  | "label-map";

export type VolumeScalarType = "float32" | "float64" | "int32" | "uint32" | "int16" | "uint16" | "int8" | "uint8";
export type VolumeCentering = "point" | "cell";
export type VolumeMissingValuePolicy = "none" | "nan" | "sentinel";
export type VolumeLifecycleState = "current" | "stale" | "snapshot" | "detached";

export type VolumeSdfOperation =
  | "distance"
  | "occupancy"
  | "union"
  | "intersection"
  | "subtraction"
  | "offset"
  | "shell"
  | "smooth-union"
  | "reinitialize";

export type VolumeSdfSourceDescriptor = {
  module: "surfaces" | "mesh" | "geometry" | "volume";
  objectId: string;
  revision: number;
  label: string;
  transform: readonly number[];
  positionUnits: string;
};

export type VolumeSdfSignDiagnostics = {
  reliable: boolean;
  confidence: "high" | "low" | "unavailable";
  watertight: boolean;
  orientation: "outward" | "inward" | "degenerate" | "unknown";
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  signedVolume: number | null;
  message: string;
};

export type VolumeSdfMetadata = {
  output: "occupancy" | "unsigned-distance" | "signed-distance";
  operation: VolumeSdfOperation;
  parameters: Readonly<Record<string, number>>;
  sources: readonly VolumeSdfSourceDescriptor[];
  sign: VolumeSdfSignDiagnostics;
  sampling: {
    dimensions: readonly [number, number, number];
    origin: readonly [number, number, number];
    spacing: readonly [number, number, number];
    centering: VolumeCentering;
  };
  backend: string;
  backendVersion: string;
  warnings: readonly string[];
  createdAt: number;
};

export type VolumeDirectionMatrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export type VolumeSpatialMetadata = {
  dimensions: readonly [number, number, number];
  origin: readonly [number, number, number];
  spacing: readonly [number, number, number];
  direction: VolumeDirectionMatrix;
  centering: VolumeCentering;
  scalarType: VolumeScalarType;
  components: number;
  componentLayout: "interleaved";
  coordinateSystem: string;
  positionUnits: string;
  valueUnits: string;
  missingValuePolicy: VolumeMissingValuePolicy;
  missingValueSentinel: number | null;
  sampleCount: number;
  elementCount: number;
  byteSize: number;
};

export type VolumeStorageRef = {
  handle: string;
  byteLength: number;
  elementCount: number;
  scalarType: VolumeScalarType;
  components: number;
  ownership: "managed-memory";
};

export type VolumeDependency = {
  module: "volume" | "surfaces" | "mesh" | "geometry" | "external";
  objectId: string;
  revision: number;
  relation: "source" | "sampled-from" | "derived-from" | "vector-overlay" | "imported-from";
};

export type VolumeSource =
  | {
      kind: "analytic-preset";
      presetId: string;
      expression: string;
      parameters: Readonly<Record<string, number>>;
    }
  | {
      kind: "custom-field";
      expression: string;
      parameters: Readonly<Record<string, number>>;
    }
  | {
      kind: "dense-grid";
      sourceLabel: string;
      importRef: string | null;
    }
  | {
      kind: "vector-preset";
      presetId: string;
      components: 3;
    }
  | {
      kind: "vtk-distance";
      sourceObjectId: string;
      sourceObjectRevision: number;
      signed: boolean;
    }
  | {
      kind: "sdf-operation";
      operation: VolumeSdfOperation;
      sourceObjectIds: readonly string[];
      sourceObjectRevisions: readonly number[];
      parameters: Readonly<Record<string, number>>;
    }
  | {
      kind: "segmentation";
      operation: string;
      sourceObjectId: string;
      sourceObjectRevision: number;
      parameters: Readonly<Record<string, number | string | boolean>>;
    };

export type VolumeProvenance = {
  sourceRevision: number;
  sampledGridRevision: number;
  dependencies: readonly VolumeDependency[];
  engine: string;
  engineVersion: string;
  createdAt: number;
  updatedAt: number;
  definitionFingerprint: string;
  sampledGridFingerprint: string;
};

export type VolumeIdentity = {
  volumeId: string;
  volumeRevision: number;
  definitionRevision: number;
  sampledGridRevision: number;
  key: string;
  label: string;
};

export type VolumeObject = {
  version: 1;
  identity: VolumeIdentity;
  representation: VolumeRepresentation;
  source: VolumeSource;
  spatial: VolumeSpatialMetadata;
  storage: VolumeStorageRef;
  provenance: VolumeProvenance;
  state: VolumeLifecycleState;
  staleReason: string | null;
};

export type VolumeDerivedResultKind = "isosurface" | "slice" | "gradient" | "analysis" | "segmentation";

export type VolumeIsosurfaceMetrics = {
  vertexCount: number;
  faceCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  connectedComponents: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  surfaceArea: number;
  enclosedVolume: number | null;
  watertight: boolean;
};

export type VolumeIsosurfaceMetadata = {
  algorithm: "marching-cubes" | "surface-nets" | "dual-contouring" | "flying-edges";
  algorithmVersion: string;
  backend: "native-worker" | "vtk-worker" | "cpu-fallback";
  isoValue: number;
  inputTransform: {
    dimensions: [number, number, number];
    origin: [number, number, number];
    spacing: [number, number, number];
    direction: VolumeDirectionMatrix;
  };
  profile: {
    wallTimeMs: number;
    peakWorkingSetBytes: number;
    transferredBytes: number;
    cacheHit: boolean;
  };
  normalMethod: "gradient-derived" | "face-average-fallback";
  warnings: readonly string[];
  correspondence: {
    kind: "volume-grid";
    id: string;
    sourceSampledGridRevision: number;
  };
  metrics: VolumeIsosurfaceMetrics;
};

export type VolumeDerivedResult = {
  id: string;
  label: string;
  kind: VolumeDerivedResultKind;
  sourceVolumeId: string;
  sourceVolumeRevision: number;
  sourceSampledGridRevision: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
  storage: VolumeStorageRef | null;
  isosurface: VolumeIsosurfaceMetadata | null;
  state: VolumeLifecycleState;
  staleReason: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SerializedVolumeObject = Omit<VolumeObject, "source" | "spatial" | "provenance"> & {
  source: VolumeSource;
  spatial: VolumeSpatialMetadata;
  provenance: VolumeProvenance;
};
