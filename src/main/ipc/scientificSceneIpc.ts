import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { isAbsolute, join, resolve } from "node:path";
import { inspectScientificHeightSample, openScientificHeightSurface,
  type ScientificHeightSurface } from "../scientificScene/heightSurface";
import { openScientificGraphDatasets, type ScientificGraphDatasetSource } from "../scientificScene/graphDataset";
import { preparePythonPublisher, runPythonPublisher, type PreparedPythonPublisher,
  type PythonPublisherRun } from "../scientificScene/pythonPublisher";

export type ScientificSceneOpenResponse =
  | { ok: true; scene: ScientificHeightSurface & { sourceKind: "bundled" | "external";
      reference: { format: "scientific-scene/v1"; title: string; directory: string; sceneFingerprint: string } } }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };
export type ScientificGraphDatasetOpenResponse = { ok: true; source: ScientificGraphDatasetSource } |
  { ok: false; canceled: true } | { ok: false; canceled: false; error: string };
export type PythonPublisherPrepareResponse =
  | { ok: true; sessionId: string; executable: string; script: string; spec: string; output: string;
      scriptSha256: string; specSha256: string; sourceHash: string; reference: boolean }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

const PINNED_SINCOS_MANIFEST = "6666afe57ad2876575b77c341bb8e8c6959d4a6cee14cc231d33eab39da9dbae";
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
  const prepared = new WeakMap<Electron.WebContents, PreparedPythonPublisher & { reference: boolean }>();
  const running = new WeakMap<Electron.WebContents, { jobId: string; handle: PythonPublisherRun }>();
  ipcMain.handle("scientificScenes:openGraphDataset", async (event, ...args: unknown[]): Promise<ScientificGraphDatasetOpenResponse> => {
    if (!trustedSender(event) || args.length) return { ok: false, canceled: false, error: "Invalid Graph dataset request" };
    try {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(window, { title: "Import verified 1D scientific dataset into Graphs",
        properties: ["openDirectory"] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".sscene"))
        throw new TypeError("Choose a .sscene directory");
      return { ok: true, source: await openScientificGraphDatasets(directory) };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
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
