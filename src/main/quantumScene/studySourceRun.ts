import type { ImportedQuantumScene } from "./importer";
import { inspectVerifiedScalarSample } from "./scalarSelection";

export type StudySourceRunRequest = { fingerprint: string; series: "periodic" | "chain";
  sampleIndex: number; runId: string; resultSha256: string };
export type StudySourceRunIdentity = { runId: string; resultSha256: string };
const sourceLine = /^Run ([A-Za-z0-9_-]{1,100}) · result SHA-256 ([a-f0-9]{64})$/;
const number = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)";
const periodicLine = new RegExp(`^Periodic · duration ${number} inverse hopping energy · charge ${number} electron charge / cell · (resolved|gap-closed|unresolved) · .+$`);
const chainLine = new RegExp(`^Chain · width ${number} cells · central-bond charge ${number} electron charge · (resolved|size-sensitive|unresolved) · .+$`);

/** Derive one run identity from the newly reverified bundle, never from renderer-supplied IDs alone. */
export function resolveStudySourceRun(imported: ImportedQuantumScene, request: StudySourceRunRequest): StudySourceRunIdentity {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).sort().join(",") !== "fingerprint,resultSha256,runId,sampleIndex,series" ||
      typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
      (request.series !== "periodic" && request.series !== "chain") ||
      !Number.isSafeInteger(request.sampleIndex) || request.sampleIndex < 0 || request.sampleIndex > 31 ||
      typeof request.runId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(request.runId) ||
      typeof request.resultSha256 !== "string" || !/^[a-f0-9]{64}$/.test(request.resultSha256))
    throw new TypeError("Invalid selected study source request");
  const scene = imported.source;
  if (scene.provenance.model !== "rice_mele_convergence_study" || scene.provenance.kind !== "numerical-result")
    throw new Error("Selected scene is not a Rice–Mele saved-run study");
  const sample = inspectVerifiedScalarSample(imported, { fingerprint: request.fingerprint,
    objectId: `${request.series}-points`, sampleIndex: request.sampleIndex });
  const unit = request.series === "periodic" ? "electron charge / cell" : "electron charge";
  if (sample.valueUnit !== unit || sample.valueDatasetId !== `${request.series}-recorded-charge`)
    throw new Error("Selected study point has unexpected data or units");
  const prefix = `${request.series}-${request.sampleIndex}`;
  const note = scene.annotations.find(item => item.id === prefix);
  const source = scene.annotations.find(item => item.id === `${prefix}-source`);
  const values = note?.text.match(request.series === "periodic" ? periodicLine : chainLine);
  const identity = source?.text.match(sourceLine);
  if (!note || !values || !identity || !Number.isFinite(Number(values[1])) ||
      !Number.isFinite(Number(values[2])) || Number(values[2]) !== sample.value ||
      sample.position.some((value, index) => Math.abs(value - note.position[index]) > 1e-12) ||
      identity[1] !== request.runId || identity[2] !== request.resultSha256)
    throw new Error("Selected run identity or value does not match the verified study point");
  if (request.series === "chain" && !Number.isSafeInteger(Number(values[1])))
    throw new Error("Selected chain width is invalid");
  return { runId: identity[1], resultSha256: identity[2] };
}
