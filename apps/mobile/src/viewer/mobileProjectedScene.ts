import * as THREE from "three";
import type { MobileSurfacePreview } from "./mobileSurfacePreview";

export type MobileProjectionOrbit = {
  azimuth: number;
  polar: number;
  distance: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

export type MobileProjectedLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  emphasized: boolean;
};

const projectPoint = (
  position: any,
  index: number,
  camera: any,
  width: number,
  height: number
): { x: number; y: number; visible: boolean } => {
  const point = new THREE.Vector3().fromBufferAttribute(position, index).project(camera);
  return {
    x: (point.x * 0.5 + 0.5) * width,
    y: (-point.y * 0.5 + 0.5) * height,
    visible: Number.isFinite(point.x) && Number.isFinite(point.y) &&
      Math.abs(point.x) <= 1.5 && Math.abs(point.y) <= 1.5 && point.z >= -1.2 && point.z <= 1.2,
  };
};

export const projectMobileSceneWireframe = (
  previews: MobileSurfacePreview[],
  orbit: MobileProjectionOrbit,
  width: number,
  height: number,
  selectedSurfaceId: string | null,
  maxTrianglesPerSurface = 220
): MobileProjectedLine[] => {
  if (width <= 0 || height <= 0) return [];
  const camera = new THREE.PerspectiveCamera(52, width / height, 0.01, 1000);
  const sinPolar = Math.sin(orbit.polar);
  camera.position.set(
    orbit.targetX + orbit.distance * sinPolar * Math.cos(orbit.azimuth),
    orbit.targetY + orbit.distance * sinPolar * Math.sin(orbit.azimuth),
    orbit.targetZ + orbit.distance * Math.cos(orbit.polar)
  );
  camera.up.set(0, 0, 1);
  camera.lookAt(orbit.targetX, orbit.targetY, orbit.targetZ);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const lines: MobileProjectedLine[] = [];
  for (const preview of previews) {
    const geometry = preview.geometry;
    const position = geometry?.getAttribute?.("position");
    if (!geometry || !position || position.count < 3) continue;
    const index = geometry.getIndex?.();
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    const stride = Math.max(1, Math.ceil(triangleCount / maxTrianglesPerSurface));
    const emphasized = preview.id === selectedSurfaceId;
    const color = emphasized ? "#f59e0b" : preview.color || "#2563eb";
    const readVertex = (offset: number) => index ? index.getX(offset) : offset;

    for (let triangle = 0; triangle < triangleCount; triangle += stride) {
      const offset = triangle * 3;
      const points = [0, 1, 2].map((corner) => projectPoint(
        position,
        readVertex(offset + corner),
        camera,
        width,
        height
      ));
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        if (!points[a].visible || !points[b].visible) continue;
        lines.push({
          x1: points[a].x,
          y1: points[a].y,
          x2: points[b].x,
          y2: points[b].y,
          color,
          emphasized,
        });
      }
    }
  }
  return lines;
};
