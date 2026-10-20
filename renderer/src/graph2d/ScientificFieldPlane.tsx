import { useEffect, useRef } from "react";
import type { Graph2DScientificPlane, ScientificCoordinateSystem } from "@math3d/core";

export function ScientificFieldPlane({ plane, coordinate, label, unit }: {
  plane: Graph2DScientificPlane; coordinate: ScientificCoordinateSystem; label: string; unit: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  let low = Infinity, high = -Infinity;
  for (const value of plane.values) { if (value < low) low = value; if (value > high) high = value; }
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const [rows, columns] = plane.shape;
    const pixels = context.createImageData(columns, rows);
    const span = high - low;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const value = plane.values[row * columns + column]!;
      const t = span === 0 ? 0.5 : (value - low) / span;
      const offset = ((rows - row - 1) * columns + column) * 4;
      pixels.data[offset] = Math.round(30 + 220 * t);
      pixels.data[offset + 1] = Math.round(80 + 135 * (1 - Math.abs(2 * t - 1)));
      pixels.data[offset + 2] = Math.round(235 - 205 * t);
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [plane, low, high]);
  const [vertical, horizontal] = plane.planeAxes;
  const axisLabel = (axis: number) => `${coordinate.axes[axis]!.name} (${coordinate.axes[axis]!.unit})`;
  const fixed = plane.normalAxis === null ? "" :
    ` · ${coordinate.axes[plane.normalAxis]!.name} = ${coordinate.origin[plane.normalAxis]! +
      coordinate.spacing[plane.normalAxis]! * plane.fixedIndex!} ${coordinate.axes[plane.normalAxis]!.unit}`;
  return <figure className="graph2d-scientific-field" aria-label={`Verified field plane for ${label}${fixed}`}>
    <figcaption>{label} ({unit}){fixed} · {plane.shape.join(" × ")} samples</figcaption>
    <canvas ref={canvas} width={plane.shape[1]} height={plane.shape[0]}
      style={{ width: "100%", maxWidth: 512, height: "auto", aspectRatio: `${plane.shape[1]} / ${plane.shape[0]}`,
        imageRendering: "pixelated", border: "1px solid #9ca3af" }}
      role="img" aria-label={`${label} heatmap; ${axisLabel(horizontal)} horizontal, ${axisLabel(vertical)} vertical; values ${low} to ${high} ${unit}`} />
    <p>{axisLabel(horizontal)} horizontal · {axisLabel(vertical)} vertical · blue {low} to red {high} {unit}</p>
    <small>Verified plane {plane.planeSha256} · source resource {plane.resourceSha256}</small>
  </figure>;
}
