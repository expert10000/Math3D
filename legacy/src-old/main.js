import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    win.loadFile("index.html");
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin")
    app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
//# sourceMappingURL=main.js.map