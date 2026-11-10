import type { VolumeGrid } from "../scene/datasets";
import type { VolumeSdfMetadata } from "./contracts";
import type { ScientificVolumeMetadata } from "./scientificIO";
import { fingerprintSdfGrid } from "./sdfPreviewPin";

const gridFrom = (metadata: ScientificVolumeMetadata, values: Float32Array): VolumeGrid => ({
  dims: [...metadata.dimensions], origin: [...metadata.origin], spacing: [...metadata.spacing],
  direction: [...metadata.direction], centering: metadata.centering, scalars: values,
});

export const encodeSdfScientificSidecar = (
  sdf: VolumeSdfMetadata,
  metadata: ScientificVolumeMetadata,
  values: Float32Array,
): Uint8Array => {
  if (metadata.scalarType !== "float32" || metadata.components !== 1)
    throw new Error("SDF scientific sidecars require one float32 component.");
  const fingerprint = fingerprintSdfGrid(gridFrom(metadata, values));
  if (sdf.outputGridFingerprint !== fingerprint)
    throw new Error("SDF source grid changed before scientific export.");
  return new TextEncoder().encode(JSON.stringify({ schema: "math3d.sdf-scientific/v1", fingerprint, sdf }, null, 2));
};

export const decodeSdfScientificSidecar = (
  bytes: Uint8Array,
  metadata: ScientificVolumeMetadata,
  values: Float32Array,
): VolumeSdfMetadata => {
  if (metadata.scalarType !== "float32" || metadata.components !== 1)
    throw new Error("SDF scientific sidecars require one float32 component.");
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("Malformed SDF scientific sidecar."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Malformed SDF scientific sidecar.");
  const packageData = parsed as Record<string, unknown>;
  const sdf = packageData.sdf as VolumeSdfMetadata | undefined;
  if (packageData.schema !== "math3d.sdf-scientific/v1" || !sdf ||
      !["occupancy", "unsigned-distance", "signed-distance"].includes(sdf.output) ||
      !Array.isArray(sdf.sources) || !sdf.sign || typeof sdf.sign.reliable !== "boolean" ||
      typeof sdf.backend !== "string" || !sdf.sampling || !Array.isArray(sdf.sampling.dimensions) ||
      typeof sdf.outputGridFingerprint !== "string")
    throw new Error("SDF scientific sidecar schema is invalid.");
  const actual = fingerprintSdfGrid(gridFrom(metadata, values));
  if (packageData.fingerprint !== actual || sdf.outputGridFingerprint !== actual)
    throw new Error("SDF scientific sidecar does not match imported sample bytes or grid placement.");
  return { ...sdf, sourceEvidence: "imported" };
};
