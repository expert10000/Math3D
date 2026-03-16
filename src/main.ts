import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { listPresets, upsertPreset, removePreset } from "./presetsDb";
import type { PresetKind, SurfacePresetRecord } from "./presetsDb";
import { registerCgalMeshIpc } from "./main/ipc/cgalMeshIpc";
import { registerVtkMeshIpc } from "./main/ipc/vtkMeshIpc";
import { runPythonWorkerStartupCheck, stopPythonWorker } from "./main/python/pythonWorker";
import { recordPythonWorkerStartup, registerPythonWorkerDiagnosticsIpc } from "./main/python/pythonWorkerDiagnostics";

import * as fs from "node:fs";


const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isStartupSmoke = ["1", "true", "yes", "on", "y"].includes(String(process.env.MATH3D_STARTUP_SMOKE || "").toLowerCase());
const isGeometrySmoke = ["1", "true", "yes", "on", "y"].includes(String(process.env.MATH3D_GEOMETRY_SMOKE || "").toLowerCase());
const geometrySmokeTimeoutMs = Math.max(
  30000,
  Number.isFinite(Number(process.env.MATH3D_GEOMETRY_SMOKE_TIMEOUT_MS))
    ? Number(process.env.MATH3D_GEOMETRY_SMOKE_TIMEOUT_MS)
    : 120000
);

type AppRuntimeMode = "development" | "packaged";
type AppInstallType = "development" | "installer" | "portable-or-unknown";
type AppSystemInfo = {
  appName: string;
  appVersion: string;
  mode: AppRuntimeMode;
  installType: AppInstallType;
  execPath: string;
  appPath: string;
  resourcesPath: string;
  userDataPath: string;
  workingDir: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
};

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

const inferInstallType = (execPath: string, mode: AppRuntimeMode): AppInstallType => {
  if (mode === "development") return "development";
  const normalized = execPath.replace(/\//g, "\\").toLowerCase();
  if (
    normalized.includes("\\program files\\") ||
    normalized.includes("\\program files (x86)\\") ||
    normalized.includes("\\appdata\\local\\programs\\")
  ) {
    return "installer";
  }
  return "portable-or-unknown";
};

const buildAppSystemInfo = (): AppSystemInfo => {
  const mode: AppRuntimeMode = app.isPackaged ? "packaged" : "development";
  const execPath = process.execPath;
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    mode,
    installType: inferInstallType(execPath, mode),
    execPath,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath ?? "",
    userDataPath: app.getPath("userData"),
    workingDir: process.cwd(),
    electronVersion: process.versions.electron ?? "unknown",
    chromeVersion: process.versions.chrome ?? "unknown",
    nodeVersion: process.versions.node ?? "unknown",
    platform: process.platform,
    arch: process.arch,
  };
};

const formatAppSystemInfo = (info: AppSystemInfo): string => {
  const version = info.appVersion ? `v${info.appVersion}` : "version unknown";
  return [
    `${info.appName} ${version}`,
    `Mode: ${info.mode}`,
    `Install type: ${info.installType}`,
    "",
    `Executable: ${info.execPath}`,
    `App folder: ${info.appPath}`,
    `Resources: ${info.resourcesPath}`,
    `User data: ${info.userDataPath}`,
    `Working dir: ${info.workingDir}`,
    "",
    `Electron: ${info.electronVersion}`,
    `Chrome: ${info.chromeVersion}`,
    `Node: ${info.nodeVersion}`,
    `Platform: ${info.platform} ${info.arch}`,
  ].join("\n");
};

const showAppSystemInfo = async (win: BrowserWindow): Promise<void> => {
  const info = buildAppSystemInfo();
  await dialog.showMessageBox(win, {
    type: "info",
    title: `${info.appName} system info`,
    message: `${info.appName} runtime details`,
    detail: formatAppSystemInfo(info),
    buttons: ["OK"],
    noLink: true,
  });
};

const logStartupSmoke = (event: string, details?: unknown): void => {
  if (!isStartupSmoke) return;
  if (details === undefined) {
    console.log(`[startup-smoke] ${event}`);
    return;
  }
  console.log(`[startup-smoke] ${event}`, details);
};

const runAndRecordWorkerStartupCheck = async () => {
  const status = await runPythonWorkerStartupCheck();
  recordPythonWorkerStartup(status);
  if (status.ok) {
    console.log("[python-worker] startup check passed", {
      backend: status.backend,
      command: status.command,
      args: status.args,
      version: status.version,
      protocol: status.protocol,
      pythonExe: status.pythonExe,
      scriptPath: status.scriptPath,
      exePath: status.exePath,
    });
    return status;
  }
  console.error("[python-worker] startup check failed", status);
  return status;
};

