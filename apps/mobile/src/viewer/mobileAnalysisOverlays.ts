import * as THREE from "three";
import type { MobileMeshSummaryResult } from "../models/mobileMeshSummary";

export type MobileAnalysisOverlay = "none" | "curvature" | "normals" | "boundaries" | "non-manifold";

export const normalizeMobileAnalysisOverlay = (value: unknown): MobileAnalysisOverlay =>
  value === "curvature" || value === "normals" || value === "boundaries" || value === "non-manifold"
    ? value
    : "none";

export const mobileAnalysisOverlayAvailability = (
  overlay: MobileAnalysisOverlay,
  summary: MobileMeshSummaryResult | null
): { available: boolean; message: string } => {
  if (overlay === "none") return { available: true, message: "Analysis overlay off." };
  if (!summary || summary.status === "unavailable") {
    return { available: false, message: summary?.status === "unavailable" ? summary.reason : "Analyze the selected object first." };
  }
  if (overlay === "boundaries" && summary.boundaryEdgeCount === 0) {
    return { available: true, message: "This mesh has no boundary edges." };
  }
  if (overlay === "non-manifold" && summary.nonManifoldEdgeCount === 0) {
    return { available: true, message: "This mesh has no nonmanifold edges." };
  }
  return { available: true, message: `${overlay} overlay ready.` };
};

type EdgeRecord = { a: number; b: number; count: number };

const collectEdges = (source: any): EdgeRecord[] => {
  const position = source.getAttribute("position");
  const index = source.getIndex();
  if (!position) return [];
  const cornerCount = index?.count ?? position.count;
  const vertexAt = (corner: number) => index ? index.getX(corner) : corner;
  const edges = new Map<string, EdgeRecord>();
  for (let corner = 0; corner + 2 < cornerCount; corner += 3) {
    const triangle = [vertexAt(corner), vertexAt(corner + 1), vertexAt(corner + 2)];
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  return [...edges.values()];
};

export const buildMobileEdgeOverlayGeometry = (
  source: any,
  kind: "boundaries" | "non-manifold"
): any | null => {
  const position = source.getAttribute("position");
  if (!position) return null;
  const selected = collectEdges(source).filter((edge) => kind === "boundaries" ? edge.count === 1 : edge.count > 2);
  if (selected.length === 0) return null;
  const points = new Float32Array(selected.length * 6);
  selected.forEach((edge, edgeIndex) => {
    const offset = edgeIndex * 6;
    points[offset] = position.getX(edge.a);
    points[offset + 1] = position.getY(edge.a);
    points[offset + 2] = position.getZ(edge.a);
    points[offset + 3] = position.getX(edge.b);
    points[offset + 4] = position.getY(edge.b);
    points[offset + 5] = position.getZ(edge.b);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
  return geometry;
};

export const buildMobileNormalOverlayGeometry = (source: any, maxGlyphs = 260): any | null => {
  const position = source.getAttribute("position");
  if (!position) return null;
  if (!source.getAttribute("normal")) source.computeVertexNormals();
  const normal = source.getAttribute("normal");
  if (!normal) return null;
  if (!source.boundingSphere) source.computeBoundingSphere();
  const length = Math.max(0.025, Math.min(0.4, (source.boundingSphere?.radius ?? 1) * 0.075));
  const stride = Math.max(1, Math.ceil(position.count / maxGlyphs));
  const glyphCount = Math.ceil(position.count / stride);
  const points = new Float32Array(glyphCount * 6);
  let cursor = 0;
  for (let vertex = 0; vertex < position.count; vertex += stride) {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    points[cursor++] = x;
    points[cursor++] = y;
    points[cursor++] = z;
    points[cursor++] = x + normal.getX(vertex) * length;
    points[cursor++] = y + normal.getY(vertex) * length;
    points[cursor++] = z + normal.getZ(vertex) * length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
  return geometry;
};
