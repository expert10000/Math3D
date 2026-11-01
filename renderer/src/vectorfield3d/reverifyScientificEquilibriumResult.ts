import { canonicalJsonStringify, parseScientificSceneManifest,
  verifyVectorField3DEquilibriumResult, type AnalysisResultEnvelope,
  type VectorField3DDocument, type VectorField3DEquilibriumSearch,
  type VectorField3DVerifiedTile, type VectorField3DVolumes } from "@math3d/core";

export type ScientificEquilibriumBridge = Partial<Pick<NonNullable<Window["scientificScenes"]>,
  "openGraphDatasetReference" | "previewVectorVolume" | "previewVectorTiles" |
  "closeGraphDataset">>;
export class ScientificEquilibriumSourceError extends Error {
  readonly status: "missing" | "changed" | "error";
  constructor(status: "missing" | "changed" | "error", message: string) {
    super(message); this.status = status;
  }
}
export type ScientificEquilibriumReplay = (document: VectorField3DDocument,
  scientific: { manifestJson: string; fingerprint: string;
    volumes?: VectorField3DVolumes; tileMode?: boolean },
  options: { maxEvaluations: number; seedResolution: 3 | 5 },
  bridge: ScientificEquilibriumBridge) => Promise<VectorField3DEquilibriumSearch>;

const tileBuffers = (tiles: readonly VectorField3DVerifiedTile[]): ArrayBuffer[] => {
  const buffers = new Set<ArrayBuffer>();
  for (const tile of tiles) for (const part of tile.components)
    if (part.bytes.buffer instanceof ArrayBuffer) buffers.add(part.bytes.buffer);
  return [...buffers];
};

/** Replay the saved search in the bounded Field Explorer worker. */
export const runScientificEquilibriumWorker: ScientificEquilibriumReplay =
  (document, scientific, options, bridge) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./equilibriumWorker.ts", import.meta.url), { type: "module" });
    let finished = false;
    const finish = () => { if (!finished) { finished = true; worker.terminate(); } };
    worker.onmessage = (event: MessageEvent<
      { tileRequests: { indices: readonly (readonly [number, number, number])[] } } |
      { ok: true; result: VectorField3DEquilibriumSearch } |
      { ok: false; error: string }>) => {
      if ("tileRequests" in event.data) {
        const refs = document.source.field.kind === "scientific-bundle" ?
          document.source.field.references : null;
        if (!refs || !bridge.previewVectorTiles) {
          finish(); reject(new Error("Verified source tile service is unavailable.")); return;
        }
        void bridge.previewVectorTiles({ fingerprint: scientific.fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string],
          indicesBatch: event.data.tileRequests.indices.map(point => [...point] as
            [number, number, number]) })
          .then(tiles => { if (!finished) worker.postMessage({ tilesResponse: tiles },
            tileBuffers(tiles)); })
          .catch(cause => { if (!finished) { finish(); reject(cause); } });
        return;
      }
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = event => { finish(); reject(new Error(event.message ||
      "Equilibrium verification worker failed.")); };
    worker.postMessage({ document, scientific, options });
  });

/** Reopen pinned source bytes, rerun the search, and compare compact results. */
export async function reverifyScientificEquilibriumResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge?: ScientificEquilibriumBridge,
  replay: ScientificEquilibriumReplay = runScientificEquilibriumWorker):
  Promise<AnalysisResultEnvelope> {
  const field = document.source.field, parameters = saved.provenance.operation.parameters;
  if (field.kind !== "scientific-bundle" || !Array.isArray(parameters.sourceReferences) ||
      canonicalJsonStringify(parameters.sourceReferences) !==
        canonicalJsonStringify(field.references) || !parameters.verifiedSource)
    throw new ScientificEquilibriumSourceError("changed", "Saved equilibrium references changed.");
  if (!bridge?.openGraphDatasetReference || !bridge.closeGraphDataset)
    throw new ScientificEquilibriumSourceError("error", "Scientific source verifier is unavailable.");
  const first = field.references[0];
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok) throw new ScientificEquilibriumSourceError(opened.status,
    `Saved equilibrium source ${opened.status}: ${opened.error}`);
  const fingerprint = opened.source.fingerprint;
  try {
    if (fingerprint !== first.sceneFingerprint)
      throw new ScientificEquilibriumSourceError("changed", "Scientific scene fingerprint changed.");
    const manifest = parseScientificSceneManifest(opened.source.manifestJson);
    if (!manifest.ok)
      throw new ScientificEquilibriumSourceError("changed", manifest.errors.join(" "));
    if ((parameters.seedResolution !== 3 && parameters.seedResolution !== 5) ||
        typeof parameters.maxEvaluations !== "number" ||
        !Number.isSafeInteger(parameters.maxEvaluations))
      throw new ScientificEquilibriumSourceError("changed", "Saved solver settings changed.");
    const tileMode = manifest.value.schema === "scientific-scene/v3";
    if (tileMode ? !bridge.previewVectorTiles : !bridge.previewVectorVolume)
      throw new ScientificEquilibriumSourceError("error", "Verified scientific samples are unavailable.");
    const volumes = tileMode ? undefined : await bridge.previewVectorVolume!({ fingerprint,
      datasetId: first.datasetId, components: field.references.map(ref => ref.component) as
        [string, string, string] });
    const fresh = await replay(document, { manifestJson: opened.source.manifestJson,
      fingerprint, ...(tileMode ? { tileMode: true } : { volumes }) },
    { maxEvaluations: parameters.maxEvaluations,
      seedResolution: parameters.seedResolution }, bridge);
    return verifyVectorField3DEquilibriumResult(saved, document, fresh);
  } catch (cause) {
    if (cause instanceof ScientificEquilibriumSourceError) throw cause;
    throw new ScientificEquilibriumSourceError("changed",
      cause instanceof Error ? cause.message : String(cause));
  } finally { await bridge.closeGraphDataset(fingerprint); }
}
