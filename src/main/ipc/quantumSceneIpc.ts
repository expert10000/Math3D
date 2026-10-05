import { BrowserWindow, dialog, ipcMain } from "electron";
import { importQuantumSceneBundle } from "../quantumScene/importer";
import type { QuantumSceneOpenResponse } from "../quantumScene/ipcContract";

export function registerQuantumSceneIpc(): void {
  ipcMain.handle("quantumScenes:open", async (event, ...args: unknown[]): Promise<QuantumSceneOpenResponse> => {
    if (args.length) return { ok: false, canceled: false, error: "Quantum scene open accepts no renderer paths" };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || event.senderFrame !== event.sender.mainFrame)
      return { ok: false, canceled: false, error: "Untrusted quantum scene IPC sender" };
    try {
      const picked = await dialog.showOpenDialog(win, {
        title: "Open verified quantum-scene/v1 bundle",
        properties: ["openDirectory"],
      });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const directory = picked.filePaths[0];
      const imported = await importQuantumSceneBundle(directory);
      return { ok: true, canceled: false, directory, document: imported.document,
        mappedObjectIds: imported.mappedObjectIds, deferredObjectIds: imported.deferredObjectIds,
        deferredFieldIds: imported.deferredFieldIds };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
