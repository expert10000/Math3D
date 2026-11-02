import { canonicalJsonStringify, parseScientificSceneManifest,
  verifyVectorField3DTrajectoryResult, type AnalysisResultEnvelope,
  type VectorField3DDocument, type VectorField3DTrajectoryArtifact,
  type VectorField3DVerifiedTile, type VectorField3DVolumes } from "@math3d/core";

export type ScientificTrajectoryBridge = Partial<Pick<NonNullable<Window["scientificScenes"]>,
  "openGraphDatasetReference" | "previewVectorVolume" | "previewVectorTile" |
  "closeGraphDataset">>;
export type ScientificTrajectorySourceStatus = "missing" | "changed" | "error";
export class ScientificTrajectorySourceError extends Error {
  readonly status: ScientificTrajectorySourceStatus;
  constructor(status: ScientificTrajectorySourceStatus, message: string) {
    super(message); this.status = status;
  }
}
export type ScientificTrajectoryReplay = (document: VectorField3DDocument,
  direction: "forward" | "backward", scientific: { manifestJson: string;
    fingerprint: string; volumes?: VectorField3DVolumes; tileMode?: boolean },
  bridge: ScientificTrajectoryBridge) => Promise<VectorField3DTrajectoryArtifact>;

const tileTransferBuffers = (tile: VectorField3DVerifiedTile): ArrayBuffer[] => {
  const buffers = new Set<ArrayBuffer>();
  for (const part of tile.components)
    if (part.bytes.buffer instanceof ArrayBuffer) buffers.add(part.bytes.buffer);
  return [...buffers];
};

/** The same bounded trajectory worker used by Field Explorer, with fresh source bytes. */
export const runScientificTrajectoryWorker: ScientificTrajectoryReplay =
  (document, direction, scientific, bridge) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./trajectoryWorker.ts", import.meta.url), { type: "module" });
      let finished = false;
      const finish = () => { if (!finished) { finished = true; worker.terminate(); } };
      worker.onmessage = (event: MessageEvent<
        { tileRequest: { indices: [number, number, number] } } |
        { progress: unknown } |
        { ok: true; result: VectorField3DTrajectoryArtifact } |
        { ok: false; error: string }>) => {
        if ("tileRequest" in event.data) {
          const refs = document.source.field.kind === "scientific-bundle" ?
            document.source.field.references : null;
          if (!refs || !bridge.previewVectorTile) {
            finish(); reject(new Error("Verified source tile service is unavailable.")); return;
          }
          void bridge.previewVectorTile({ fingerprint: scientific.fingerprint,
            datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
              [string, string, string], indices: event.data.tileRequest.indices })
            .then(tile => { if (!finished) worker.postMessage({ tileResponse: tile },
              tileTransferBuffers(tile)); })
            .catch(cause => { if (!finished) { finish(); reject(cause); } });
          return;
        }
        if ("progress" in event.data) return;
        finish();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      worker.onerror = event => { finish(); reject(new Error(event.message ||
        "Trajectory verification worker failed.")); };
      worker.postMessage({ document, direction, scientific });
    });

/** Reopen the pinned scene, replay its verified samples, then compare every saved figure. */
export async function reverifyScientificTrajectoryResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge?: ScientificTrajectoryBridge,
  replay: ScientificTrajectoryReplay = runScientificTrajectoryWorker): Promise<AnalysisResultEnvelope> {
  const field = document.source.field;
  if (field.kind !== "scientific-bundle" ||
      !Array.isArray(saved.provenance.operation.parameters.sourceReferences) ||
      canonicalJsonStringify(saved.provenance.operation.parameters.sourceReferences) !==
        canonicalJsonStringify(field.references) ||
      !saved.provenance.operation.parameters.verifiedSource)
    throw new ScientificTrajectorySourceError("changed", "Saved measured trajectory references changed.");
  if (!bridge?.openGraphDatasetReference || !bridge.closeGraphDataset)
    throw new ScientificTrajectorySourceError("error", "Scientific source verifier is unavailable.");
  const first = field.references[0];
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok)
    throw new ScientificTrajectorySourceError(opened.status,
      `Saved trajectory source ${opened.status}: ${opened.error}`);
  const fingerprint = opened.source.fingerprint;
  try {
    if (fingerprint !== first.sceneFingerprint)
      throw new ScientificTrajectorySourceError("changed", "Scientific scene fingerprint changed.");
    const manifest = parseScientificSceneManifest(opened.source.manifestJson);
    if (!manifest.ok)
      throw new ScientificTrajectorySourceError("changed", manifest.errors.join(" "));
    const direction = saved.provenance.operation.parameters.direction;
    if (direction !== "forward" && direction !== "backward")
      throw new ScientificTrajectorySourceError("changed", "Saved trajectory direction changed.");
    const tileMode = manifest.value.schema === "scientific-scene/v3";
    if (tileMode ? !bridge.previewVectorTile : !bridge.previewVectorVolume)
      throw new ScientificTrajectorySourceError("error", "Verified scientific samples are unavailable.");
    const volumes = tileMode ? undefined : await bridge.previewVectorVolume!({ fingerprint,
      datasetId: first.datasetId, components: field.references.map(ref => ref.component) as
        [string, string, string] });
    const fresh = await replay(document, direction, {
      manifestJson: opened.source.manifestJson, fingerprint,
      ...(tileMode ? { tileMode: true } : { volumes }) }, bridge);
    return verifyVectorField3DTrajectoryResult(saved, document, fresh);
  } catch (cause) {
    if (cause instanceof ScientificTrajectorySourceError) throw cause;
    throw new ScientificTrajectorySourceError("changed",
      cause instanceof Error ? cause.message : String(cause));
  } finally { await bridge.closeGraphDataset(fingerprint); }
}
