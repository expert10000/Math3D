import type { VectorField3DClipBounds, VectorField3DDocument,
  VectorField3DTrajectoryArtifact } from "@math3d/core";
import { seedGroupColorRgb, seedGroupStyle } from "./seedGroupManagement";

export function trajectoryGroupGeometry(document: VectorField3DDocument,
  trajectories: VectorField3DTrajectoryArtifact | null | undefined,
  clip: VectorField3DClipBounds): Readonly<{ positions: Float32Array; colors: Float32Array }> {
  const positions: number[] = [], colors: number[] = [];
  const axes = document.source.axes;
  const span = Math.max(...axes.map(axis => axis.max - axis.min));
  const seedGroups = new Map(document.source.seeds.map(seed =>
    [seed.id, seed.group ?? "manual"]));
  trajectories?.trajectories.forEach(trajectory => {
    const color = seedGroupColorRgb(seedGroupStyle(document,
      seedGroups.get(trajectory.seedId) ?? "manual").color);
    for (let index = 1; index < trajectory.points.length; index++) {
      const first = trajectory.points[index - 1]!.position;
      const second = trajectory.points[index]!.position;
      if ([first, second].some(point => point.some((value, axis) =>
        value < clip[axis]![0] || value > clip[axis]![1]))) continue;
      for (const point of [first, second]) {
        positions.push(...point.map((value, axis) =>
          (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span));
        colors.push(...color);
      }
    }
  });
  return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}
