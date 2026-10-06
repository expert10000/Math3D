import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { importQuantumSceneBundle, type ImportedQuantumScene } from "../quantumScene/importer";
import { inspectVerifiedFieldSample, renderVerifiedFieldSlice, type FieldSampleRequest, type FieldSliceRequest } from "../quantumScene/fieldSlice";
import { deriveVerifiedFieldSurface, type FieldSurfaceRequest } from "../quantumScene/fieldSurface";
import type { QuantumSceneOpenResponse } from "../quantumScene/ipcContract";
import { rememberQuantumScene, reopenRecentQuantumScene, reopenQuantumSceneReference, sceneFingerprint } from "../quantumScene/recent";
import { isAbsolute, resolve } from "node:path";

export function quantumSceneLaunchDirectory(argv: readonly string[]): string | null {
  const flags = argv.flatMap((arg, index) => arg === "--quantum-scene" ? [index] : []);
  if (!flags.length) return null;
  if (flags.length !== 1) throw new Error("Only one quantum scene can be opened at launch");
  const directory = argv[flags[0] + 1];
  if (!directory || !isAbsolute(directory) || resolve(directory) !== directory ||
      !directory.toLowerCase().endsWith(".qscene") || directory.includes("\0"))
    throw new Error("Invalid quantum scene launch folder");
  return directory;
}

function trustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(event.sender);
  return !!win && !win.isDestroyed() && event.senderFrame === event.sender.mainFrame;
}

function opened(directory: string, imported: ImportedQuantumScene, remembered: boolean): QuantumSceneOpenResponse {
  return { ok: true, canceled: false, directory, remembered, document: imported.document,
    reference: { directory: resolve(directory), sceneFingerprint: sceneFingerprint(imported) },
    mappedObjectIds: imported.mappedObjectIds, deferredObjectIds: imported.deferredObjectIds,
    deferredFieldIds: imported.deferredFieldIds };
}

function failed(error: unknown): QuantumSceneOpenResponse {
  return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerQuantumSceneIpc(initialDirectory: string | null = null): void {
  let launchDirectory = initialDirectory;
  const verifiedBySender = new WeakMap<Electron.WebContents, { fingerprint: string; imported: ImportedQuantumScene }>();
  const openedFor = (event: Electron.IpcMainInvokeEvent, directory: string, imported: ImportedQuantumScene, remembered: boolean) => {
    verifiedBySender.set(event.sender, { fingerprint: sceneFingerprint(imported), imported });
    return opened(directory, imported, remembered);
  };
  const activeField = (event: Electron.IpcMainInvokeEvent, request: unknown) => {
    if (!trustedSender(event)) throw new Error("Untrusted quantum scene IPC sender");
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("Invalid field request");
    const fingerprint = (request as Record<string, unknown>).fingerprint;
    const active = verifiedBySender.get(event.sender);
    if (typeof fingerprint !== "string" || !active || active.fingerprint !== fingerprint)
      throw new Error("Field request does not match the active verified scene");
    return active.imported;
  };
  ipcMain.handle("quantumScenes:consumeLaunch", async (event, ...args: unknown[]): Promise<QuantumSceneOpenResponse> => {
    if (args.length) return { ok: false, canceled: false, error: "Quantum scene launch accepts no renderer paths" };
    if (!trustedSender(event))
      return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    const directory = launchDirectory;
    launchDirectory = null;
    if (!directory) return { ok: false, canceled: true };
    try {
      const imported = await importQuantumSceneBundle(directory);
      const remembered = await rememberQuantumScene(app.getPath("userData"), directory, imported)
        .then(() => true, () => false);
      return openedFor(event, directory, imported, remembered);
    } catch (error) {
      return failed(error);
    }
  });
  ipcMain.handle("quantumScenes:open", async (event, ...args: unknown[]): Promise<QuantumSceneOpenResponse> => {
    if (args.length) return { ok: false, canceled: false, error: "Quantum scene open accepts no renderer paths" };
    if (!trustedSender(event))
      return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    try {
      const win = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(win, {
        title: "Open verified quantum-scene/v1 bundle",
        properties: ["openDirectory"],
      });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      const imported = await importQuantumSceneBundle(directory);
      const remembered = await rememberQuantumScene(app.getPath("userData"), directory, imported)
        .then(() => true, () => false);
      return openedFor(event, directory, imported, remembered);
    } catch (error) {
      return failed(error);
    }
  });
  ipcMain.handle("quantumScenes:reopenRecent", async (event, ...args: unknown[]): Promise<QuantumSceneOpenResponse> => {
    if (args.length) return { ok: false, canceled: false, error: "Quantum scene reopen accepts no renderer paths" };
    if (!trustedSender(event))
      return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    try {
      const { directory, imported } = await reopenRecentQuantumScene(app.getPath("userData"));
      return openedFor(event, directory, imported, true);
    } catch (error) {
      return failed(error);
    }
  });
  ipcMain.handle("quantumScenes:openReference", async (event, ...args: unknown[]): Promise<QuantumSceneOpenResponse> => {
    if (args.length !== 1) return { ok: false, canceled: false, error: "Workspace scene reopen requires one reference" };
    if (!trustedSender(event)) return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    try {
      const { directory, imported } = await reopenQuantumSceneReference(args[0]);
      return openedFor(event, directory, imported, false);
    } catch (error) { return failed(error); }
  });
  ipcMain.handle("quantumScenes:fieldSlice", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field slice requires one request");
    const imported = activeField(event, args[0]);
    return renderVerifiedFieldSlice(imported, args[0] as FieldSliceRequest);
  });
  ipcMain.handle("quantumScenes:fieldSample", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field sample requires one request");
    const imported = activeField(event, args[0]);
    return inspectVerifiedFieldSample(imported, args[0] as FieldSampleRequest);
  });
  ipcMain.handle("quantumScenes:fieldSurface", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field surface requires one request");
    const imported = activeField(event, args[0]);
    return deriveVerifiedFieldSurface(imported, args[0] as FieldSurfaceRequest);
  });
}
