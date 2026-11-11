import { app, BrowserWindow, ipcMain } from "electron";
import { ProjectDurabilityStore } from "../projectDurability";

export const registerProjectDurabilityIpc = (e2e: boolean): void => {
  const store = new ProjectDurabilityStore(app.getPath("userData"));
  ipcMain.on("projects:durability:write", (event, snapshot: unknown) => {
    try {
      if (!BrowserWindow.fromWebContents(event.sender)) throw new Error("Project window is unavailable.");
      store.write(snapshot);
      event.returnValue = { ok: true };
    } catch (error) { event.returnValue = { ok: false, error: (error as Error).message }; }
  });
  ipcMain.on("projects:durability:read", event => {
    try {
      if (!BrowserWindow.fromWebContents(event.sender)) throw new Error("Project window is unavailable.");
      event.returnValue = { ok: true, snapshots: store.read() };
    } catch (error) { event.returnValue = { ok: false, error: (error as Error).message }; }
  });
  if (e2e) ipcMain.on("projects:durability:clear-for-test", event => {
    try { store.clearForTest(); event.returnValue = { ok: true }; }
    catch (error) { event.returnValue = { ok: false, error: (error as Error).message }; }
  });
};
