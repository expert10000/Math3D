import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { inspectScientificHeightSample, openScientificHeightSurface,
  type ScientificHeightSurface } from "../scientificScene/heightSurface";

export type ScientificSceneOpenResponse =
  | { ok: true; scene: ScientificHeightSurface }
  | { ok: false; error: string };

const PINNED_SINCOS_MANIFEST = "6666afe57ad2876575b77c341bb8e8c6959d4a6cee14cc231d33eab39da9dbae";
const trustedSender = (event: Electron.IpcMainInvokeEvent) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return !!window && !window.isDestroyed() && event.senderFrame === event.sender.mainFrame;
};

export function registerScientificSceneIpc(): void {
  const active = new WeakMap<Electron.WebContents, { directory: string; fingerprint: string }>();
  ipcMain.handle("scientificScenes:openExample", async (event, ...args: unknown[]): Promise<ScientificSceneOpenResponse> => {
    if (!trustedSender(event) || args.length) return { ok: false, error: "Invalid scientific example request" };
    try {
      const directory = app.isPackaged ? join(process.resourcesPath, "scientific-scenes", "sincos.sscene") :
        join(app.getAppPath(), "tests", "fixtures", "scientific-scene", "sincos.sscene");
      const scene = await openScientificHeightSurface(directory);
      if (scene.fingerprint !== PINNED_SINCOS_MANIFEST) throw new Error("Bundled scientific example changed");
      active.set(event.sender, { directory, fingerprint: scene.fingerprint });
      return { ok: true, scene };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
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
