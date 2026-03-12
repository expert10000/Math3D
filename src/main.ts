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
  const sendCommand = (command: string, payload?: unknown) => {
    if (win.isDestroyed()) return;
    win.webContents.send("app:menu-command", { command, payload });
  };
  const action = (label: string, command: string, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => sendCommand(command),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        action("New workspace", "file:new-workspace", "CmdOrCtrl+N"),
        action("Open workspace", "file:open-workspace", "CmdOrCtrl+O"),
        {
          label: "Open recent",
          submenu: [
            action("Open latest workspace", "file:open-recent-workspace"),
          ],
        },
        { type: "separator" },
        action("Save workspace", "file:save-workspace", "CmdOrCtrl+S"),
        action("Save as", "file:save-workspace-as", "CmdOrCtrl+Shift+S"),
        { type: "separator" },
        action("Import mesh", "file:import-mesh"),
        action("Export mesh", "file:export-mesh"),
        action("Export screenshot", "file:export-screenshot", "CmdOrCtrl+Shift+E"),
        { type: "separator" },
        { label: "Exit", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        action("Copy equation/config", "edit:copy-equation-config", "CmdOrCtrl+Shift+C"),
        action("Duplicate object", "edit:duplicate-object", "CmdOrCtrl+D"),
        action("Delete object", "edit:delete-object", "Delete"),
        { type: "separator" },
        action("Preferences", "edit:preferences", "CmdOrCtrl+,"),
      ],
    },
    {
      label: "View",
      submenu: [
        action("Reset camera", "view:reset-camera", "CmdOrCtrl+0"),
        action("Front view", "view:front"),
        action("Top view", "view:top"),
        action("Right view", "view:right"),
        { type: "separator" },
        action("Toggle side panel", "view:toggle-side-panel"),
        action("Toggle status bar", "view:toggle-status-bar"),
        action("Toggle gizmo", "view:toggle-gizmo"),
        { type: "separator" },
        { label: "Fullscreen", role: "togglefullscreen" },
      ],
    },
    {
      label: "Insert / Create",
      submenu: [
        action("New implicit surface", "insert:new-implicit-surface"),
        action("New explicit graph", "insert:new-explicit-graph"),
        action("New parametric surface", "insert:new-parametric-surface"),
        action("New Weierstrass surface", "insert:new-weierstrass-surface"),
        action("New complex map", "insert:new-complex-map"),
        action("New mesh", "insert:new-mesh"),
        action("New volume", "insert:new-volume"),
        { type: "separator" },
        action("Add clipping plane", "insert:add-clipping-plane"),
        action("Add chart grid", "insert:add-chart-grid"),
        action("Add point / curve / vector", "insert:add-point-curve-vector"),
      ],
    },
    {
      label: "Analysis",
      submenu: [
        action("Curvature", "analysis:curvature"),
        action("Principal directions", "analysis:principal-directions"),
        action("Geodesics", "analysis:geodesics"),
        action("Gradient / divergence / curl", "analysis:gradient-divergence-curl"),
        action("Parallel transport", "analysis:parallel-transport"),
        action("Slice / contour extraction", "analysis:slice-contour-extraction"),
        action("Compare mode", "analysis:compare-mode"),
      ],
    },
    {
      label: "Window",
      submenu: [
        { label: "Reload", role: "reload" },
        { label: "Developer tools", role: "toggleDevTools" },
        { type: "separator" },
        action("Reset layout", "window:reset-layout"),
        { type: "separator" },
        { role: "minimize" },
        { role: "close" },
      ],
    },
    {
      label: "Help",
      submenu: [
        action("Shortcuts", "help:shortcuts"),
        action("Preset guide", "help:preset-guide"),
        action("Surface formulas", "help:surface-formulas"),
        { type: "separator" },
        { label: "About", role: "about" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
