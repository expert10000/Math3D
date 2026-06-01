import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type GeometryElementKind = "object" | "face" | "edge" | "vertex";
export type MeshElementKind = "object" | "face" | "edge" | "vertex";

export type GeometryElementRef = {
  geometryId: string;
  kind: GeometryElementKind;
  index?: number;
};

export type MeshElementRef = {
  meshId: string;
  kind: MeshElementKind;
  index?: number;
};

export type GeometryMeshTraceProvenanceEntry = {
  id: string;
  operation: string;
  timestamp: number;
  params?: Record<string, unknown>;
  version: number;
};

export type GeometryMeshOriginExplanation = {
  mesh: MeshElementRef;
  geometrySources: GeometryElementRef[];
  provenance: GeometryMeshTraceProvenanceEntry[];
};

export type GeometryMeshTraceMapSnapshot = {
  version: 1;
  geometryToMesh: Record<string, string[]>;
  meshToGeometry: Record<string, string[]>;
  provenanceByMesh: Record<string, GeometryMeshTraceProvenanceEntry[]>;
};

const TRACE_KEY_DELIM = "|";

const buildGeometryKey = (ref: GeometryElementRef): string => {
  const index = Number.isInteger(ref.index) && Number(ref.index) >= 0 ? String(ref.index) : "";
  return [ref.geometryId.trim(), ref.kind, index].join(TRACE_KEY_DELIM);
};

const buildMeshKey = (ref: MeshElementRef): string => {
  const index = Number.isInteger(ref.index) && Number(ref.index) >= 0 ? String(ref.index) : "";
  return [ref.meshId.trim(), ref.kind, index].join(TRACE_KEY_DELIM);
};

const parseGeometryKey = (key: string): GeometryElementRef | null => {
  const parts = key.split(TRACE_KEY_DELIM);
  if (parts.length !== 3) return null;
  const geometryId = parts[0]?.trim() ?? "";
  const kind = parts[1] as GeometryElementKind;
  const indexRaw = parts[2] ?? "";
  if (!geometryId || !["object", "face", "edge", "vertex"].includes(kind)) return null;
  if (!indexRaw) return { geometryId, kind };
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;
  return { geometryId, kind, index };
};

const parseMeshKey = (key: string): MeshElementRef | null => {
  const parts = key.split(TRACE_KEY_DELIM);
  if (parts.length !== 3) return null;
  const meshId = parts[0]?.trim() ?? "";
  const kind = parts[1] as MeshElementKind;
  const indexRaw = parts[2] ?? "";
  if (!meshId || !["object", "face", "edge", "vertex"].includes(kind)) return null;
  if (!indexRaw) return { meshId, kind };
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;
  return { meshId, kind, index };
};

const nextTraceId = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `trace-${counter}`;
  };
})();

const normalizeProvenance = (
  input: Partial<GeometryMeshTraceProvenanceEntry> | undefined,
  fallbackOperation: string
): GeometryMeshTraceProvenanceEntry => {
  const operation = String(input?.operation ?? fallbackOperation).trim() || fallbackOperation;
  const timestamp = Number.isFinite(input?.timestamp) ? Number(input?.timestamp) : Date.now();
  const version = Number.isInteger(input?.version) && Number(input?.version) > 0 ? Number(input?.version) : 1;
  const id = String(input?.id ?? "").trim() || nextTraceId();
  const params = input?.params && typeof input.params === "object" ? { ...input.params } : undefined;
  return { id, operation, timestamp, params, version };
};

export class GeometryMeshTraceMap {
  private geometryToMesh = new Map<string, Set<string>>();

  private meshToGeometry = new Map<string, Set<string>>();

  private provenanceByMesh = new Map<string, GeometryMeshTraceProvenanceEntry[]>();

  private linkKeys(geometryKey: string, meshKey: string) {
    const meshTargets = this.geometryToMesh.get(geometryKey) ?? new Set<string>();
    meshTargets.add(meshKey);
    this.geometryToMesh.set(geometryKey, meshTargets);

    const geometryTargets = this.meshToGeometry.get(meshKey) ?? new Set<string>();
    geometryTargets.add(geometryKey);
    this.meshToGeometry.set(meshKey, geometryTargets);
  }

