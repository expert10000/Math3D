import type { ImportedQuantumScene } from "./importer";

export type FieldVolumeQuantity = "real" | "imaginary" | "density" | "phase";
export type FieldVolumeRequest = { fingerprint: string; fieldId: string; quantity: FieldVolumeQuantity; requestId: string };
export type FieldVolume = {
  fingerprint: string; fieldId: string; label: string; kind: "scalar-field" | "complex-field";
  quantity: FieldVolumeQuantity; encoding: "f64le-planar-real-imaginary";
  sourceDatasets: string[]; sourceHashes: string[];
  shape: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number];
  axes: [string, string, string]; coordinateUnits: [string, string, string]; valueUnit: string;
  layout: "xyz-x-fastest"; phaseZeroPolicy: "zero-placeholder-masked";
  undefinedNodeCount: number; undefinedMask: Uint8Array; values: Float32Array;
};

/** Read-only conversion from verified planar f64le, z-fastest QVIS data to Math3D's x-fastest Volume grid. */
export function deriveVerifiedFieldVolume(imported: ImportedQuantumScene, request: FieldVolumeRequest): FieldVolume {
  const field = imported.source.fields?.find(candidate => candidate.id === request.fieldId);
  if (!field) throw new TypeError("Unknown verified scene field");
  if (!["real", "imaginary", "density", "phase"].includes(request.quantity) ||
      (field.kind === "scalar-field" && request.quantity !== "real")) throw new TypeError("Unsupported field quantity");
  const realDataset = imported.source.datasets.find(candidate => candidate.id === field.real);
  const imaginaryDataset = field.imaginary ? imported.source.datasets.find(candidate => candidate.id === field.imaginary) : undefined;
  const real = imported.arrays.get(field.real), imaginary = field.imaginary ? imported.arrays.get(field.imaginary) : undefined;
  if (!realDataset || !real || (field.kind === "complex-field" && (!imaginaryDataset || !imaginary)))
    throw new TypeError("Verified field components unavailable");
  if (imaginaryDataset && imaginaryDataset.unit !== realDataset.unit)
    throw new TypeError("Complex field components have different units");
  const [nx, ny, nz] = field.grid.shape;
  const values = new Float32Array(real.length), undefinedMask = new Uint8Array(real.length);
  let maximumDensity = 0;
  if (request.quantity === "phase") for (let i = 0; i < real.length; i++)
    maximumDensity = Math.max(maximumDensity, real[i] ** 2 + (imaginary?.[i] ?? 0) ** 2);
  let undefinedNodeCount = 0;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const sourceIndex = (x * ny + y) * nz + z;
    const targetIndex = (z * ny + y) * nx + x;
    const re = real[sourceIndex], im = imaginary?.[sourceIndex] ?? 0;
    const isUndefined = request.quantity === "phase" && re * re + im * im <= maximumDensity * 1e-12;
    if (isUndefined) { undefinedMask[targetIndex] = 1; undefinedNodeCount++; }
    const value = request.quantity === "real" ? re : request.quantity === "imaginary" ? im :
      request.quantity === "density" ? re * re + im * im : isUndefined ? 0 : Math.atan2(im, re);
    if (!Number.isFinite(value) || Math.abs(value) > 3.4028234663852886e38)
      throw new RangeError("Field quantity exceeds Math3D Volume float32 range");
    values[targetIndex] = value;
  }
  const amplitudeUnit = realDataset.unit;
  const valueUnit = request.quantity === "phase" ? "rad" : request.quantity === "density" ?
    amplitudeUnit === "a0^-3/2" ? "a0^-3" : amplitudeUnit === "dimensionless" ? amplitudeUnit : `(${amplitudeUnit})²` : amplitudeUnit;
  return { fingerprint: request.fingerprint, fieldId: field.id, label: field.label, kind: field.kind,
    quantity: request.quantity, encoding: "f64le-planar-real-imaginary",
    sourceDatasets: [field.real, ...(field.imaginary ? [field.imaginary] : [])],
    sourceHashes: [realDataset.sha256, ...(imaginaryDataset ? [imaginaryDataset.sha256] : [])],
    shape: [...field.grid.shape], origin: [...field.grid.origin], spacing: [...field.grid.spacing],
    axes: [...imported.source.coordinates.axes], coordinateUnits: [...imported.source.coordinates.units], valueUnit,
    layout: "xyz-x-fastest", phaseZeroPolicy: "zero-placeholder-masked", undefinedNodeCount, undefinedMask, values };
}
