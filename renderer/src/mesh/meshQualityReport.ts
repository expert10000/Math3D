import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshQualityPoint3 = { x: number; y: number; z: number };

export type MeshQualityNumericSummary = {
  min: number | null;
  avg: number | null;
  max: number | null;
};

export type MeshQualityFaceDefect = {
  faceIndex: number;
  centroid: MeshQualityPoint3;
  area: number;
  aspectRatio: number;
};

export type MeshQualityEdgeDefect = {
  edgeId: string;
  a: number;
  b: number;
  pointA: MeshQualityPoint3;
  pointB: MeshQualityPoint3;
  midpoint: MeshQualityPoint3;
  length: number;
  incidentFaceCount: number;
  incidentFaces: number[];
};

export type MeshQualityReport = {
  generatedAt: string;
  vertexCount: number;
  faceCount: number;
  metrics: {
    edgeLength: MeshQualityNumericSummary;
    triangleArea: MeshQualityNumericSummary;
    aspectRatio: MeshQualityNumericSummary;
    vertexValence: MeshQualityNumericSummary;
    dihedralAngleDeg: MeshQualityNumericSummary;
  };
  topology: {
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
    degenerateFaceCount: number;
  };
  defects: {
    degenerateFaces: MeshQualityFaceDefect[];
    highAspectFaces: MeshQualityFaceDefect[];
    nonManifoldEdges: MeshQualityEdgeDefect[];
  };
};

export type MeshQualityReportOptions = {
  highAspectRatioThreshold?: number;
  maxListedDefects?: number;
};

type FaceRecord = {
  faceIndex: number;
  a: number;
  b: number;
  c: number;
  area: number;
  aspectRatio: number;
  centroid: MeshQualityPoint3;
  normal: { x: number; y: number; z: number } | null;
  degenerate: boolean;
};

type EdgeRecord = {
  a: number;
  b: number;
  pointA: MeshQualityPoint3;
  pointB: MeshQualityPoint3;
  length: number;
  incidentFaces: number[];
};

const RAD_TO_DEG = 180 / Math.PI;

const summary = (values: number[]): MeshQualityNumericSummary => {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return { min: null, avg: null, max: null };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const value of finite) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return { min, avg: sum / finite.length, max };
};

const asPoint = (positions: ArrayLike<number>, vertexIndex: number): MeshQualityPoint3 => {
  const base = vertexIndex * 3;
  return {
    x: Number(positions[base] ?? 0),
    y: Number(positions[base + 1] ?? 0),
    z: Number(positions[base + 2] ?? 0),
  };
};

const edgeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const safeAcosDeg = (dot: number): number => Math.acos(Math.max(-1, Math.min(1, dot))) * RAD_TO_DEG;

const triangleFromIndex = (
  indices: ArrayLike<number> | null,
  triangleIndex: number,
  vertexCount: number
): { a: number; b: number; c: number } | null => {
  if (indices && indices.length >= 3) {
    const base = triangleIndex * 3;
    const a = Number(indices[base]);
    const b = Number(indices[base + 1]);
    const c = Number(indices[base + 2]);
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
      return null;
    }
    return { a, b, c };
  }
  const a = triangleIndex * 3;
  const b = a + 1;
  const c = a + 2;
  if (c >= vertexCount) return null;
  return { a, b, c };
};