  link(args: {
    geometry: GeometryElementRef;
    mesh: MeshElementRef;
    provenance?: Partial<GeometryMeshTraceProvenanceEntry>;
  }) {
    const geometryKey = buildGeometryKey(args.geometry);
    const meshKey = buildMeshKey(args.mesh);
    this.linkKeys(geometryKey, meshKey);

    if (args.provenance) {
      const provenanceEntry = normalizeProvenance(args.provenance, "trace-link");
      const existing = this.provenanceByMesh.get(meshKey) ?? [];
      this.provenanceByMesh.set(
        meshKey,
        [provenanceEntry, ...existing].slice(0, 128)
      );
    }
  }

  registerElementMapping(args: {
    geometryId: string;
    meshId: string;
    elementKind: "face" | "edge" | "vertex";
    meshElementIndex: number;
    geometryElementIndices: number[];
    provenance?: Partial<GeometryMeshTraceProvenanceEntry>;
  }) {
    const meshElementIndex = Number(args.meshElementIndex);
    if (!Number.isInteger(meshElementIndex) || meshElementIndex < 0) return;
    const sourceIndices = [...new Set(args.geometryElementIndices)]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((a, b) => a - b);
    if (!sourceIndices.length) return;

    for (const geometryIndex of sourceIndices) {
      this.link({
        geometry: { geometryId: args.geometryId, kind: args.elementKind, index: geometryIndex },
        mesh: { meshId: args.meshId, kind: args.elementKind, index: meshElementIndex },
        provenance: args.provenance,
      });
    }
  }

