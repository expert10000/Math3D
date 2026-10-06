import type { ImportedQuantumScene } from "./importer";
import type { SceneField } from "./index";

export type FieldQuantity = "density" | "real" | "imaginary" | "phase";
export type FieldSliceRequest = { fingerprint: string; fieldId: string; axis: 0 | 1 | 2; index: number; quantity: FieldQuantity };
export type FieldSampleRequest = FieldSliceRequest & { u: number; v: number };
export type FieldSlice = {
  fieldId: string; axis: 0 | 1 | 2; index: number; quantity: FieldQuantity;
  width: number; height: number; rgba: Uint8Array;
  range: [number, number]; unit: string; planeAxes: [number, number];
};
export type FieldSample = {
  grid: [number, number, number]; position: [number, number, number];
  value: number | null; unit: string; undefinedNearNode: boolean;
};

const quantities: readonly FieldQuantity[] = ["density", "real", "imaginary", "phase"];

function source(imported: ImportedQuantumScene, request: FieldSliceRequest) {
  const field = imported.source.fields?.find(candidate => candidate.id === request.fieldId);
  if (!field) throw new TypeError("Unknown verified scene field");
  if (!quantities.includes(request.quantity) || (field.kind === "scalar-field" && request.quantity !== "real"))
    throw new TypeError("Unsupported field quantity");
  if (![0, 1, 2].includes(request.axis) || !Number.isSafeInteger(request.index) ||
      request.index < 0 || request.index >= field.grid.shape[request.axis])
    throw new RangeError("Invalid field slice index");
  const real = imported.arrays.get(field.real);
  const imaginary = field.imaginary ? imported.arrays.get(field.imaginary) : undefined;
  if (!real || (field.kind === "complex-field" && !imaginary)) throw new TypeError("Verified field data unavailable");
  const amplitudeUnit = imported.source.datasets.find(dataset => dataset.id === field.real)?.unit ?? "unknown";
  if (field.imaginary && imported.source.datasets.find(dataset => dataset.id === field.imaginary)?.unit !== amplitudeUnit)
    throw new TypeError("Complex field components have different units");
  const unit = request.quantity === "phase" ? "rad" : request.quantity === "density"
    ? amplitudeUnit === "a0^-3/2" ? "a0^-3" : amplitudeUnit === "dimensionless" ? amplitudeUnit : `(${amplitudeUnit})²`
    : amplitudeUnit;
  return { field, real, imaginary, unit };
}

function flatIndex(field: SceneField, grid: readonly number[]): number {
  const [x, y, z] = grid;
  return (x * field.grid.shape[1] + y) * field.grid.shape[2] + z;
}

function valueAt(real: Float64Array, imaginary: Float64Array | undefined, index: number, quantity: FieldQuantity): number {
  const re = real[index];
  const im = imaginary?.[index] ?? 0;
  if (quantity === "real") return re;
  if (quantity === "imaginary") return im;
  if (quantity === "density") return re * re + im * im;
  return Math.atan2(im, re);
}

function densityMaximum(real: Float64Array, imaginary?: Float64Array): number {
  let maximum = 0;
  for (let i = 0; i < real.length; i++) maximum = Math.max(maximum, real[i] * real[i] + (imaginary?.[i] ?? 0) ** 2);
  return maximum;
}

function color(value: number, quantity: FieldQuantity, maximum: number): [number, number, number] {
  if (quantity === "phase") {
    // Cyclic hue; -π and +π intentionally have the same color.
    const hue = ((value + Math.PI) / (2 * Math.PI)) * 6;
    const sector = Math.floor(hue) % 6, part = hue - Math.floor(hue);
    const colors: [number, number, number][] = [[255, 0, Math.round(255 * (1 - part))],
      [255, Math.round(255 * part), 0], [Math.round(255 * (1 - part)), 255, 0],
      [0, 255, Math.round(255 * part)], [0, Math.round(255 * (1 - part)), 255],
      [Math.round(255 * part), 0, 255]];
    return colors[sector];
  }
  if (quantity === "density") {
    const t = maximum ? Math.sqrt(Math.max(0, value) / maximum) : 0;
    return [Math.round(12 + 130 * t), Math.round(28 + 205 * t), Math.round(48 + 190 * t)];
  }
  const t = maximum ? Math.min(1, Math.abs(value) / maximum) : 0;
  return value < 0 ? [Math.round(235 - 180 * t), Math.round(235 - 130 * t), 245]
    : [245, Math.round(235 - 155 * t), Math.round(235 - 175 * t)];
}

/** A small visualization plane, not a numerical field data transfer. */
export function renderVerifiedFieldSlice(imported: ImportedQuantumScene, request: FieldSliceRequest): FieldSlice {
  const { field, real, imaginary, unit } = source(imported, request);
  const planeAxes = [0, 1, 2].filter(axis => axis !== request.axis) as [number, number];
  const width = field.grid.shape[planeAxes[0]], height = field.grid.shape[planeAxes[1]];
  const rgba = new Uint8Array(width * height * 4);
  let maximum = 0;
  if (request.quantity === "density" || request.quantity === "phase") maximum = densityMaximum(real, imaginary);
  else for (const value of request.quantity === "real" ? real : imaginary!) maximum = Math.max(maximum, Math.abs(value));
  const range: [number, number] = request.quantity === "phase" ? [-Math.PI, Math.PI]
    : request.quantity === "density" ? [0, maximum] : [maximum ? -maximum : 0, maximum];
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) {
    const grid = [0, 0, 0]; grid[request.axis] = request.index; grid[planeAxes[0]] = u; grid[planeAxes[1]] = v;
    const sourceIndex = flatIndex(field, grid);
    const pixel = ((height - 1 - v) * width + u) * 4;
    const [red, green, blue] = color(valueAt(real, imaginary, sourceIndex, request.quantity), request.quantity, maximum);
    rgba[pixel] = red; rgba[pixel + 1] = green; rgba[pixel + 2] = blue;
    rgba[pixel + 3] = request.quantity === "phase" &&
      real[sourceIndex] ** 2 + (imaginary?.[sourceIndex] ?? 0) ** 2 <= maximum * 1e-12 ? 0 : 255;
  }
  return { fieldId: field.id, axis: request.axis, index: request.index, quantity: request.quantity,
    width, height, rgba, range, unit, planeAxes };
}

export function inspectVerifiedFieldSample(imported: ImportedQuantumScene, request: FieldSampleRequest): FieldSample {
  const { field, real, imaginary, unit } = source(imported, request);
  const planeAxes = [0, 1, 2].filter(axis => axis !== request.axis);
  if (![request.u, request.v].every(Number.isSafeInteger) || request.u < 0 || request.v < 0 ||
      request.u >= field.grid.shape[planeAxes[0]] || request.v >= field.grid.shape[planeAxes[1]])
    throw new RangeError("Invalid field sample coordinates");
  const grid: [number, number, number] = [0, 0, 0];
  grid[request.axis] = request.index; grid[planeAxes[0]] = request.u; grid[planeAxes[1]] = request.v;
  const position = grid.map((index, axis) => field.grid.origin[axis] + index * field.grid.spacing[axis]) as [number, number, number];
  const index = flatIndex(field, grid);
  const undefinedNearNode = request.quantity === "phase" &&
    real[index] ** 2 + (imaginary?.[index] ?? 0) ** 2 <= densityMaximum(real, imaginary) * 1e-12;
  return { grid, position, value: undefinedNearNode ? null : valueAt(real, imaginary, index, request.quantity),
    unit, undefinedNearNode };
}
