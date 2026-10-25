/** Coordinate rules shared by verified field previews, imports, and trajectories. */
export type ScientificRegularAxis = Readonly<{ name: string; unit: string; origin: number;
  spacing: number; count: number; coordinates?: readonly number[] }>;

export function scientificAxisCoordinate(axis: ScientificRegularAxis, index: number): number {
  if (axis.coordinates !== undefined)
    throw new TypeError(`Nonuniform coordinate arrays are not supported for ${axis.name}; import a regular grid.`);
  if (!axis.name || !axis.unit || !Number.isFinite(axis.origin) ||
      !Number.isFinite(axis.spacing) || axis.spacing <= 0 ||
      !Number.isSafeInteger(axis.count) || axis.count < 1)
    throw new TypeError(`Invalid ${axis.name || "scientific"} axis, unit or spacing.`);
  if (!Number.isSafeInteger(index) || index < 0 || index >= axis.count)
    throw new RangeError(`${axis.name} index ${index} is outside 0…${axis.count - 1}.`);
  const coordinate = axis.origin + axis.spacing * index;
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > 1e12)
    throw new RangeError(`${axis.name} coordinate is outside the supported domain.`);
  return coordinate;
}

export function scientificCoordinateIndex(axis: ScientificRegularAxis, coordinate: number,
  mode: "exact" | "nearest" = "exact"): number {
  scientificAxisCoordinate(axis, 0);
  const last = scientificAxisCoordinate(axis, axis.count - 1);
  if (!Number.isFinite(coordinate) || coordinate < axis.origin || coordinate > last)
    throw new RangeError(`${axis.name} = ${coordinate} ${axis.unit} is outside ${axis.origin}…${last} ${axis.unit}.`);
  const raw = (coordinate - axis.origin) / axis.spacing;
  const nearest = Math.round(raw);
  if (mode === "exact" && Math.abs(raw - nearest) > 1e-9)
    throw new RangeError(`${axis.name} = ${coordinate} ${axis.unit} is between grid samples; choose an index.`);
  return Math.max(0, Math.min(axis.count - 1, nearest));
}

export function validateScientificLineCoordinates(axes: readonly ScientificRegularAxis[],
  varyingAxis: number, fixed: readonly Readonly<{ axis: number; index: number }>[]): void {
  if (!Number.isSafeInteger(varyingAxis) || varyingAxis < 0 || varyingAxis >= axes.length ||
      axes[varyingAxis]!.count < 2 || fixed.length !== axes.length - 1 ||
      fixed.some(item => !Number.isSafeInteger(item.axis) || item.axis < 0 || item.axis >= axes.length) ||
      new Set([varyingAxis, ...fixed.map(item => item.axis)]).size !== axes.length)
    throw new TypeError("Choose one varying axis and one fixed index on every other axis.");
  axes.forEach((axis, index) => scientificAxisCoordinate(axis, index === varyingAxis ? 0 :
    fixed.find(item => item.axis === index)!.index));
  scientificAxisCoordinate(axes[varyingAxis]!, axes[varyingAxis]!.count - 1);
}

export function scientificPointWithinBounds(point: readonly number[], axes: readonly Readonly<{
  min: number; max: number; unit: string }>[]): boolean {
  return point.length === axes.length && point.every((value, index) =>
    Number.isFinite(value) && Number.isFinite(axes[index]!.min) && Number.isFinite(axes[index]!.max) &&
    value >= axes[index]!.min && value <= axes[index]!.max);
}

export function scientificVelocityUnit(axisUnit: string, timeUnit: string): string {
  if (!axisUnit || !timeUnit) throw new TypeError("Coordinate and time units are required.");
  return `${axisUnit}/${timeUnit}`;
}
