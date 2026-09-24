import type { MobileMeshPayload, MobileRenderQuality } from "../viewer/mobileSurfacePreview";

export type MobileMeshAdmissionAction = "full" | "reduced" | "remote-simplify" | "reject";

export type MobileMeshAdmission = {
  action: MobileMeshAdmissionAction;
  sourceTriangles: number;
  sourceVertices: number;
  estimatedBytes: number;
  targetTriangles: number;
  reason: string;
};

type AdmissionLimits = {
  fullTriangles: number;
  reducedTriangles: number;
  localTriangleCeiling: number;
  fullBytes: number;
  localByteCeiling: number;
};

const MIB = 1024 * 1024;

const LIMITS: Record<Exclude<MobileRenderQuality, "auto">, AdmissionLimits> = {
  performance: {
    fullTriangles: 24_000,
    reducedTriangles: 18_000,
    localTriangleCeiling: 120_000,
    fullBytes: 24 * MIB,
    localByteCeiling: 56 * MIB,
  },
  balanced: {
    fullTriangles: 48_000,
    reducedTriangles: 32_000,
    localTriangleCeiling: 240_000,
    fullBytes: 40 * MIB,
    localByteCeiling: 80 * MIB,
  },
  quality: {
    fullTriangles: 96_000,
    reducedTriangles: 64_000,
    localTriangleCeiling: 420_000,
    fullBytes: 64 * MIB,
    localByteCeiling: 128 * MIB,
  },
};

const HARD_TRIANGLE_CEILING = 2_000_000;
const HARD_BYTE_CEILING = 256 * MIB;

const limitsFor = (quality: MobileRenderQuality): AdmissionLimits =>
  LIMITS[quality === "auto" ? "balanced" : quality];

export const estimateMobileMeshBytes = (mesh: MobileMeshPayload): number =>
  mesh.positions.byteLength + mesh.indices.byteLength + (mesh.normals?.byteLength ?? 0);

const payloadProblem = (mesh: MobileMeshPayload): string | null => {
  if (mesh.positions.length === 0 || mesh.positions.length % 3 !== 0) return "Mesh positions are missing or malformed.";
  if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) return "Mesh triangle indices are missing or malformed.";
  if (mesh.normals && mesh.normals.length !== mesh.positions.length) return "Mesh normals do not match its positions.";
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.indices.length; index += 1) {
    const vertexIndex = mesh.indices[index];
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) {
      return "Mesh contains an out-of-range vertex index.";
    }
  }
  return null;
};

export const decideMobileMeshAdmission = (
  mesh: MobileMeshPayload,
  quality: MobileRenderQuality,
  remoteSimplificationAvailable: boolean
): MobileMeshAdmission => {
  const sourceTriangles = Math.floor(mesh.indices.length / 3);
  const sourceVertices = Math.floor(mesh.positions.length / 3);
  const estimatedBytes = estimateMobileMeshBytes(mesh);
  const limits = limitsFor(quality);
  const problem = payloadProblem(mesh);

  if (problem) {
    return { action: "reject", sourceTriangles, sourceVertices, estimatedBytes, targetTriangles: 0, reason: problem };
  }
  if (sourceTriangles > HARD_TRIANGLE_CEILING || estimatedBytes > HARD_BYTE_CEILING) {
    return {
      action: "reject",
      sourceTriangles,
      sourceVertices,
      estimatedBytes,
      targetTriangles: 0,
      reason: "Mesh exceeds the mobile hard limit and was rejected before GPU upload.",
    };
  }
  if (sourceTriangles <= limits.fullTriangles && estimatedBytes <= limits.fullBytes) {
    return {
      action: "full",
      sourceTriangles,
      sourceVertices,
      estimatedBytes,
      targetTriangles: sourceTriangles,
      reason: "Mesh fits the current mobile render budget.",
    };
  }
  if (sourceTriangles <= limits.localTriangleCeiling && estimatedBytes <= limits.localByteCeiling) {
    return {
      action: "reduced",
      sourceTriangles,
      sourceVertices,
      estimatedBytes,
      targetTriangles: Math.min(sourceTriangles, limits.reducedTriangles),
      reason: "A compact local preview was created before GPU upload.",
    };
  }
  if (remoteSimplificationAvailable) {
    return {
      action: "remote-simplify",
      sourceTriangles,
      sourceVertices,
      estimatedBytes,
      targetTriangles: limits.reducedTriangles,
      reason: "The worker is creating a smaller preview for this device.",
    };
  }
  return {
    action: "reject",
    sourceTriangles,
    sourceVertices,
    estimatedBytes,
    targetTriangles: 0,
    reason: "Mesh is too large for local reduction and no remote simplification path is available.",
  };
};

