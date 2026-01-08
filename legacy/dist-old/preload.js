"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("greens", {
    compute: (payload) => electron_1.ipcRenderer.invoke("greens:compute", payload)
});
