import type { VectorField3DArrowArtifact, VectorField3DDocument } from "@math3d/core";
import { mobileVectorField3DDisplayArrows } from "./mobileVectorField3D";

/** CPU-side line buffers contain at most 512 arrows, independent of document glyph budget. */
export function buildMobileVectorField3DGeometry(document: VectorField3DDocument,
  artifact: VectorField3DArrowArtifact) {
  if (artifact.source.documentId !== document.identity.id ||
      artifact.source.revision !== document.identity.revision ||
      artifact.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("3D arrow artifact does not match the saved source revision.");
  const axes = document.source.axes;
  const span = Math.max(...axes.map(axis => axis.max - axis.min));
  const arrows = mobileVectorField3DDisplayArrows(artifact);
  const maximum = Math.max(...arrows.map(arrow => arrow.magnitude), 1e-12);
  const spacing = Math.min(...axes.map((axis, index) =>
    (axis.max - axis.min) * 2 / span / Math.max(artifact.density[index]! - 1, 1)));
  const positions: number[] = [], colors: number[] = [], stationary: number[] = [];
  const add = (start: number[], end: number[], color: number[]) => {
    positions.push(...start, ...end);
    colors.push(...color, ...color);
  };
  for (const arrow of arrows) {
    const start = arrow.position.map((value, axis) =>
      (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span);
    if (arrow.kind === "stationary") { stationary.push(...start); continue; }
    const direction = arrow.vector.map(value => value / arrow.magnitude);
    const length = Math.min(spacing * .74, spacing * .18 + spacing * .56 *
      Math.min(1, arrow.magnitude * artifact.magnitudeScale / maximum));
    const end = start.map((value, axis) => value + direction[axis]! * length);
    const selected = artifact.colorBy === "speed" ? arrow.magnitude :
      arrow.vector[{ p: 0, q: 1, r: 2 }[artifact.colorBy]]!;
    const t = artifact.colorBy === "speed" ? selected / maximum : (selected / maximum + 1) / 2;
    const color = [.16 + .76 * t, .58 - .31 * t, .92 - .65 * t];
    add(start, end, color);
    const basis = Math.abs(direction[2]!) < .8 ? [0, 0, 1] : [0, 1, 0];
    const side = [direction[1]! * basis[2]! - direction[2]! * basis[1]!,
      direction[2]! * basis[0]! - direction[0]! * basis[2]!,
      direction[0]! * basis[1]! - direction[1]! * basis[0]!];
    const sideLength = Math.hypot(...side);
    for (const sign of [-1, 1]) add(end, end.map((value, axis) => value -
      direction[axis]! * length * .22 + sign * side[axis]! / sideLength * length * .13), color);
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors),
    stationary: new Float32Array(stationary), shown: arrows.length };
}
