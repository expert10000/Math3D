import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { isAbsolute, join, resolve } from "node:path";
import { inspectScientificHeightSample, openScientificHeightSurface,
  type ScientificHeightSurface } from "../scientificScene/heightSurface";
import { openScientificGraphDatasets, previewScientificGraphSlice, previewScientificGraphVolumeLine,
  previewScientificGraphVectorVolumeLine, previewScientificGraphComplexVolumeLines,
  previewScientificGraphPlane, previewScientificGraphVolume,
  previewScientificGraphVectorPlane, previewScientificGraphVectorVolume,
  previewScientificGraphVectorSamples, previewScientificGraphVectorTile,
  previewScientificGraphVectorTiles,
  type ScientificGraphDatasetSource } from "../scientificScene/graphDataset";
import { preparePythonPublisher, runPythonPublisher, type PreparedPythonPublisher,
  type PythonPublisherRun } from "../scientificScene/pythonPublisher";

export type ScientificSceneOpenResponse =
  | { ok: true; scene: ScientificHeightSurface & { sourceKind: "bundled" | "external";
      reference: { format: "scientific-scene/v1"; title: string; directory: string; sceneFingerprint: string } } }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };
export type ScientificGraphDatasetOpenResponse = { ok: true; source: ScientificGraphDatasetSource & { locator: Graph2DFieldLocator } } |
  { ok: false; canceled: true } | { ok: false; canceled: false; error: string };
export type ScientificGraphReferenceOpenResponse = { ok: true; source: ScientificGraphDatasetSource & { locator: Graph2DFieldLocator } } |
  { ok: false; status: "missing" | "changed" | "error"; error: string };
export type ScientificGraphRelinkPickResponse = { ok: true; source: Pick<ScientificGraphDatasetSource, "manifestJson" | "fingerprint"> & {
  locator: Graph2DFieldLocator; datasets: { datasetId: string; component: string;
    shape: [number, number] | [number, number, number] }[] } } |
  { ok: false; canceled: true } | { ok: false; canceled: false; error: string };
export type Graph2DFieldLocator = { kind: "directory" | "preset"; value: string };
const isGraph2DFieldLocator = (value: unknown): value is Graph2DFieldLocator =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === "kind,value" &&
  "kind" in value && "value" in value &&
  (value.kind === "preset" && typeof value.value === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value.value) ||
    value.kind === "directory" && typeof value.value === "string" && value.value.length >= 8 &&
    value.value.length <= 2048 && value.value.toLowerCase().endsWith(".sscene") && !/[\x00-\x1f]/.test(value.value));
export type PythonPublisherPrepareResponse =
  | { ok: true; sessionId: string; executable: string; script: string; spec: string; output: string;
      scriptSha256: string; specSha256: string; sourceHash: string; reference: boolean }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

const PINNED_SINCOS_MANIFEST = "6666afe57ad2876575b77c341bb8e8c6959d4a6cee14cc231d33eab39da9dbae";
const GRAPH_DATASET_PRESETS = {
  sincos: { directory: "sincos.sscene", fingerprint: PINNED_SINCOS_MANIFEST },
  thermal: { directory: "thermal-gradient.sscene", fingerprint: "bbcc6be51d2194a5e81498f0ad6bd7556c11a87c9d764d8c84a32be497a7320a" },
  quadraticPotential: { directory: "quadratic-potential.sscene", fingerprint: "5529e6f934f7b3a56dabcb5b8ab7ed199396501f7cad054689e278cb54a77add" },
  saddlePotential: { directory: "saddle-potential.sscene", fingerprint: "9d23dee2b7ffb0db2207235de66e25ac0c3ebb18ead3c53aaac49d04c0c095c1" },
  gaussianBump: { directory: "gaussian-bump.sscene", fingerprint: "a4172c7733fecf949d16b35251593bc7dd5764504069c54af460cdb2b4b761fd" },
  quadraticVolume: { directory: "quadratic-volume.sscene", fingerprint: "db00ba11b3cfa5aa22cb01aed988608bdbd226b859de5a9d79e571f9074a93b1" },
  complexWave: { directory: "complex-wave.sscene", fingerprint: "30861be84fbb0d762d55b21e2554fcd60c7bf543fb9689aeae5d3e9df9682135" },
  complexWaveVolume: { directory: "complex-wave-volume.sscene", fingerprint: "207290452e2066b36460e1b61e3bc09c18150ee147d5e2d3c9dd4fe4d92de0b4" },
  vortexFlow: { directory: "vortex-flow.sscene", fingerprint: "f06c249796ccd55de39ca3d27ce401e46ac1d34a6c469207613423383961fd01" },
  vortexVolume: { directory: "vortex-volume.sscene", fingerprint: "e117c3692fd2da6d549c7c93981e1a39b4c73609ae9e40ca9e3a63557bfc264c" },
} as const;
const PINNED_REFERENCE_PUBLISHER = "86b39c33be4551e2ab1a3c12299e7418e16ab1a79866e6881dd703a90952a974";
const bundledExampleDirectory = () => app.isPackaged ? join(process.resourcesPath, "scientific-scenes", "sincos.sscene") :
  join(app.getAppPath(), "tests", "fixtures", "scientific-scene", "sincos.sscene");
