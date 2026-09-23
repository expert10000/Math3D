import type { SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "../models/mobileScene";
import { buildSceneSurfacePreviews } from "./mobileSurfacePreview";

export const MOBILE_SCENE_THUMBNAIL_VERSION = 1 as const;
const MOBILE_SCENE_THUMBNAIL_RENDERER_VERSION = "vector-1";
const MOBILE_SCENE_THUMBNAIL_CAMERA = "isometric-078-062-082-024";

export type MobileThumbnailSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

export type MobileSceneThumbnail = {
  version: typeof MOBILE_SCENE_THUMBNAIL_VERSION;
  kind: "ready" | "uncomputed" | "empty";
  segments: MobileThumbnailSegment[];
};

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const createMobileThumbnailCacheKey = (project: MobileStoredSceneProject): string =>
  [
    MOBILE_SCENE_THUMBNAIL_VERSION,
    MOBILE_SCENE_THUMBNAIL_RENDERER_VERSION,
    MOBILE_SCENE_THUMBNAIL_CAMERA,
    hashText(project.serializedProject),
  ].join(":");

type ProjectedEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

const projectPoint = (x: number, y: number, z: number): [number, number] => [
  x * 0.78 - y * 0.62,
  -z * 0.82 + (x + y) * 0.24,
];

export const generateMobileSceneThumbnail = (scene: SceneDocument): MobileSceneThumbnail => {
  const previews = buildSceneSurfacePreviews(scene, "performance");
  const projected: ProjectedEdge[] = [];
  let hasUncomputed = false;

  try {
    for (const preview of previews) {
      const geometry = preview.geometry;
      if (!geometry) {
        hasUncomputed = hasUncomputed || preview.state === "uncomputed";
        continue;
      }
      const position = geometry.getAttribute("position");
      if (!position || position.count < 2) continue;
      const index = geometry.getIndex();
      const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
      const triangleStep = Math.max(1, Math.ceil(triangleCount / 18));
      let accepted = 0;
      for (let triangle = 0; triangle < triangleCount && accepted < 22; triangle += triangleStep) {
        const offset = triangle * 3;
        const a = index ? index.getX(offset) : offset;
        const b = index ? index.getX(offset + 1) : offset + 1;
        const c = index ? index.getX(offset + 2) : offset + 2;
        for (const [from, to] of [[a, b], [b, c]] as const) {
          const start = projectPoint(position.getX(from), position.getY(from), position.getZ(from));
          const end = projectPoint(position.getX(to), position.getY(to), position.getZ(to));
          if (![...start, ...end].every(Number.isFinite)) continue;
          projected.push({ x1: start[0], y1: start[1], x2: end[0], y2: end[1], color: preview.color });
        }
        accepted += 1;
      }
    }
  } finally {
    for (const preview of previews) preview.geometry?.dispose();
  }

  if (projected.length === 0) {
    return {
      version: MOBILE_SCENE_THUMBNAIL_VERSION,
      kind: hasUncomputed ? "uncomputed" : "empty",
      segments: [],
    };
  }

  const xs = projected.flatMap((edge) => [edge.x1, edge.x2]);
  const ys = projected.flatMap((edge) => [edge.y1, edge.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min(0.88 / spanX, 0.78 / spanY);
  const offsetX = 0.5 - ((minX + maxX) * 0.5) * scale;
  const offsetY = 0.5 - ((minY + maxY) * 0.5) * scale;

  return {
    version: MOBILE_SCENE_THUMBNAIL_VERSION,
    kind: "ready",
    segments: projected.slice(0, 48).map((edge) => ({
      x1: edge.x1 * scale + offsetX,
      y1: edge.y1 * scale + offsetY,
      x2: edge.x2 * scale + offsetX,
      y2: edge.y2 * scale + offsetY,
      color: edge.color,
    })),
  };
};

export const isMobileSceneThumbnail = (value: unknown): value is MobileSceneThumbnail => {
  if (!value || typeof value !== "object") return false;
  const thumbnail = value as Partial<MobileSceneThumbnail>;
  if (thumbnail.version !== MOBILE_SCENE_THUMBNAIL_VERSION) return false;
  if (thumbnail.kind !== "ready" && thumbnail.kind !== "uncomputed" && thumbnail.kind !== "empty") return false;
  if (!Array.isArray(thumbnail.segments) || thumbnail.segments.length > 48) return false;
  return thumbnail.segments.every((segment) => {
    if (!segment || typeof segment !== "object") return false;
    const candidate = segment as Partial<MobileThumbnailSegment>;
    return [candidate.x1, candidate.y1, candidate.x2, candidate.y2].every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1
    ) && typeof candidate.color === "string";
  });
};
