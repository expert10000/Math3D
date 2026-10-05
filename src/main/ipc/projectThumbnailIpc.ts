import { BrowserWindow, ipcMain } from "electron";

/** In-memory raster only: never create a screenshot file or alter a document. */
export const registerProjectThumbnailIpc = () => {
  ipcMain.handle("app:capture-project-thumbnail", async (event, rect: { x: number; y: number; width: number; height: number }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed() || win.isMinimized()) throw new Error("The viewer window is not visible.");
      const [width, height] = win.getContentSize();
      if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.x < 0 || rect.y < 0 ||
        rect.width < 64 || rect.height < 64)
        throw new Error("The viewer capture area is unavailable.");
      // Renderer rectangles use CSS pixels; capturePage uses window DIP pixels.
      const zoom = win.webContents.getZoomFactor(), area = { x: Math.round(rect.x * zoom), y: Math.round(rect.y * zoom), width: Math.floor(rect.width * zoom), height: Math.floor(rect.height * zoom) };
      if (area.x + area.width > width || area.y + area.height > height) throw new Error("The viewer capture area is unavailable.");
      const image = await win.webContents.capturePage(area);
      if (image.isEmpty()) throw new Error("The viewer image is empty.");
      const size = image.getSize(), scale = Math.min(320 / size.width, 200 / size.height, 1);
      const bytes = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: "good" }).toJPEG(75);
      if (!bytes.length || bytes.length > 128 * 1024) throw new Error("The viewer preview exceeds its size limit.");
      return { ok: true, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  });
};
