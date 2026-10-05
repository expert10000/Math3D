import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { importQuantumSceneBundle, type ImportedQuantumScene } from "../quantumScene/importer";
import type { QuantumSceneOpenResponse } from "../quantumScene/ipcContract";
import { rememberQuantumScene, reopenRecentQuantumScene } from "../quantumScene/recent";
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
    mappedObjectIds: imported.mappedObjectIds, deferredObjectIds: imported.deferredObjectIds,
    deferredFieldIds: imported.deferredFieldIds };
}

function failed(error: unknown): QuantumSceneOpenResponse {
  return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerQuantumSceneIpc(initialDirectory: string | null = null): void {
  let launchDirectory = initialDirectory;
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
      return opened(directory, imported, remembered);
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
      return opened(directory, imported, remembered);
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
      return opened(directory, imported, true);
    } catch (error) {
      return failed(error);
    }
  });
}
