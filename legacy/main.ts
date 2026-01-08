import { app, BrowserWindow } from "electron";
import * as path from "path";

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"), // or remove if no preload yet
    },
  });

  // Load dist/index.html (copied from src/index.html)
  win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