const waitForMainWindowReady = (win: BrowserWindow, timeoutMs = 30000): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (reason: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };

    const timer = setTimeout(() => {
      fail(new Error(`Main window did not become ready within ${timeoutMs}ms.`));
    }, timeoutMs);

    const onReady = () => finish();
    const onClosed = () => fail(new Error("Main window closed before it became ready."));
    const onFailLoad = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ) => {
      if (!isMainFrame) return;
      fail(new Error(`Main window failed to load (${errorCode}): ${errorDescription} [${validatedURL}]`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      win.removeListener("ready-to-show", onReady);
      win.removeListener("closed", onClosed);
      win.webContents.removeListener("did-finish-load", onReady);
      win.webContents.removeListener("did-fail-load", onFailLoad);
    };

    win.once("ready-to-show", onReady);
    win.once("closed", onClosed);
    win.webContents.once("did-finish-load", onReady);
    win.webContents.on("did-fail-load", onFailLoad);
  });
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
    const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
    if (isGeometrySmoke) {
      devUrl.searchParams.set("geometrySmoke", "1");
    }
    win.loadURL(devUrl.toString());
    win.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "..", "renderer", "dist", "index.html");
    if (isGeometrySmoke) {
      const indexUrl = pathToFileURL(indexPath);
      indexUrl.searchParams.set("geometrySmoke", "1");
      win.loadURL(indexUrl.toString());
    } else {
      win.loadFile(indexPath);
    }
  }
  return win;
}

const setupGeometrySmokeHarness = (win: BrowserWindow): void => {
  let done = false;
  const finish = (ok: boolean, reason?: string) => {
    if (done) return;
    done = true;
    clearTimeout(timeout);
    if (ok) {
      console.log("[geometry-smoke] EXIT_OK");
    } else {
      console.error("[geometry-smoke] EXIT_FAIL", reason ?? "unknown");
      process.exitCode = 1;
    }
    app.quit();
  };

  console.log("[geometry-smoke] HARNESS_READY", { timeoutMs: geometrySmokeTimeoutMs });
  win.webContents.on("did-finish-load", () => {
    console.log("[geometry-smoke] PAGE_URL", win.webContents.getURL());
  });
  const timeout = setTimeout(() => {
    finish(false, `Timeout waiting for geometry smoke completion (${geometrySmokeTimeoutMs}ms).`);
  }, geometrySmokeTimeoutMs);

  win.webContents.on("console-message", (_event, _level, message) => {
    const text = String(message ?? "");
    if (text.includes("[geometry-smoke] DONE")) {
      finish(true);
      return;
    }
    if (text.includes("[geometry-smoke] FAIL:")) {
      finish(false, text);
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    finish(false, `Renderer process gone: ${details.reason}`);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    finish(false, `did-fail-load (${errorCode}): ${errorDescription} [${validatedURL}]`);
  });
  win.on("closed", () => {
    finish(false, "Window closed before geometry smoke completion.");
  });
};

ipcMain.on("app:runtime:get-flags", (event) => {
  event.returnValue = {
    geometrySmoke: isGeometrySmoke,
  };
});

app.whenReady().then(async () => {
  if (isStartupSmoke) {
    logStartupSmoke("APP_READY");
  }

  registerPythonWorkerDiagnosticsIpc();

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
  if (win) {
    buildAppMenu(win);
    if (isGeometrySmoke) {
      setupGeometrySmokeHarness(win);
    }
  }

  if (isStartupSmoke) {
    try {
      await waitForMainWindowReady(win);
      logStartupSmoke("WINDOW_READY");

      const status = await runAndRecordWorkerStartupCheck();
      if (!status.ok) {
        logStartupSmoke("WORKER_HEALTH_FAILED", status.error);
        process.exitCode = 1;
        app.quit();
        return;
      }

      logStartupSmoke("WORKER_HEALTH_OK", {
        backend: status.backend,
        version: status.version,
        protocol: status.protocol,
      });
      app.quit();
    } catch (error: any) {
      logStartupSmoke("STARTUP_FAILED", String(error?.message ?? error));
      process.exitCode = 1;
      app.quit();
    }
    return;
  }

  void runAndRecordWorkerStartupCheck();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopPythonWorker();
});

app.on("will-quit", () => {
  if (isStartupSmoke) {
    logStartupSmoke("EXIT_CLEAN");
  }
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
        {
          label: "App system info",
          click: () => {
            void showAppSystemInfo(win);
          },
        },
        {
          label: "About",
          click: () => {
            void showAppSystemInfo(win);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
