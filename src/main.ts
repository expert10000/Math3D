import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "node:path";

import { listPresets, upsertPreset, removePreset } from "./presetsDb";
import type { PresetKind, SurfacePresetRecord } from "./presetsDb";

import * as fs from "node:fs";


const isDev = !!process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // IMPORTANT
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
const indexPath = path.join(__dirname, "..", "renderer", "dist", "index.html");
    win.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  ipcMain.handle("surfacePresets:list", (_evt, kind: PresetKind) => {
    return listPresets(kind);
  });

  ipcMain.handle("surfacePresets:upsert", (_evt, preset: SurfacePresetRecord) => {
    upsertPreset(preset);
  });

  ipcMain.handle("surfacePresets:remove", (_evt, id: string) => {
    removePreset(id);
  });

try {
    listPresets("graph");
  } catch (e: any) {
    try {
      const p = path.join(app.getPath("userData"), "presets_db_error.txt");
      fs.writeFileSync(p, String(e?.stack || e), "utf8");
    } catch {}
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
