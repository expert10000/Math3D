import type { Graph2DScientificPlane, ScientificCoordinateSystem } from "@math3d/core";

export const SCIENTIFIC_VECTOR_GLYPH_LIMIT = 512;

export type ScientificVectorGlyph = { x: number; y: number; vx: number; vy: number; magnitude: number };
export type ScientificVectorGlyphOptions = { density?: readonly [number, number]; maxGlyphs?: number };

/** Coordinates and vectors use axis 0 horizontally and axis 1 vertically, including reversed source spacing. */
export function buildScientificVectorGlyphs(planes: readonly [Graph2DScientificPlane, Graph2DScientificPlane],
  coordinate: ScientificCoordinateSystem, options: ScientificVectorGlyphOptions = {}):
  { glyphs: ScientificVectorGlyph[]; minimum: number; maximum: number;
    xRange: [number, number]; yRange: [number, number] } {
  const [horizontal, vertical] = planes;
  const [xSize, ySize] = horizontal.shape;
  const limit = Math.max(1, Math.min(SCIENTIFIC_VECTOR_GLYPH_LIMIT, options.maxGlyphs ?? SCIENTIFIC_VECTOR_GLYPH_LIMIT));
  let xCount = options.density ? Math.min(xSize, options.density[0]) :
    Math.min(xSize, Math.max(1, Math.floor(Math.sqrt(limit * xSize / ySize))));
  let yCount = options.density ? Math.min(ySize, options.density[1]) :
    Math.min(ySize, Math.max(1, Math.floor(limit / xCount)));
  while (xCount * yCount > limit) {
    if (xCount >= yCount) xCount--; else yCount--;
  }
  const xEnd = coordinate.origin[0]! + coordinate.spacing[0]! * (xSize - 1);
  const yEnd = coordinate.origin[1]! + coordinate.spacing[1]! * (ySize - 1);
  const xRange: [number, number] = [Math.min(coordinate.origin[0]!, xEnd), Math.max(coordinate.origin[0]!, xEnd)];
  const yRange: [number, number] = [Math.min(coordinate.origin[1]!, yEnd), Math.max(coordinate.origin[1]!, yEnd)];
  let minimum = Infinity, maximum = 0;
  for (let index = 0; index < horizontal.values.length; index++) {
    const magnitude = Math.hypot(horizontal.values[index]!, vertical.values[index]!);
    minimum = Math.min(minimum, magnitude); maximum = Math.max(maximum, magnitude);
  }
  const glyphs: ScientificVectorGlyph[] = [];
  for (let xi = 0; xi < xCount; xi++) for (let yi = 0; yi < yCount; yi++) {
    const xIndex = xCount === 1 ? Math.floor((xSize - 1) / 2) : Math.round(xi * (xSize - 1) / (xCount - 1));
    const yIndex = yCount === 1 ? Math.floor((ySize - 1) / 2) : Math.round(yi * (ySize - 1) / (yCount - 1));
    const index = xIndex * ySize + yIndex;
    const xValue = coordinate.origin[0]! + coordinate.spacing[0]! * xIndex;
    const yValue = coordinate.origin[1]! + coordinate.spacing[1]! * yIndex;
    const vx = horizontal.values[index]!, vy = vertical.values[index]!;
    glyphs.push({ x: xRange[0] === xRange[1] ? 0.5 : (xValue - xRange[0]) / (xRange[1] - xRange[0]),
      y: yRange[0] === yRange[1] ? 0.5 : 1 - (yValue - yRange[0]) / (yRange[1] - yRange[0]),
      vx, vy, magnitude: Math.hypot(vx, vy) });
  }
  return { glyphs, minimum: Number.isFinite(minimum) ? minimum : 0, maximum, xRange, yRange };
}
