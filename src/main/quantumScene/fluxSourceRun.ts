import type { ImportedQuantumScene } from "./importer";
import { inspectVerifiedScalarSample } from "./scalarSelection";

export type FluxSourceRunRequest = { fingerprint: string; objectId: string; sampleIndex: number;
  runId: string; resultSha256: string };
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const LINE = /^(\d+)\/(\d+) · run ([A-Za-z0-9_-]{1,100}) · SHA-256 ([a-f0-9]{64}) · S:[YN] · G:.+ · H:(?:undefined|-?(?:\d+(?:\.\d*)?|\.\d+)) e²\/h$/;

/** Resolve an exact point to its producer run; the study ID is never a run. */
export function resolveFluxSourceRun(imported: ImportedQuantumScene, request: FluxSourceRunRequest) {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).sort().join(",") !== "fingerprint,objectId,resultSha256,runId,sampleIndex" ||
      typeof request.fingerprint !== "string" || !SHA.test(request.fingerprint) ||
      typeof request.objectId !== "string" || !/^flux-(?:0|[1-9]\d{0,2})$/.test(request.objectId) ||
      !Number.isSafeInteger(request.sampleIndex) || request.sampleIndex < 0 ||
      typeof request.runId !== "string" || !ID.test(request.runId) ||
      typeof request.resultSha256 !== "string" || !SHA.test(request.resultSha256))
    throw new TypeError("Invalid flux source point request");
  const scene = imported.source;
  if (scene.provenance.model !== "hofstadter_flux_sweep" || scene.provenance.kind !== "numerical-result")
    throw new Error("Selected scene is not a verified Hofstadter flux study");
  const sample = inspectVerifiedScalarSample(imported, request);
  if (sample.positionDatasetId !== `${request.objectId}-positions` ||
      sample.valueDatasetId !== `${request.objectId}-energy` || sample.valueUnit !== "hopping energy" ||
      sample.coordinateUnits[0] !== "flux quanta per plaquette" || sample.position[1] !== sample.value ||
      sample.position[2] !== 0) throw new Error("Flux point does not match its verified energy dataset");
  const index = request.objectId.slice(5);
  const annotation = scene.annotations.find(item => item.id === `source-${index}`);
  const parsed = annotation?.text.match(LINE);
  if (!parsed || Number(parsed[2]) < 1 || Number(parsed[1]) >= Number(parsed[2]) ||
      Math.abs(Number(parsed[1]) / Number(parsed[2]) - sample.position[0]) > 1e-12 ||
      parsed[3] !== request.runId || parsed[4] !== request.resultSha256)
    throw new Error("Flux point source identity differs from verified annotations");
  return { runId: parsed[3], resultSha256: parsed[4], flux: `${parsed[1]}/${parsed[2]}`,
    energy: sample.value, energyUnit: sample.valueUnit, sampleIndex: sample.sampleIndex };
}
