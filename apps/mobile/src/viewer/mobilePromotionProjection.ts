import { evaluateGraph2DPromotionGeometry, type CurveDocument, type SurfaceDocument } from "@math3d/core";
import { clipMobileGraphLine, type MobileGraphLine } from "./mobileGraphProjection";

/** Portable, bounded orthographic 3D wireframe preview; no browser worker/WebGL contract is assumed. */
export const projectMobilePromotion = (document: CurveDocument | SurfaceDocument, size: { width: number; height: number }, angle: number): MobileGraphLine[] => {
  const geometry = evaluateGraph2DPromotionGeometry(document);
  const count = geometry.positions.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) for (let axis = 0; axis < 3; axis++) {
    const value = geometry.positions[i * 3 + axis]!; min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
  }
  const center = min.map((value, i) => value / 2 + max[i]! / 2);
  const radius = Math.max(...max.map((value, i) => value / 2 - min[i]! / 2), Number.MIN_VALUE);
  const scale = Math.min(size.width, size.height) * 0.24;
  const points = Array.from({ length: count }, (_, i) => {
    const [x, y, z] = center.map((c, axis) => geometry.positions[i * 3 + axis]! / radius - c / radius);
    const horizontal = x! * Math.cos(angle) - y! * Math.sin(angle), depth = x! * Math.sin(angle) + y! * Math.cos(angle);
    return { x: size.width / 2 + horizontal * scale, y: size.height / 2 - (z! * 0.85 - depth * 0.5) * scale };
  });
  const lines: MobileGraphLine[] = [];
  const add = (a: number, b: number) => { const clipped = clipMobileGraphLine(points[a]!, points[b]!, size);
    if (clipped && lines.length < 768) lines.push({ ...clipped, color: "#2563eb", width: 1.2 }); };
  if (geometry.kind === "curve") for (let i = 1; i < count; i++) add(i - 1, i);
  else if (geometry.grid) {
    // Sample parameter-grid curves, not a stride of triangles: triangle strides can
    // alias an extrusion into disconnected rings and hide its entire sweep direction.
    const { profileCount, sweepCount } = geometry.grid;
    const profileStep = Math.max(1, Math.ceil(profileCount / 16)), sweepStep = Math.max(1, Math.ceil(sweepCount / 8));
    const at = (i: number, j: number) => i * (sweepCount + 1) + j;
    for (let i = 0; i <= profileCount; i += profileStep)
      for (let j = 0; j < sweepCount; j += sweepStep) add(at(i, j), at(i, Math.min(sweepCount, j + sweepStep)));
    for (let j = 0; j <= sweepCount; j += sweepStep)
      for (let i = 0; i < profileCount; i += profileStep) add(at(i, j), at(Math.min(profileCount, i + profileStep), j));
  } else {
    const triangleCount = geometry.indices.length / 3, stride = Math.max(1, Math.ceil(triangleCount / 256));
    for (let i = 0; i < triangleCount; i += stride) { const [a, b, c] = geometry.indices.slice(i * 3, i * 3 + 3); add(a!, b!); add(b!, c!); add(c!, a!); }
  }
  return lines;
};
