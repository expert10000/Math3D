import { createVolumeDocument, type VolumeDocument } from "@math3d/core";
import type { VolumeDataset } from "../scene/datasets";

export type QuantumFieldVolume = {
  fingerprint: string; fieldId: string; label: string; kind: "scalar-field" | "complex-field";
  quantity: "real" | "imaginary" | "density" | "phase";
  encoding: "f64le-planar-real-imaginary"; sourceDatasets: string[]; sourceHashes: string[];
  shape: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number];
  axes: [string, string, string]; coordinateUnits: [string, string, string]; valueUnit: string;
  layout: "xyz-x-fastest"; phaseZeroPolicy: "zero-placeholder-masked";
  undefinedNodeCount: number; undefinedMask: Uint8Array; values: Float32Array;
};

/** Compact source document + ephemeral Volume dataset. Samples are never persisted in commands. */
export function adaptQuantumFieldVolume(volume: QuantumFieldVolume): { document: VolumeDocument; dataset: VolumeDataset } {
  const { shape, values, undefinedMask } = volume;
  if (volume.layout !== "xyz-x-fastest" || values.length !== shape[0] * shape[1] * shape[2] ||
      undefinedMask.length !== values.length || !values.every(Number.isFinite) ||
      !volume.sourceHashes.every(hash => /^[a-f0-9]{64}$/.test(hash)))
    throw new TypeError("Invalid verified Volume artifact");
  const handle = `quantum-scene:${volume.fingerprint}:${volume.fieldId}:${volume.quantity}`;
  const source = {
    representation: "dense-scalar-grid" as const,
    recipe: { kind: "quantum-scene-field", fingerprint: volume.fingerprint, fieldId: volume.fieldId,
      quantity: volume.quantity, encoding: volume.encoding, sourceDatasets: volume.sourceDatasets,
      sourceHashes: volume.sourceHashes, layout: volume.layout, axes: volume.axes,
      coordinateUnits: volume.coordinateUnits, phaseZeroPolicy: volume.phaseZeroPolicy },
    spatial: { dimensions: shape, origin: volume.origin, spacing: volume.spacing,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], centering: "point" as const,
      coordinateSystem: volume.axes.join("/"), positionUnits: volume.coordinateUnits.join("/"),
      valueUnits: volume.valueUnit },
    dependencies: [{ module: "external", objectId: volume.fingerprint, revision: 1, relation: "imported-from" }],
    payload: { handle, byteLength: values.byteLength, scalarType: "float32", components: 1 },
  };
  const document = createVolumeDocument({ stableKey: { handle }, source, metadata: { title: `${volume.label} · ${volume.quantity}` } });
  const dataset: VolumeDataset = { kind: "volume", sourceId: document.identity.id, label: document.metadata.title,
    note: `Read-only verified quantum-scene/v1 grid; f64le planar components converted to x-fastest float32. Source: ${volume.sourceDatasets.join(" + ")}.`,
    grid: { dims: [...shape], scalars: values, origin: [...volume.origin], spacing: [...volume.spacing],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], centering: "point" } };
  return { document, dataset };
}
