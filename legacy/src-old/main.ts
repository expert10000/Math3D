import { app, BrowserWindow } from "electron";
import * as path from "path";

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // load React shell
  win.loadFile(path.join(app.getAppPath(), "src", "index.html"));

  // dev tools for now
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
