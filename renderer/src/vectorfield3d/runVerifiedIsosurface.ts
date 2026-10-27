import type { VectorField3DClipBounds, VectorField3DDocument,
  VectorField3DIsosurface, VectorField3DVerifiedTile, VectorField3DVolumes } from "@math3d/core";

export type VerifiedIsosurfaceRecipe = Readonly<{
  level: number; clipBounds: VectorField3DClipBounds; triangleBudget: number;
}>;

const buffersOf = (tiles: readonly VectorField3DVerifiedTile[]): ArrayBuffer[] => {
  const buffers = new Set<ArrayBuffer>();
  for (const tile of tiles) for (const component of tile.components)
    if (component.bytes.buffer instanceof ArrayBuffer) buffers.add(component.bytes.buffer);
  return [...buffers];
};

/** The same bounded worker and manifest-pinned tile service used by Field Explorer. */
export async function runVerifiedIsosurface(document: VectorField3DDocument,
  recipe: VerifiedIsosurfaceRecipe, options: { signal?: AbortSignal;
    onStatus?: (message: string) => void;
    bridge?: Window["scientificScenes"] } = {}): Promise<VectorField3DIsosurface> {
  if (!Number.isFinite(recipe.level) || recipe.level < 0 || recipe.level > 1e9 ||
      !Number.isSafeInteger(recipe.triangleBudget) || recipe.triangleBudget < 1 ||
      recipe.triangleBudget > 100_000)
    throw new TypeError("The saved isosurface level or triangle budget is invalid.");
  const aborted = () => {
    if (options.signal?.aborted) throw new Error("Isosurface rebuild cancelled.");
  };
  const bridge = options.bridge ?? window.scientificScenes;
  let fingerprint: string | null = null;
  try {
    aborted();
    let scientific: { manifestJson: string; fingerprint: string;
      volumes?: VectorField3DVolumes; tileMode?: boolean } | undefined;
    if (document.source.field.kind === "scientific-bundle") {
      const refs = document.source.field.references;
      if (!bridge?.openGraphDatasetReference)
        throw new Error("The desktop source verifier is unavailable.");
      options.onStatus?.("Opening the saved scientific source…");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      aborted();
      if (JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3") {
        if (!bridge.previewVectorTiles)
          throw new Error("Verified source tile service is unavailable.");
        scientific = { manifestJson: opened.source.manifestJson, fingerprint, tileMode: true };
      } else {
        if (!bridge.previewVectorVolume)
          throw new Error("Verified source volume service is unavailable.");
        options.onStatus?.("Verifying the bounded source volume…");
        const volumes = await bridge.previewVectorVolume({ fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string] });
        scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
      }
    }
    aborted();
    options.onStatus?.("Extracting the saved speed isosurface…");
    return await new Promise<VectorField3DIsosurface>((resolve, reject) => {
      const worker = new Worker(new URL("./isosurfaceWorker.ts", import.meta.url),
        { type: "module" });
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true; options.signal?.removeEventListener("abort", onAbort);
        worker.terminate(); return true;
      };
      const fail = (cause: unknown) => {
        if (finish()) reject(cause instanceof Error ? cause : new Error(String(cause)));
      };
      const onAbort = () => fail(new Error("Isosurface rebuild cancelled."));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) { onAbort(); return; }
      worker.onmessage = (event: MessageEvent<
        { tileRequests: { indices: readonly (readonly [number, number, number])[] } } |
        { ok: true; result: VectorField3DIsosurface } | { ok: false; error: string }>) => {
        if ("tileRequests" in event.data) {
          const refs = document.source.field.kind === "scientific-bundle" ?
            document.source.field.references : null;
          if (!scientific || !refs || !bridge?.previewVectorTiles) {
            fail(new Error("Verified source tile service is unavailable.")); return;
          }
          void bridge.previewVectorTiles({ fingerprint: scientific.fingerprint,
            datasetId: refs[0].datasetId,
            components: refs.map(ref => ref.component) as [string, string, string],
            indicesBatch: event.data.tileRequests.indices.map(indices =>
              [...indices] as [number, number, number]) })
            .then(tiles => { if (!finished) worker.postMessage({ tilesResponse: tiles },
              buffersOf(tiles)); })
            .catch(fail);
          return;
        }
        if (finish()) event.data.ok ? resolve(event.data.result) :
          reject(new Error(event.data.error));
      };
      worker.onerror = event => fail(new Error(event.message || "Isosurface worker failed."));
      worker.postMessage({ document, clipBounds: recipe.clipBounds,
        level: recipe.level, triangleBudget: recipe.triangleBudget, scientific });
    });
  } finally {
    if (fingerprint) await bridge?.closeGraphDataset(fingerprint);
  }
}