const trustedSender = (event: Electron.IpcMainInvokeEvent) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return !!window && !window.isDestroyed() && event.senderFrame === event.sender.mainFrame;
};
const referenceFor = (scene: ScientificHeightSurface, directory: string) => ({
  format: "scientific-scene/v1" as const, title: scene.manifest.title, directory,
  sceneFingerprint: scene.fingerprint,
});
const referenceRequest = (value: unknown): { directory: string; sceneFingerprint: string } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid scientific reference request");
  const request = value as Record<string, unknown>;
  if (Object.keys(request).sort().join(",") !== "directory,sceneFingerprint" ||
      typeof request.directory !== "string" || !isAbsolute(request.directory) ||
      !request.directory.toLowerCase().endsWith(".sscene") ||
      typeof request.sceneFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.sceneFingerprint))
    throw new TypeError("Invalid scientific reference request");
  return { directory: request.directory, sceneFingerprint: request.sceneFingerprint };
};

export function registerScientificSceneIpc(): void {
  const active = new WeakMap<Electron.WebContents, { directory: string; fingerprint: string }>();
  const graphActive = new WeakMap<Electron.WebContents, { directory: string; fingerprint: string }>();
  const prepared = new WeakMap<Electron.WebContents, PreparedPythonPublisher & { reference: boolean }>();
  const running = new WeakMap<Electron.WebContents, { jobId: string; handle: PythonPublisherRun }>();
  ipcMain.handle("scientificScenes:openGraphDataset", async (event, ...args: unknown[]): Promise<ScientificGraphDatasetOpenResponse> => {
    if (!trustedSender(event) || args.length) return { ok: false, canceled: false, error: "Invalid Graph dataset request" };
    graphActive.delete(event.sender);
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(window, { title: "Import verified scientific dataset into Graphs",
        properties: ["openDirectory"] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".sscene"))
        throw new TypeError("Choose a .sscene directory");
      const source = await openScientificGraphDatasets(directory);
      graphActive.set(event.sender, { directory, fingerprint: source.fingerprint });
      return { ok: true, source: { ...source, locator: { kind: "directory", value: directory } } };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("scientificScenes:openGraphDatasetPreset", async (event, ...args: unknown[]): Promise<ScientificGraphDatasetOpenResponse> => {
    if (!trustedSender(event) || args.length !== 1 || typeof args[0] !== "string" ||
        !Object.prototype.hasOwnProperty.call(GRAPH_DATASET_PRESETS, args[0]))
      return { ok: false, canceled: false, error: "Invalid Graph dataset preset" };
    graphActive.delete(event.sender);
    try {
      const preset = GRAPH_DATASET_PRESETS[args[0] as keyof typeof GRAPH_DATASET_PRESETS];
      const directory = app.isPackaged ? join(process.resourcesPath, "scientific-scenes", preset.directory) :
        join(app.getAppPath(), "tests", "fixtures", "scientific-scene", preset.directory);
      const source = await openScientificGraphDatasets(directory);
      if (source.fingerprint !== preset.fingerprint) throw new Error("Bundled Graph dataset preset changed");
      graphActive.set(event.sender, { directory, fingerprint: source.fingerprint });
      return { ok: true, source: { ...source, locator: { kind: "preset", value: args[0] } } };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("scientificScenes:openGraphDatasetReference", async (event, ...args: unknown[]): Promise<ScientificGraphReferenceOpenResponse> => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      return { ok: false, status: "error", error: "Invalid Graph field reference request." };
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "locator,sceneFingerprint" ||
        !isGraph2DFieldLocator(request.locator) ||
        request.locator.kind === "directory" && !isAbsolute(request.locator.value) ||
        typeof request.sceneFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.sceneFingerprint))
      return { ok: false, status: "error", error: "Invalid Graph field reference request." };
    const locator = request.locator as Graph2DFieldLocator;
    const directory = locator.kind === "preset" ?
      Object.prototype.hasOwnProperty.call(GRAPH_DATASET_PRESETS, locator.value) ?
        app.isPackaged ? join(process.resourcesPath, "scientific-scenes", GRAPH_DATASET_PRESETS[locator.value as keyof typeof GRAPH_DATASET_PRESETS].directory) :
          join(app.getAppPath(), "tests", "fixtures", "scientific-scene", GRAPH_DATASET_PRESETS[locator.value as keyof typeof GRAPH_DATASET_PRESETS].directory) : null : locator.value;
    if (!directory) return { ok: false, status: "error", error: "Unknown Graph field preset." };
    graphActive.delete(event.sender);
    try {
      const source = await openScientificGraphDatasets(directory);
      if (source.fingerprint !== request.sceneFingerprint)
        return { ok: false, status: "changed", error: "Saved field source has changed. Choose a matching source before viewing." };
      graphActive.set(event.sender, { directory, fingerprint: source.fingerprint });
      return { ok: true, source: { ...source, locator } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, status: /ENOENT|not found|does not exist|missing/i.test(message) ? "missing" :
        /integrity failed|checksum|fingerprint changed/i.test(message) ? "changed" : "error",
        error: message };
    }
  });
  ipcMain.handle("scientificScenes:chooseGraphDatasetRelink", async (event, ...args: unknown[]): Promise<ScientificGraphRelinkPickResponse> => {
    if (!trustedSender(event) || args.length) return { ok: false, canceled: false, error: "Invalid Graph field relink request." };
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(window, { title: "Choose replacement verified .sscene bundle",
        properties: ["openDirectory"] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".sscene"))
        throw new TypeError("Choose a .sscene directory");
      // This reads and hashes the complete bundle, but does not activate it for field previews.
      const source = await openScientificGraphDatasets(directory);
      const datasets = source.datasets.filter((part): part is Extract<typeof part, { shape: [number, number] | [number, number, number] }> =>
        Array.isArray(part.shape)).map(part => ({ datasetId: part.datasetId, component: part.component, shape: part.shape }));
      if (!datasets.length) throw new TypeError("Replacement bundle has no 2D or 3D field components.");
      return { ok: true, source: { manifestJson: source.manifestJson, fingerprint: source.fingerprint,
        locator: { kind: "directory", value: directory }, datasets } };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("scientificScenes:previewGraphSlice", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph slice request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !==
        (request.component === undefined ? "datasetId,fingerprint,fixedIndex,varyingAxis" : "component,datasetId,fingerprint,fixedIndex,varyingAxis") ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        (request.component !== undefined && (typeof request.component !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.component))) ||
        (request.varyingAxis !== 0 && request.varyingAxis !== 1) ||
        typeof request.fixedIndex !== "number" || !Number.isSafeInteger(request.fixedIndex))
      throw new TypeError("Invalid Graph slice request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphSlice(source.directory, source.fingerprint, request.datasetId,
      request.varyingAxis, request.fixedIndex, request.component as string | undefined);
  });
  ipcMain.handle("scientificScenes:previewGraphVolumeLine", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph volume line request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !==
        "datasetId,fingerprint,fixedIndex,normalAxis,planeFixedIndex,varyingAxis" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        ![0, 1, 2].includes(request.normalAxis as number) ||
        ![0, 1, 2].includes(request.varyingAxis as number) ||
        request.normalAxis === request.varyingAxis ||
        typeof request.planeFixedIndex !== "number" || !Number.isSafeInteger(request.planeFixedIndex) ||
        typeof request.fixedIndex !== "number" || !Number.isSafeInteger(request.fixedIndex))
      throw new TypeError("Invalid Graph volume line request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVolumeLine(source.directory, source.fingerprint, request.datasetId,
      request.normalAxis as 0 | 1 | 2, request.planeFixedIndex as number,
      request.varyingAxis as 0 | 1 | 2, request.fixedIndex as number);
  });
  ipcMain.handle("scientificScenes:previewGraphVectorVolumeLine", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph vector volume line request");
    const request = args[0] as Record<string, unknown>;
    const components = request.components;
    if (Object.keys(request).sort().join(",") !==
        "component,components,datasetId,fingerprint,fixedIndex,normalAxis,planeFixedIndex,varyingAxis" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        !Array.isArray(components) || components.length !== 3 ||
        components.some(value => typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value)) ||
        new Set(components).size !== 3 || typeof request.component !== "string" ||
        !components.includes(request.component) ||
        ![0, 1, 2].includes(request.normalAxis as number) ||
        ![0, 1, 2].includes(request.varyingAxis as number) ||
        request.normalAxis === request.varyingAxis ||
        typeof request.planeFixedIndex !== "number" || !Number.isSafeInteger(request.planeFixedIndex) ||
        typeof request.fixedIndex !== "number" || !Number.isSafeInteger(request.fixedIndex))
      throw new TypeError("Invalid Graph vector volume line request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorVolumeLine(source.directory, source.fingerprint, request.datasetId,
      components as [string, string, string], request.component,
      request.normalAxis as 0 | 1 | 2, request.planeFixedIndex as number,
      request.varyingAxis as 0 | 1 | 2, request.fixedIndex as number);
  });
  ipcMain.handle("scientificScenes:previewGraphComplexVolumeLines", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph complex volume line request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !==
        "datasetId,fingerprint,fixedIndex,normalAxis,planeFixedIndex,varyingAxis" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        ![0, 1, 2].includes(request.normalAxis as number) ||
        ![0, 1, 2].includes(request.varyingAxis as number) ||
        request.normalAxis === request.varyingAxis ||
        typeof request.planeFixedIndex !== "number" || !Number.isSafeInteger(request.planeFixedIndex) ||
        typeof request.fixedIndex !== "number" || !Number.isSafeInteger(request.fixedIndex))
      throw new TypeError("Invalid Graph complex volume line request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphComplexVolumeLines(source.directory, source.fingerprint, request.datasetId,
      request.normalAxis as 0 | 1 | 2, request.planeFixedIndex as number,
      request.varyingAxis as 0 | 1 | 2, request.fixedIndex as number);
  });
  ipcMain.handle("scientificScenes:previewGraphPlane", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph plane request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "component,datasetId,fingerprint,fixedIndex,normalAxis" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        typeof request.component !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.component) ||
        (request.normalAxis !== null && request.normalAxis !== 0 && request.normalAxis !== 1 && request.normalAxis !== 2) ||
        (request.fixedIndex !== null && (typeof request.fixedIndex !== "number" || !Number.isSafeInteger(request.fixedIndex))))
      throw new TypeError("Invalid Graph plane request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphPlane(source.directory, source.fingerprint, request.datasetId,
      request.component, request.normalAxis, request.fixedIndex);
  });
  ipcMain.handle("scientificScenes:previewVectorPlane", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid 2D vector-field request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "components,datasetId,fingerprint" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        !Array.isArray(request.components) || request.components.length !== 2 ||
        request.components.some(component => typeof component !== "string" ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(component)) ||
        new Set(request.components).size !== 2)
      throw new TypeError("Invalid 2D vector-field request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorPlane(source.directory, source.fingerprint, request.datasetId,
      request.components as [string, string]);
  });
  ipcMain.handle("scientificScenes:previewGraphVolume", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid Graph volume request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "component,datasetId,fingerprint" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        typeof request.component !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.component))
      throw new TypeError("Invalid Graph volume request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVolume(source.directory, source.fingerprint, request.datasetId, request.component);
  });
  ipcMain.handle("scientificScenes:previewVectorVolume", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid 3D vector-field request");
    const request = args[0] as Record<string, unknown>;
    if (!["components,datasetId,fingerprint", "components,datasetId,fingerprint,sampleLimit"]
      .includes(Object.keys(request).sort().join(",")) ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        (request.sampleLimit !== undefined && (!Number.isSafeInteger(request.sampleLimit) ||
          Number(request.sampleLimit) < 2 || Number(request.sampleLimit) > 32)) ||
        !Array.isArray(request.components) || request.components.length !== 3 ||
        request.components.some(component => typeof component !== "string" ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(component)) ||
        new Set(request.components).size !== 3)
      throw new TypeError("Invalid 3D vector-field request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorVolume(source.directory, source.fingerprint, request.datasetId,
      request.components as [string, string, string], request.sampleLimit as number | undefined);
  });
  ipcMain.handle("scientificScenes:previewVectorSamples", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new TypeError("Invalid sparse vector request");
    const request = args[0] as Record<string, unknown>;
    const selection = request.selection as Record<string, unknown> | undefined;
    const validSelection = selection && typeof selection === "object" && !Array.isArray(selection) &&
      ((selection.kind === "slice" || selection.kind === "stencil-slice" ||
        selection.kind === "source-stencil-slice") &&
        Object.keys(selection).sort().join(",") === "fixedIndex,kind,normalAxis" &&
        [0, 1, 2].includes(selection.normalAxis as number) && Number.isSafeInteger(selection.fixedIndex) ||
      (selection.kind === "probe" || selection.kind === "source-stencil-probe") &&
        Object.keys(selection).sort().join(",") === "indices,kind" &&
        Array.isArray(selection.indices) && selection.indices.length === 3 &&
        selection.indices.every(Number.isSafeInteger));
    if (Object.keys(request).sort().join(",") !== "components,datasetId,fingerprint,selection" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        !Array.isArray(request.components) || request.components.length !== 3 ||
        request.components.some(component => typeof component !== "string" ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(component)) ||
        new Set(request.components).size !== 3 || !validSelection)
      throw new TypeError("Invalid sparse vector request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorSamples(source.directory, source.fingerprint, request.datasetId,
      request.components as [string, string, string], selection as
        { kind: "slice" | "stencil-slice" | "source-stencil-slice";
          normalAxis: 0 | 1 | 2; fixedIndex: number } |
          { kind: "probe" | "source-stencil-probe"; indices: [number, number, number] });
  });
  ipcMain.handle("scientificScenes:previewVectorTile", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" ||
        Array.isArray(args[0])) throw new TypeError("Invalid vector tile request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "components,datasetId,fingerprint,indices" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        !Array.isArray(request.components) || request.components.length !== 3 ||
        request.components.some(name => typeof name !== "string" ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(name)) ||
        new Set(request.components).size !== 3 ||
        !Array.isArray(request.indices) || request.indices.length !== 3 ||
        request.indices.some(index => !Number.isSafeInteger(index)))
      throw new TypeError("Invalid vector tile request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint)
      throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorTile(source.directory, source.fingerprint, request.datasetId,
      request.components as [string, string, string], request.indices as [number, number, number]);
  });
  ipcMain.handle("scientificScenes:previewVectorTiles", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" ||
        Array.isArray(args[0])) throw new TypeError("Invalid vector tile batch request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "components,datasetId,fingerprint,indicesBatch" ||
        typeof request.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        typeof request.datasetId !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(request.datasetId) ||
        !Array.isArray(request.components) || request.components.length !== 3 ||
        request.components.some(name => typeof name !== "string" ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(name)) ||
        new Set(request.components).size !== 3 ||
        !Array.isArray(request.indicesBatch) || request.indicesBatch.length < 1 ||
        request.indicesBatch.length > 8 || request.indicesBatch.some(indices =>
          !Array.isArray(indices) || indices.length !== 3 ||
          indices.some(index => !Number.isSafeInteger(index))))
      throw new TypeError("Invalid vector tile batch request");
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint)
      throw new Error("Graph scientific source is not active");
    return previewScientificGraphVectorTiles(source.directory, source.fingerprint, request.datasetId,
      request.components as [string, string, string],
      request.indicesBatch as [number, number, number][]);
  });
  ipcMain.handle("scientificScenes:closeGraphDataset", (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || typeof args[0] !== "string" ||
        !/^[a-f0-9]{64}$/.test(args[0])) return false;
    const source = graphActive.get(event.sender);
    if (!source || source.fingerprint !== args[0]) return false;
    graphActive.delete(event.sender);
    return true;
  });
  ipcMain.handle("scientificScenes:preparePublisher", async (event, ...args: unknown[]): Promise<PythonPublisherPrepareResponse> => {
    if (!trustedSender(event) || args.length !== 1 || (args[0] !== "reference" && args[0] !== "custom") ||
        running.has(event.sender))
      return { ok: false, canceled: false, error: "Invalid Python publisher preparation request" };
    prepared.delete(event.sender);
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const choose = async (title: string, defaultPath?: string) => {
        const result = await dialog.showOpenDialog(window, { title, defaultPath, properties: ["openFile"] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      };
      const executable = await choose("Choose an independently managed Python executable");
      if (!executable) return { ok: false, canceled: true };
      const reference = args[0] === "reference";
      const script = reference ? (app.isPackaged ? join(process.resourcesPath, "scientific-publisher",
        "scientific_scene_publisher.py") : join(app.getAppPath(), "integrations", "python",
        "scientific_scene_publisher.py")) : await choose("Choose the trusted scientific-scene publisher .py script");
      if (!script) return { ok: false, canceled: true };
      const exampleSpec = reference ? (app.isPackaged ? join(process.resourcesPath, "scientific-publisher",
        "examples", "sincos-grid.json") : join(app.getAppPath(), "integrations", "python", "examples",
        "sincos-grid.json")) : undefined;
      const spec = await choose("Choose the local scientific field specification .json", exampleSpec);
      if (!spec) return { ok: false, canceled: true };
      const destination = await dialog.showSaveDialog(window, { title: "Choose a new .sscene output directory",
        defaultPath: "python-scene.sscene" });
      if (destination.canceled || !destination.filePath) return { ok: false, canceled: true };
      const session = await preparePythonPublisher(executable, script, spec, destination.filePath);
      if (reference && session.scriptSha256 !== PINNED_REFERENCE_PUBLISHER)
        throw new Error("Shipped reference publisher changed; execution refused");
      const selection = { ...session, reference };
      prepared.set(event.sender, selection);
      return { ok: true, ...selection };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("scientificScenes:runPublisher", async (event, ...args: unknown[]): Promise<ScientificSceneOpenResponse> => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      return { ok: false, canceled: false, error: "Invalid Python publisher run request" };
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "jobId,sessionId,sourceHash" ||
        typeof request.jobId !== "string" || !/^[a-f0-9-]{36}$/.test(request.jobId) ||
        typeof request.sessionId !== "string" || typeof request.sourceHash !== "string")
      return { ok: false, canceled: false, error: "Invalid Python publisher run request" };
    const session = prepared.get(event.sender);
    if (!session || running.has(event.sender) || session.sessionId !== request.sessionId ||
        session.sourceHash !== request.sourceHash)
      return { ok: false, canceled: false, error: "Python publisher session is not active" };
    prepared.delete(event.sender);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return { ok: false, canceled: false, error: "Python publisher window closed" };
    const approval = await dialog.showMessageBox(window, { type: "warning", title: "Run external Python code?",
      message: "This runs a local Python script with your account's permissions.",
      detail: `Publisher: ${session.reference ? "Math3D reference script" : "user-selected script"}\nPython: ${session.executable}\nScript: ${session.script}\nScript SHA-256: ${session.scriptSha256}\nSpec: ${session.spec}\nOutput: ${session.output}\n\nOnly run code and data you trust. Scene hashes do not authenticate the publisher.`,
      buttons: ["Run Python code", "Cancel"], defaultId: 1, cancelId: 1, noLink: true });
    if (approval.response !== 0 || !trustedSender(event)) return { ok: false, canceled: true };
    const handle = runPythonPublisher(session);
    running.set(event.sender, { jobId: request.jobId, handle });
    const onDestroyed = () => handle.cancel();
    event.sender.once("destroyed", onDestroyed);
    try {
      const scene = await handle.promise;
      active.set(event.sender, { directory: session.output, fingerprint: scene.fingerprint });
      return { ok: true, scene: { ...scene, sourceKind: "external", reference: referenceFor(scene, session.output) } };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      event.sender.removeListener("destroyed", onDestroyed);
      running.delete(event.sender);
    }
  });
  ipcMain.handle("scientificScenes:cancelPublisher", (event, ...args: unknown[]): boolean => {
    if (!trustedSender(event) || args.length !== 1 || typeof args[0] !== "string") return false;
    const job = running.get(event.sender);
    if (!job || job.jobId !== args[0]) return false;
    return job.handle.cancel();
  });
  ipcMain.handle("scientificScenes:openExample", async (event, ...args: unknown[]): Promise<ScientificSceneOpenResponse> => {
    if (!trustedSender(event) || args.length) return { ok: false, canceled: false, error: "Invalid scientific example request" };
    try {
      const directory = bundledExampleDirectory();
      const scene = await openScientificHeightSurface(directory);
      if (scene.fingerprint !== PINNED_SINCOS_MANIFEST) throw new Error("Bundled scientific example changed");
      active.set(event.sender, { directory, fingerprint: scene.fingerprint });
      return { ok: true, scene: { ...scene, sourceKind: "bundled", reference: referenceFor(scene, directory) } };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("scientificScenes:openDirectory", async (event, ...args: unknown[]): Promise<ScientificSceneOpenResponse> => {
    if (!trustedSender(event) || args.length)
      return { ok: false, canceled: false, error: "Invalid scientific scene open request" };
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(window, { title: "Open scientific-scene/v1 bundle",
        properties: ["openDirectory"] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".sscene"))
        throw new TypeError("Choose a .sscene directory");
      const scene = await openScientificHeightSurface(directory);
      active.set(event.sender, { directory, fingerprint: scene.fingerprint });
      return { ok: true, scene: { ...scene, sourceKind: "external", reference: referenceFor(scene, directory) } };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("scientificScenes:openReference", async (event, ...args: unknown[]): Promise<ScientificSceneOpenResponse> => {
    if (!trustedSender(event) || args.length !== 1)
      return { ok: false, canceled: false, error: "Invalid scientific reference request" };
    try {
      const reference = referenceRequest(args[0]);
      const scene = await openScientificHeightSurface(reference.directory);
      if (scene.fingerprint !== reference.sceneFingerprint) throw new Error("Scientific source fingerprint changed");
      const bundled = resolve(reference.directory) === resolve(bundledExampleDirectory());
      if (bundled && scene.fingerprint !== PINNED_SINCOS_MANIFEST) throw new Error("Bundled scientific example changed");
      active.set(event.sender, { directory: reference.directory, fingerprint: scene.fingerprint });
      return { ok: true, scene: { ...scene, sourceKind: bundled ? "bundled" : "external", reference: referenceFor(scene, reference.directory) } };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("scientificScenes:pickMatchingReference", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || typeof args[0] !== "string" || !/^[a-f0-9]{64}$/.test(args[0]))
      return { ok: false, canceled: false, error: "Invalid scientific relink request" };
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(window, { title: "Relink exact scientific-scene/v1 bundle",
        properties: ["openDirectory"] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".sscene")) throw new TypeError("Choose a .sscene directory");
      const scene = await openScientificHeightSurface(directory);
      if (scene.fingerprint !== args[0]) throw new Error("Selected scientific scene fingerprint does not match the saved Project link");
      return { ok: true, reference: referenceFor(scene, directory) };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("scientificScenes:sample", async (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0]))
      throw new Error("Invalid scientific sample request");
    const request = args[0] as Record<string, unknown>;
    if (Object.keys(request).sort().join(",") !== "datasetId,fingerprint,sampleIndex" ||
        typeof request.fingerprint !== "string" || typeof request.datasetId !== "string" ||
        typeof request.sampleIndex !== "number") throw new Error("Invalid scientific sample request");
    const source = active.get(event.sender);
    if (!source || source.fingerprint !== request.fingerprint) throw new Error("Scientific source is not active");
    return inspectScientificHeightSample(source.directory, source.fingerprint, request.datasetId, request.sampleIndex);
  });
  ipcMain.handle("scientificScenes:close", (event, ...args: unknown[]) => {
    if (!trustedSender(event) || args.length !== 1 || typeof args[0] !== "string" ||
        !/^[a-f0-9]{64}$/.test(args[0])) throw new Error("Invalid scientific scene close request");
    const source = active.get(event.sender);
    if (!source || source.fingerprint !== args[0]) return false;
    active.delete(event.sender);
    return true;
  });
}
