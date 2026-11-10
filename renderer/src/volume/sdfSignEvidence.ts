import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { VolumeSdfSignDiagnostics } from "./contracts";

export const fingerprintSdfSourceMesh = (mesh: Pick<SurfaceMeshData, "positions" | "indices" | "source">): string => {
  let hash = 2166136261;
  const update = (bytes: Uint8Array) => { for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619); };
  update(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  if (mesh.indices) update(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength));
  for (const character of JSON.stringify(mesh.source)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${mesh.positions.length}:${mesh.indices?.length ?? 0}:${(hash >>> 0).toString(36)}`;
};

export const qualifySdfSignEvidence = (
  diagnostics: VolumeSdfSignDiagnostics | null,
  recordedFingerprint: string | null,
  currentFingerprint: string | null,
  sourceEvidence: "live" | "imported" = "live",
): { status: "current" | "historical" | "unavailable"; diagnostics: VolumeSdfSignDiagnostics | null; reason: string } => {
  if (!diagnostics || !recordedFingerprint) return { status: "unavailable", diagnostics: null, reason: "No mesh-bound sign evidence is available." };
  if (sourceEvidence === "imported") return { status: "historical", diagnostics: null, reason: "Imported sign diagnostics are recorded provenance, not live mesh evidence." };
  if (!currentFingerprint || recordedFingerprint !== currentFingerprint)
    return { status: "historical", diagnostics: null, reason: "The source mesh changed; sign measurements are historical." };
  return { status: "current", diagnostics, reason: diagnostics.reliable ?
    "Sign diagnostics match the current mesh." : "Current mesh sign diagnostics do not support reliable signed distance." };
};