  getMeshFromGeometry(ref: GeometryElementRef): MeshElementRef[] {
    const key = buildGeometryKey(ref);
    const targets = this.geometryToMesh.get(key);
    if (!targets) return [];
    const out: MeshElementRef[] = [];
    for (const meshKey of targets) {
      const parsed = parseMeshKey(meshKey);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  getGeometryFromMesh(ref: MeshElementRef): GeometryElementRef[] {
    const key = buildMeshKey(ref);
    const targets = this.meshToGeometry.get(key);
    if (!targets) return [];
    const out: GeometryElementRef[] = [];
    for (const geometryKey of targets) {
      const parsed = parseGeometryKey(geometryKey);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  explainMeshOrigin(ref: MeshElementRef): GeometryMeshOriginExplanation {
    const meshKey = buildMeshKey(ref);
    const geometrySources = this.getGeometryFromMesh(ref);
    const provenance = [...(this.provenanceByMesh.get(meshKey) ?? [])].sort((a, b) => b.timestamp - a.timestamp);
    return {
      mesh: { ...ref },
      geometrySources,
      provenance,
    };
  }

  toSnapshot(): GeometryMeshTraceMapSnapshot {
    const geometryToMesh: Record<string, string[]> = {};
    for (const [key, targets] of this.geometryToMesh.entries()) {
      geometryToMesh[key] = [...targets].sort();
    }

    const meshToGeometry: Record<string, string[]> = {};
    for (const [key, targets] of this.meshToGeometry.entries()) {
      meshToGeometry[key] = [...targets].sort();
    }

    const provenanceByMesh: Record<string, GeometryMeshTraceProvenanceEntry[]> = {};
    for (const [key, entries] of this.provenanceByMesh.entries()) {
      provenanceByMesh[key] = entries.map((entry) => ({
        id: entry.id,
        operation: entry.operation,
        timestamp: entry.timestamp,
        params: entry.params ? { ...entry.params } : undefined,
        version: entry.version,
      }));
    }

    return {
      version: 1,
      geometryToMesh,
      meshToGeometry,
      provenanceByMesh,
    };
  }

  static fromSnapshot(snapshot: GeometryMeshTraceMapSnapshot | null | undefined): GeometryMeshTraceMap {
    const map = new GeometryMeshTraceMap();
    if (!snapshot || snapshot.version !== 1) return map;

    for (const [geometryKey, meshKeys] of Object.entries(snapshot.geometryToMesh ?? {})) {
      for (const meshKey of meshKeys ?? []) {
        map.linkKeys(geometryKey, meshKey);
      }
    }

    for (const [meshKey, entries] of Object.entries(snapshot.provenanceByMesh ?? {})) {
      const normalized = (entries ?? []).map((entry) => normalizeProvenance(entry, "trace-link"));
      if (!normalized.length) continue;
      map.provenanceByMesh.set(meshKey, normalized);
    }

    return map;
  }

  clone(): GeometryMeshTraceMap {
    return GeometryMeshTraceMap.fromSnapshot(this.toSnapshot());
  }
}

const positionKey = (x: number, y: number, z: number, tolerance: number): string => {
  const safeTolerance = Math.max(1e-12, tolerance);
  const qx = Math.round(x / safeTolerance);
  const qy = Math.round(y / safeTolerance);
  const qz = Math.round(z / safeTolerance);
  return `${qx}:${qy}:${qz}`;
};

const faceCountFromMesh = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): number => {
  if (mesh.indices && mesh.indices.length >= 3) return Math.floor(mesh.indices.length / 3);
  return Math.floor(mesh.positions.length / 9);
};

const enumerateTriangles = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triCount = faceCountFromMesh(mesh);
  for (let face = 0; face < triCount; face += 1) {
    const base = face * 3;
    const a = mesh.indices ? Number(mesh.indices[base] ?? -1) : base;
    const b = mesh.indices ? Number(mesh.indices[base + 1] ?? -1) : base + 1;
    const c = mesh.indices ? Number(mesh.indices[base + 2] ?? -1) : base + 2;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !Number.isInteger(c) ||
      a < 0 ||
      b < 0 ||
      c < 0 ||
      a >= vertexCount ||
      b >= vertexCount ||
      c >= vertexCount
    ) {
      continue;
    }
    out.push([a, b, c]);
  }
  return out;
};

const edgeKey = (a: number, b: number): string => {
  if (a < b) return `${a}|${b}`;
  return `${b}|${a}`;
};

const edgesFromTriangles = (triangles: Array<[number, number, number]>): number[][] => {
  const unique = new Set<string>();
  const out: number[][] = [];
  for (const [a, b, c] of triangles) {
    const keys = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
    for (const key of keys) {
      if (unique.has(key)) continue;
      unique.add(key);
      const [left, right] = key.split("|");
      out.push([Number(left), Number(right)]);
    }
  }
  return out;
};

export type PromotionElementMappings = {
  vertexMap: number[][];
  faceMap: number[][];
  edgeMap: number[][];
};

export type MeshMutationTraceStrategy = "topology-index-exact" | "topology-signature-heuristic";

export const inferPromotionElementMappings = (args: {
  sourceMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  promotedMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  tolerance?: number;
}): PromotionElementMappings => {
  const tolerance = Math.max(1e-9, Number(args.tolerance ?? 1e-6));
  const sourceVertexCount = Math.floor(args.sourceMesh.positions.length / 3);
  const promotedVertexCount = Math.floor(args.promotedMesh.positions.length / 3);

  const sourceVertexByPos = new Map<string, number[]>();
  for (let i = 0; i < sourceVertexCount; i += 1) {
    const base = i * 3;
    const x = Number(args.sourceMesh.positions[base] ?? Number.NaN);
    const y = Number(args.sourceMesh.positions[base + 1] ?? Number.NaN);
    const z = Number(args.sourceMesh.positions[base + 2] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const key = positionKey(x, y, z, tolerance);
    const bucket = sourceVertexByPos.get(key) ?? [];
    bucket.push(i);
    sourceVertexByPos.set(key, bucket);
  }

  const vertexMap: number[][] = [];
  for (let i = 0; i < promotedVertexCount; i += 1) {
    const base = i * 3;
    const x = Number(args.promotedMesh.positions[base] ?? Number.NaN);
    const y = Number(args.promotedMesh.positions[base + 1] ?? Number.NaN);
    const z = Number(args.promotedMesh.positions[base + 2] ?? Number.NaN);
    const key = positionKey(x, y, z, tolerance);
    const mapped = (sourceVertexByPos.get(key) ?? []).slice().sort((a, b) => a - b);
    if (!mapped.length && i < sourceVertexCount) mapped.push(i);
    vertexMap.push(mapped);
  }

  const sourceTriangles = enumerateTriangles(args.sourceMesh);
  const promotedTriangles = enumerateTriangles(args.promotedMesh);
  const sourceFaceBySignature = new Map<string, number[]>();
  for (let faceIndex = 0; faceIndex < sourceTriangles.length; faceIndex += 1) {
    const tri = sourceTriangles[faceIndex];
    const signature = [...tri].sort((a, b) => a - b).join("|");
    const bucket = sourceFaceBySignature.get(signature) ?? [];
    bucket.push(faceIndex);
    sourceFaceBySignature.set(signature, bucket);
  }

  const faceMap: number[][] = [];
  for (let faceIndex = 0; faceIndex < promotedTriangles.length; faceIndex += 1) {
    const [a, b, c] = promotedTriangles[faceIndex];
    const mappedVertices = [
      vertexMap[a]?.[0],
      vertexMap[b]?.[0],
      vertexMap[c]?.[0],
    ].filter((value): value is number => Number.isInteger(value) && Number(value) >= 0);
    if (mappedVertices.length === 3) {
      const signature = [...mappedVertices].sort((l, r) => l - r).join("|");
      const candidates = sourceFaceBySignature.get(signature) ?? [];
      if (candidates.length) {
        faceMap.push([...new Set(candidates)].sort((l, r) => l - r));
        continue;
      }
    }
    if (faceIndex < sourceTriangles.length) {
      faceMap.push([faceIndex]);
    } else {
      faceMap.push([]);
    }
  }

  const sourceEdges = edgesFromTriangles(sourceTriangles);
  const promotedEdges = edgesFromTriangles(promotedTriangles);
  const sourceEdgeBySignature = new Map<string, number[]>();
  for (let i = 0; i < sourceEdges.length; i += 1) {
    const [a, b] = sourceEdges[i];
    const signature = edgeKey(a, b);
    const bucket = sourceEdgeBySignature.get(signature) ?? [];
    bucket.push(i);
    sourceEdgeBySignature.set(signature, bucket);
  }

  const edgeMap: number[][] = [];
  for (let i = 0; i < promotedEdges.length; i += 1) {
    const [a, b] = promotedEdges[i];
    const mappedA = vertexMap[a]?.[0];
    const mappedB = vertexMap[b]?.[0];
    if (
      Number.isInteger(mappedA) &&
      Number.isInteger(mappedB) &&
      Number(mappedA) >= 0 &&
      Number(mappedB) >= 0
    ) {
      const signature = edgeKey(Number(mappedA), Number(mappedB));
      const candidates = sourceEdgeBySignature.get(signature) ?? [];
      if (candidates.length) {
        edgeMap.push([...new Set(candidates)].sort((l, r) => l - r));
        continue;
      }
    }
    if (i < sourceEdges.length) {
      edgeMap.push([i]);
    } else {
      edgeMap.push([]);
    }
  }

  return {
    vertexMap,
    faceMap,
    edgeMap,
  };
};

const areUint32ArraysEqual = (a: Uint32Array | null, b: Uint32Array | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const buildExactIndexMappings = (args: {
  sourceMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  promotedMesh: Pick<SurfaceMeshData, "positions" | "indices">;
}): PromotionElementMappings => {
  const sourceVertexCount = Math.floor(args.sourceMesh.positions.length / 3);
  const promotedVertexCount = Math.floor(args.promotedMesh.positions.length / 3);
  const vertexCount = Math.min(sourceVertexCount, promotedVertexCount);
  const vertexMap: number[][] = Array.from({ length: promotedVertexCount }, (_, idx) => (idx < vertexCount ? [idx] : []));

  const sourceFaces = enumerateTriangles(args.sourceMesh);
  const promotedFaces = enumerateTriangles(args.promotedMesh);
  const faceMap: number[][] = Array.from({ length: promotedFaces.length }, (_, idx) =>
    idx < sourceFaces.length ? [idx] : []
  );

  const sourceEdges = edgesFromTriangles(sourceFaces);
  const promotedEdges = edgesFromTriangles(promotedFaces);
  const edgeMap: number[][] = Array.from({ length: promotedEdges.length }, (_, idx) =>
    idx < sourceEdges.length ? [idx] : []
  );

  return {
    vertexMap,
    faceMap,
    edgeMap,
  };
};

const inferMutationStrategy = (args: {
  sourceMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  promotedMesh: Pick<SurfaceMeshData, "positions" | "indices">;
}): MeshMutationTraceStrategy => {
  const srcVertices = Math.floor(args.sourceMesh.positions.length / 3);
  const dstVertices = Math.floor(args.promotedMesh.positions.length / 3);
  if (srcVertices !== dstVertices) return "topology-signature-heuristic";
  const srcTriangles = faceCountFromMesh(args.sourceMesh);
  const dstTriangles = faceCountFromMesh(args.promotedMesh);
  if (srcTriangles !== dstTriangles) return "topology-signature-heuristic";
  const srcIndices = args.sourceMesh.indices ?? null;
  const dstIndices = args.promotedMesh.indices ?? null;
  if (srcIndices && dstIndices && areUint32ArraysEqual(srcIndices, dstIndices)) {
    return "topology-index-exact";
  }
  if (!srcIndices && !dstIndices) {
    return "topology-index-exact";
  }
  return "topology-signature-heuristic";
};

const dedupeGeometryRefs = (refs: GeometryElementRef[]): GeometryElementRef[] => {
  const seen = new Set<string>();
  const out: GeometryElementRef[] = [];
  for (const ref of refs) {
    const key = buildGeometryKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
};

export const buildTraceMapForPromotion = (args: {
  sourceGeometryId: string;
  meshId: string;
  sourceMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  promotedMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  sourceOperationHistory?: string[];
  promotionMode?: string;
  createdAt?: number;
}): GeometryMeshTraceMap => {
  const traceMap = new GeometryMeshTraceMap();
  const createdAt = Number.isFinite(args.createdAt) ? Number(args.createdAt) : Date.now();
  const baseProvenance: Partial<GeometryMeshTraceProvenanceEntry> = {
    operation: "geometry-to-mesh-promotion",
    timestamp: createdAt,
    version: 1,
    params: {
      sourceOperationHistory: [...(args.sourceOperationHistory ?? [])],
      promotionMode: args.promotionMode ?? "unknown",
    },
  };

  traceMap.link({
    geometry: { geometryId: args.sourceGeometryId, kind: "object" },
    mesh: { meshId: args.meshId, kind: "object" },
    provenance: baseProvenance,
  });

  const mappings = inferPromotionElementMappings({
    sourceMesh: args.sourceMesh,
    promotedMesh: args.promotedMesh,
  });

  for (let meshVertex = 0; meshVertex < mappings.vertexMap.length; meshVertex += 1) {
    traceMap.registerElementMapping({
      geometryId: args.sourceGeometryId,
      meshId: args.meshId,
      elementKind: "vertex",
      meshElementIndex: meshVertex,
      geometryElementIndices: mappings.vertexMap[meshVertex] ?? [],
      provenance: { ...baseProvenance, operation: "vertex-map" },
    });
  }

  for (let meshFace = 0; meshFace < mappings.faceMap.length; meshFace += 1) {
    traceMap.registerElementMapping({
      geometryId: args.sourceGeometryId,
      meshId: args.meshId,
      elementKind: "face",
      meshElementIndex: meshFace,
      geometryElementIndices: mappings.faceMap[meshFace] ?? [],
      provenance: { ...baseProvenance, operation: "face-map" },
    });
  }

  for (let meshEdge = 0; meshEdge < mappings.edgeMap.length; meshEdge += 1) {
    traceMap.registerElementMapping({
      geometryId: args.sourceGeometryId,
      meshId: args.meshId,
      elementKind: "edge",
      meshElementIndex: meshEdge,
      geometryElementIndices: mappings.edgeMap[meshEdge] ?? [],
      provenance: { ...baseProvenance, operation: "edge-map" },
    });
  }

  return traceMap;
};

export const propagateTraceMapThroughMeshMutation = (args: {
  previousTraceMap: GeometryMeshTraceMap;
  previousMeshId: string;
  nextMeshId: string;
  previousMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  nextMesh: Pick<SurfaceMeshData, "positions" | "indices">;
  operation: string;
  timestamp?: number;
  fallbackGeometryIds?: string[];
}): GeometryMeshTraceMap => {
  const nextTraceMap = new GeometryMeshTraceMap();
  const timestamp = Number.isFinite(args.timestamp) ? Number(args.timestamp) : Date.now();
  const strategy = inferMutationStrategy({
    sourceMesh: args.previousMesh,
    promotedMesh: args.nextMesh,
  });
  const mappings =
    strategy === "topology-index-exact"
      ? buildExactIndexMappings({
          sourceMesh: args.previousMesh,
          promotedMesh: args.nextMesh,
        })
      : inferPromotionElementMappings({
          sourceMesh: args.previousMesh,
          promotedMesh: args.nextMesh,
        });

  const fallbackObjectRefs = dedupeGeometryRefs([
    ...args.previousTraceMap.getGeometryFromMesh({ meshId: args.previousMeshId, kind: "object" }),
    ...((args.fallbackGeometryIds ?? []).map((geometryId) => ({ geometryId, kind: "object" as const }))),
  ]);

  const baseProvenance: Partial<GeometryMeshTraceProvenanceEntry> = {
    operation: args.operation,
    timestamp,
    version: 1,
    params: {
      strategy,
      conservativeFallback: strategy !== "topology-index-exact",
    },
  };

  for (const sourceRef of fallbackObjectRefs) {
    nextTraceMap.link({
      geometry: sourceRef,
      mesh: { meshId: args.nextMeshId, kind: "object" },
      provenance: { ...baseProvenance, operation: `${args.operation}:object` },
    });
  }

  const propagateElement = (
    elementKind: "vertex" | "face" | "edge",
    indexMap: number[][],
    fallbackRefs: GeometryElementRef[]
  ) => {
    for (let nextIndex = 0; nextIndex < indexMap.length; nextIndex += 1) {
      const sourceIndices = indexMap[nextIndex] ?? [];
      const resolvedRefs: GeometryElementRef[] = [];
      for (const sourceIndex of sourceIndices) {
        if (!Number.isInteger(sourceIndex) || sourceIndex < 0) continue;
        const refs = args.previousTraceMap.getGeometryFromMesh({
          meshId: args.previousMeshId,
          kind: elementKind,
          index: sourceIndex,
        });
        resolvedRefs.push(...refs);
      }
      const dedupedRefs = dedupeGeometryRefs(resolvedRefs);
      const refsToLink = dedupedRefs.length ? dedupedRefs : fallbackRefs;
      for (const sourceRef of refsToLink) {
        nextTraceMap.link({
          geometry: sourceRef,
          mesh: { meshId: args.nextMeshId, kind: elementKind, index: nextIndex },
          provenance: {
            ...baseProvenance,
            operation: `${args.operation}:${elementKind}`,
            params: {
              ...baseProvenance.params,
              mappedFromIndices: sourceIndices.slice(0, 32),
            },
          },
        });
      }
    }
  };

  propagateElement("vertex", mappings.vertexMap, fallbackObjectRefs);
  propagateElement("face", mappings.faceMap, fallbackObjectRefs);
  propagateElement("edge", mappings.edgeMap, fallbackObjectRefs);

  return nextTraceMap;
};

let GLOBAL_GEOMETRY_MESH_TRACE_MAP = new GeometryMeshTraceMap();

export const getGlobalGeometryMeshTraceMap = (): GeometryMeshTraceMap => GLOBAL_GEOMETRY_MESH_TRACE_MAP;

export const resetGlobalGeometryMeshTraceMap = () => {
  GLOBAL_GEOMETRY_MESH_TRACE_MAP = new GeometryMeshTraceMap();
};

export const mergeIntoGlobalGeometryMeshTraceMap = (traceMap: GeometryMeshTraceMap) => {
  const base = GLOBAL_GEOMETRY_MESH_TRACE_MAP.toSnapshot();
  const incoming = traceMap.toSnapshot();
  const merged: GeometryMeshTraceMapSnapshot = {
    version: 1,
    geometryToMesh: { ...base.geometryToMesh },
    meshToGeometry: { ...base.meshToGeometry },
    provenanceByMesh: { ...base.provenanceByMesh },
  };

  for (const [geometryKey, meshKeys] of Object.entries(incoming.geometryToMesh)) {
    const previous = merged.geometryToMesh[geometryKey] ?? [];
    merged.geometryToMesh[geometryKey] = [...new Set([...previous, ...(meshKeys ?? [])])].sort();
  }
  for (const [meshKey, geometryKeys] of Object.entries(incoming.meshToGeometry)) {
    const previous = merged.meshToGeometry[meshKey] ?? [];
    merged.meshToGeometry[meshKey] = [...new Set([...previous, ...(geometryKeys ?? [])])].sort();
  }
  for (const [meshKey, entries] of Object.entries(incoming.provenanceByMesh)) {
    const previous = merged.provenanceByMesh[meshKey] ?? [];
    const seen = new Set<string>();
    const combined = [...(entries ?? []), ...previous].filter((entry) => {
      const dedupeKey = `${entry.id}|${entry.operation}|${entry.timestamp}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
    merged.provenanceByMesh[meshKey] = combined.slice(0, 128);
  }

  GLOBAL_GEOMETRY_MESH_TRACE_MAP = GeometryMeshTraceMap.fromSnapshot(merged);
};

export const GetMeshFromGeometry = (
  traceMap: GeometryMeshTraceMap,
  ref: GeometryElementRef
): MeshElementRef[] => traceMap.getMeshFromGeometry(ref);

export const GetGeometryFromMesh = (
  traceMap: GeometryMeshTraceMap,
  ref: MeshElementRef
): GeometryElementRef[] => traceMap.getGeometryFromMesh(ref);

export const ExplainMeshOrigin = (
  traceMap: GeometryMeshTraceMap,
  ref: MeshElementRef
): GeometryMeshOriginExplanation => traceMap.explainMeshOrigin(ref);
