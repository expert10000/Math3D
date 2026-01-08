// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("greens", {
  compute: (payload: any) => ipcRenderer.invoke("greens:compute", payload)
});