export const computeMeshQualityReport = (
  mesh: Pick<SurfaceMeshData, "positions" | "indices">,
  options: MeshQualityReportOptions = {}
): MeshQualityReport => {
  const highAspectRatioThreshold = Number.isFinite(options.highAspectRatioThreshold)
    ? Math.max(1, Number(options.highAspectRatioThreshold))
    : 8;
  const maxListedDefects = Number.isFinite(options.maxListedDefects)
    ? Math.max(1, Math.floor(Number(options.maxListedDefects)))
    : 120;

  const positions = mesh.positions;
  const indices = mesh.indices ?? null;
  const vertexCount = Math.floor(positions.length / 3);
  const faceCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);

  const edgeMap = new Map<string, EdgeRecord>();
  const faces = new Map<number, FaceRecord>();
  const triangleAreas: number[] = [];
  const aspectRatios: number[] = [];
  const allEdgeLengths: number[] = [];
  const degenerateFaces: MeshQualityFaceDefect[] = [];

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const tri = triangleFromIndex(indices, faceIndex, vertexCount);
    if (!tri) continue;
    const pA = asPoint(positions, tri.a);
    const pB = asPoint(positions, tri.b);
    const pC = asPoint(positions, tri.c);
    const ab = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);
    const bc = Math.hypot(pC.x - pB.x, pC.y - pB.y, pC.z - pB.z);
    const ca = Math.hypot(pA.x - pC.x, pA.y - pC.y, pA.z - pC.z);
    const maxEdge = Math.max(ab, bc, ca);
    const minEdge = Math.min(ab, bc, ca);
    const aspectRatio = minEdge > 1e-12 ? maxEdge / minEdge : Number.POSITIVE_INFINITY;

    const ux = pB.x - pA.x;
    const uy = pB.y - pA.y;
    const uz = pB.z - pA.z;
    const vx = pC.x - pA.x;
    const vy = pC.y - pA.y;
    const vz = pC.z - pA.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(nx, ny, nz);
    const normalLen = Math.hypot(nx, ny, nz);
    const normal = normalLen > 1e-18 ? { x: nx / normalLen, y: ny / normalLen, z: nz / normalLen } : null;

    const centroid = {
      x: (pA.x + pB.x + pC.x) / 3,
      y: (pA.y + pB.y + pC.y) / 3,
      z: (pA.z + pB.z + pC.z) / 3,
    };

    const degenerate =
      !Number.isFinite(area) ||
      area <= 1e-12 ||
      !Number.isFinite(aspectRatio) ||
      tri.a === tri.b ||
      tri.b === tri.c ||
      tri.c === tri.a;

    faces.set(faceIndex, {
      faceIndex,
      a: tri.a,
      b: tri.b,
      c: tri.c,
      area,
      aspectRatio,
      centroid,
      normal,
      degenerate,
    });

    if (degenerate) {
      degenerateFaces.push({ faceIndex, centroid, area, aspectRatio });
    } else {
      triangleAreas.push(area);
      aspectRatios.push(aspectRatio);
    }

    const edgeTriples: Array<[number, number, MeshQualityPoint3, MeshQualityPoint3, number]> = [
      [tri.a, tri.b, pA, pB, ab],
      [tri.b, tri.c, pB, pC, bc],
      [tri.c, tri.a, pC, pA, ca],
    ];
    for (const [v0, v1, pointA, pointB, length] of edgeTriples) {
      allEdgeLengths.push(length);
      const key = edgeKey(v0, v1);
      const existing = edgeMap.get(key);
      if (existing) {
        existing.incidentFaces.push(faceIndex);
      } else {
        edgeMap.set(key, {
          a: Math.min(v0, v1),
          b: Math.max(v0, v1),
          pointA: v0 <= v1 ? pointA : pointB,
          pointB: v0 <= v1 ? pointB : pointA,
          length,
          incidentFaces: [faceIndex],
        });
      }
    }
  }

  const vertexNeighbors: Array<Set<number>> = Array.from({ length: vertexCount }, () => new Set<number>());
  const dihedralAngles: number[] = [];
  let boundaryEdgeCount = 0;
  const nonManifoldEdges: MeshQualityEdgeDefect[] = [];

  for (const [key, edge] of edgeMap) {
    vertexNeighbors[edge.a]?.add(edge.b);
    vertexNeighbors[edge.b]?.add(edge.a);
    if (edge.incidentFaces.length === 1) boundaryEdgeCount += 1;
    if (edge.incidentFaces.length > 2) {
      const midpoint = {
        x: (edge.pointA.x + edge.pointB.x) * 0.5,
        y: (edge.pointA.y + edge.pointB.y) * 0.5,
        z: (edge.pointA.z + edge.pointB.z) * 0.5,
      };
      nonManifoldEdges.push({
        edgeId: key,
        a: edge.a,
        b: edge.b,
        pointA: edge.pointA,
        pointB: edge.pointB,
        midpoint,
        length: edge.length,
        incidentFaceCount: edge.incidentFaces.length,
        incidentFaces: edge.incidentFaces.slice(),
      });
    }
    if (edge.incidentFaces.length === 2) {
      const f0 = faces.get(edge.incidentFaces[0]);
      const f1 = faces.get(edge.incidentFaces[1]);
      if (!f0?.normal || !f1?.normal) continue;
      const dot = f0.normal.x * f1.normal.x + f0.normal.y * f1.normal.y + f0.normal.z * f1.normal.z;
      const angle = safeAcosDeg(dot);
      if (Number.isFinite(angle)) dihedralAngles.push(angle);
    }
  }

  const vertexValence = vertexNeighbors
    .map((entry) => entry.size)
    .filter((value) => Number.isFinite(value));

  const highAspectFaces = [...faces.values()]
    .filter((entry) => !entry.degenerate && Number.isFinite(entry.aspectRatio) && entry.aspectRatio >= highAspectRatioThreshold)
    .sort((a, b) => b.aspectRatio - a.aspectRatio)
    .map((entry) => ({
      faceIndex: entry.faceIndex,
      centroid: entry.centroid,
      area: entry.area,
      aspectRatio: entry.aspectRatio,
    }));

  const report: MeshQualityReport = {
    generatedAt: new Date().toISOString(),
    vertexCount,
    faceCount: faces.size,
    metrics: {
      edgeLength: summary(allEdgeLengths),
      triangleArea: summary(triangleAreas),
      aspectRatio: summary(aspectRatios),
      vertexValence: summary(vertexValence),
      dihedralAngleDeg: summary(dihedralAngles),
    },
    topology: {
      boundaryEdgeCount,
      nonManifoldEdgeCount: nonManifoldEdges.length,
      degenerateFaceCount: degenerateFaces.length,
    },
    defects: {
      degenerateFaces: degenerateFaces
        .sort((a, b) => a.faceIndex - b.faceIndex)
        .slice(0, maxListedDefects),
      highAspectFaces: highAspectFaces.slice(0, maxListedDefects),
      nonManifoldEdges: nonManifoldEdges
        .sort((a, b) => b.incidentFaceCount - a.incidentFaceCount)
        .slice(0, maxListedDefects),
    },
  };

  return report;
};
