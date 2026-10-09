import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { importQuantumSceneBundle, type ImportedQuantumScene } from "../quantumScene/importer";
import { inspectVerifiedFieldSample, renderVerifiedFieldSlice, type FieldSampleRequest, type FieldSliceRequest } from "../quantumScene/fieldSlice";
import { deriveVerifiedFieldSurface, type FieldSurfaceRequest } from "../quantumScene/fieldSurface";
import type { QuantumSceneOpenResponse, QuantumSceneRelinkResponse } from "../quantumScene/ipcContract";
import { rememberQuantumScene, reopenRecentQuantumScene, reopenQuantumSceneReference, sceneFingerprint } from "../quantumScene/recent";
import { isAbsolute, resolve } from "node:path";
import { chooseTheoryLabTarget, launchTheoryLab } from "../quantumScene/theoryLabLaunch";

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
  const verifiedBySender = new WeakMap<Electron.WebContents, { fingerprint: string; directory: string; imported: ImportedQuantumScene }>();
  const openedFor = (event: Electron.IpcMainInvokeEvent, directory: string, imported: ImportedQuantumScene, remembered: boolean) => {
    verifiedBySender.set(event.sender, { fingerprint: sceneFingerprint(imported), directory: resolve(directory), imported });
    return opened(directory, imported, remembered);
  };
  const activeField = (event: Electron.IpcMainInvokeEvent, request: unknown) => {
    if (!trustedSender(event)) throw new Error("Untrusted quantum scene IPC sender");
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("Invalid field request");
    const fingerprint = (request as Record<string, unknown>).fingerprint;
    const active = verifiedBySender.get(event.sender);
    if (typeof fingerprint !== "string" || !active || active.fingerprint !== fingerprint)
      throw new Error("Field request does not match the active verified scene");
    return active;
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
  ipcMain.handle("quantumScenes:pickMatchingReference", async (event, ...args: unknown[]): Promise<QuantumSceneRelinkResponse> => {
    if (args.length !== 1 || typeof args[0] !== "string" || !/^[a-f0-9]{64}$/.test(args[0]))
      return { ok: false, canceled: false, error: "Relink requires one saved scene fingerprint" };
    if (!trustedSender(event)) return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    try {
      const win = BrowserWindow.fromWebContents(event.sender)!;
      const picked = await dialog.showOpenDialog(win, {
        title: "Relink the same verified quantum-scene/v1 bundle",
        properties: ["openDirectory"],
      });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = resolve(picked.filePaths[0]);
      if (!isAbsolute(directory) || !directory.toLowerCase().endsWith(".qscene"))
        return { ok: false, canceled: false, error: "Selected folder is not a .qscene bundle" };
      const imported = await importQuantumSceneBundle(directory);
      const fingerprint = sceneFingerprint(imported);
      if (fingerprint !== args[0])
        return { ok: false, canceled: false, error: "Selected bundle is valid but does not match the saved scene fingerprint" };
      // Relinking is only a verification request. It does not replace the active
      // field, recent-scene shortcut, or any Project bytes in Electron main.
      return { ok: true, canceled: false, reference: { directory, sceneFingerprint: fingerprint } };
    } catch (error) { return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("quantumScenes:fieldSlice", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field slice requires one request");
    const active = activeField(event, args[0]);
    return renderVerifiedFieldSlice(active.imported, args[0] as FieldSliceRequest);
  });
  ipcMain.handle("quantumScenes:fieldSample", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field sample requires one request");
    const active = activeField(event, args[0]);
    return inspectVerifiedFieldSample(active.imported, args[0] as FieldSampleRequest);
  });
  ipcMain.handle("quantumScenes:fieldSurface", (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new TypeError("Field surface requires one request");
    const active = activeField(event, args[0]);
    return deriveVerifiedFieldSurface(active.imported, args[0] as FieldSurfaceRequest);
  });
  ipcMain.handle("quantumScenes:revealSource", async (event, ...args: unknown[]) => {
    if (args.length !== 1) return { ok: false, error: "Source reveal requires one active-scene fingerprint" };
    try {
      const active = activeField(event, args[0]);
      // Re-read and hash every source artifact immediately before invoking the OS file manager.
      await reopenQuantumSceneReference({ directory: active.directory, sceneFingerprint: active.fingerprint });
      shell.showItemInFolder(active.directory);
      return { ok: true, directory: active.directory };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("quantumScenes:openSourceRun", async (event, ...args: unknown[]) => {
    if (args.length !== 1) return { ok: false, canceled: false, error: "Source-run launch requires one active-scene fingerprint" };
    try {
      const active = activeField(event, args[0]);
      const reference = { directory: active.directory, sceneFingerprint: active.fingerprint };
      let reopened = await reopenQuantumSceneReference(reference);
      if (reopened.imported.source.provenance.kind === "geometry-fixture")
        throw new Error("Geometry examples have no saved Theory Lab run");
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) throw new Error("Scene window is unavailable");
      const target = await chooseTheoryLabTarget(win);
      if (!target) return { ok: false, canceled: true };
      // The chooser may have been open while the scene changed. Verify both the
      // active identity and every source artifact again before spawning Lab.
      activeField(event, args[0]);
      reopened = await reopenQuantumSceneReference(reference);
      const { runId, resultSha256 } = reopened.imported.source.provenance;
      await launchTheoryLab(target, runId, resultSha256);
      return { ok: true, canceled: false, runId, resultSha256 };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