export const createReducedMobileMeshPreview = (
  mesh: MobileMeshPayload,
  targetTriangles: number
): MobileMeshPayload => {
  const sourceTriangles = Math.floor(mesh.indices.length / 3);
  const safeTarget = Math.max(1, Math.min(sourceTriangles, Math.floor(targetTriangles)));
  if (safeTarget >= sourceTriangles) return mesh;

  const selectedIndices = new Array<number>(safeTarget * 3);
  for (let triangle = 0; triangle < safeTarget; triangle += 1) {
    const sourceTriangle = Math.min(sourceTriangles - 1, Math.floor((triangle * sourceTriangles) / safeTarget));
    const sourceOffset = sourceTriangle * 3;
    const targetOffset = triangle * 3;
    selectedIndices[targetOffset] = mesh.indices[sourceOffset];
    selectedIndices[targetOffset + 1] = mesh.indices[sourceOffset + 1];
    selectedIndices[targetOffset + 2] = mesh.indices[sourceOffset + 2];
  }

  const vertexMap = new Map<number, number>();
  const usedVertices: number[] = [];
  const remapped = new Uint32Array(selectedIndices.length);
  for (let index = 0; index < selectedIndices.length; index += 1) {
    const sourceVertex = selectedIndices[index];
    let targetVertex = vertexMap.get(sourceVertex);
    if (targetVertex == null) {
      targetVertex = usedVertices.length;
      vertexMap.set(sourceVertex, targetVertex);
      usedVertices.push(sourceVertex);
    }
    remapped[index] = targetVertex;
  }

  const positions = new Float32Array(usedVertices.length * 3);
  const normals = mesh.normals ? new Float32Array(usedVertices.length * 3) : undefined;
  for (let index = 0; index < usedVertices.length; index += 1) {
    const sourceOffset = usedVertices[index] * 3;
    const targetOffset = index * 3;
    positions[targetOffset] = mesh.positions[sourceOffset];
    positions[targetOffset + 1] = mesh.positions[sourceOffset + 1];
    positions[targetOffset + 2] = mesh.positions[sourceOffset + 2];
    if (normals && mesh.normals) {
      normals[targetOffset] = mesh.normals[sourceOffset];
      normals[targetOffset + 1] = mesh.normals[sourceOffset + 1];
      normals[targetOffset + 2] = mesh.normals[sourceOffset + 2];
    }
  }

  const indices = usedVertices.length <= 65_535 ? new Uint16Array(remapped) : remapped;
  return {
    positions,
    indices,
    normals,
    vertexCount: usedVertices.length,
    triCount: safeTarget,
  };
};

export const admitMobileMeshForRendering = (
  mesh: MobileMeshPayload,
  quality: MobileRenderQuality,
  remoteSimplificationAvailable: boolean
): { admission: MobileMeshAdmission; mesh?: MobileMeshPayload } => {
  const admission = decideMobileMeshAdmission(mesh, quality, remoteSimplificationAvailable);
  if (admission.action === "full") return { admission, mesh };
  if (admission.action === "reduced") {
    return { admission, mesh: createReducedMobileMeshPreview(mesh, admission.targetTriangles) };
  }
  return { admission };
};
