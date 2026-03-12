import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";
import * as path from "node:path";

import { listPresets, upsertPreset, removePreset } from "./presetsDb";
import type { PresetKind, SurfacePresetRecord } from "./presetsDb";
import { registerCgalMeshIpc } from "./main/ipc/cgalMeshIpc";
import { registerVtkMeshIpc } from "./main/ipc/vtkMeshIpc";

import * as fs from "node:fs";


const isDev = !!process.env.VITE_DEV_SERVER_URL;

type CaptureRect = { x: number; y: number; width: number; height: number };
type AppCaptureRequest = { target: "scene" | "window"; rect?: CaptureRect | null };
type AppCaptureResponse =
  | { ok: true; path: string; folder: string }
  | { ok: false; error: string };

const toCaptureRect = (value: CaptureRect | null | undefined): CaptureRect | null => {
  if (!value) return null;
  const x = Math.max(0, Math.floor(Number(value.x)));
  const y = Math.max(0, Math.floor(Number(value.y)));
  const width = Math.max(0, Math.floor(Number(value.width)));
  const height = Math.max(0, Math.floor(Number(value.height)));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

const screenshotStamp = () => {
  const d = new Date();
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
};

// Guard against running this entrypoint under plain Node (Electron APIs unavailable).
if (!(app && typeof app.whenReady === "function")) {
  console.error("Electron app is not available. Run via the Electron runtime.");
  process.exit(0);
}

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
  return win;
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

  registerCgalMeshIpc();
  registerVtkMeshIpc();

  ipcMain.handle("app:capture-screenshot", async (evt, req: AppCaptureRequest): Promise<AppCaptureResponse> => {
    try {
      const win = BrowserWindow.fromWebContents(evt.sender);
      if (!win || win.isDestroyed()) {
        return { ok: false, error: "Window not available." };
      }
      const target = req?.target === "scene" ? "scene" : "window";
      const rect = target === "scene" ? toCaptureRect(req?.rect ?? null) : null;
      if (target === "scene" && !rect) {
        return { ok: false, error: "Scene capture area is not available." };
      }
      const image = rect ? await win.webContents.capturePage(rect) : await win.webContents.capturePage();
      const outputFolder = path.resolve(process.cwd(), "output");
      await fs.promises.mkdir(outputFolder, { recursive: true });
      const filePath = path.join(outputFolder, `math3d-${target}-${screenshotStamp()}.png`);
      await fs.promises.writeFile(filePath, image.toPNG());
      return { ok: true, path: filePath, folder: outputFolder };
    } catch (error: any) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });

try {
    listPresets("graph");
  } catch (e: any) {
    try {
      const p = path.join(app.getPath("userData"), "presets_db_error.txt");
      fs.writeFileSync(p, String(e?.stack || e), "utf8");
    } catch {}
  }

  const win = createWindow();
  if (win) buildAppMenu(win);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    if (win) buildAppMenu(win);
  }
});

function buildAppMenu(win: BrowserWindow) {
  const sendMode = (mode: string) => {
    if (win.isDestroyed()) return;
    win.webContents.send("app:mode", mode);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Mode",
          submenu: [
            { label: "Surfaces", click: () => sendMode("surfaces") },
            { label: "Möbius map", click: () => sendMode("mobius") },
            { label: "Chebyshev Tₙ", click: () => sendMode("chebyshev") },
            { label: "Transform (z²)", click: () => sendMode("transform") },
            { label: "Standard maps", click: () => sendMode("maps") },
          ],
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: [{ role: "about" }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
