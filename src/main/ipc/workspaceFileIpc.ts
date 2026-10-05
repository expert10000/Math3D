import { BrowserWindow, dialog, ipcMain } from "electron";
import { open } from "node:fs/promises";

const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;

export type WorkspaceFileOpenResponse =
  | { ok: true; canceled: false; content: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export function registerWorkspaceFileIpc(): void {
  ipcMain.handle("workspaceFiles:open", async (event, ...args: unknown[]): Promise<WorkspaceFileOpenResponse> => {
    if (args.length) return { ok: false, canceled: false, error: "Workspace open accepts no renderer paths" };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || event.senderFrame !== event.sender.mainFrame)
      return { ok: false, canceled: false, error: "Untrusted workspace open request" };
    try {
      const choice = await dialog.showOpenDialog(win, {
        title: "Open Math3D workspace (.math3d)",
        filters: [
          { name: "Math3D workspace", extensions: ["math3d", "json"] },
          { name: "All files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (choice.canceled || !choice.filePaths[0]) return { ok: false, canceled: true };
      const file = await open(choice.filePaths[0], "r");
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size < 1 || info.size > MAX_WORKSPACE_BYTES)
          throw new Error("Invalid Math3D workspace file size");
        return { ok: true, canceled: false, content: await file.readFile({ encoding: "utf8" }) };
      } finally { await file.close(); }
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
