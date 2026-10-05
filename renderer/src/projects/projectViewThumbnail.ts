import { validateProjectThumbnail } from "./projectLibrary";

/** Crop an actual visible render surface, not tool panels or the Projects dialog. */
export const visibleProjectViewRect = (root: Element | null) => {
  if (!root) return null;
  const candidates = Array.from(root.querySelectorAll("canvas, svg[data-testid='graph2d-plot']")).flatMap(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    if (style.visibility !== "visible" || style.display === "none" || (element instanceof HTMLCanvasElement && (!element.width || !element.height))) return [];
    const x = Math.max(0, Math.ceil(box.left)), y = Math.max(0, Math.ceil(box.top));
    const width = Math.floor(Math.min(innerWidth, box.right)) - x, height = Math.floor(Math.min(innerHeight, box.bottom)) - y;
    return width >= 64 && height >= 64 ? [{ x, y, width, height }] : [];
  });
  return candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
};

export const captureProjectViewThumbnail = async (root: Element | null): Promise<string> => {
  const capture = window.appCapture?.captureProjectThumbnail;
  if (!capture) throw new Error("Automatic previews are available in the desktop app.");
  const rect = visibleProjectViewRect(root);
  if (!rect) throw new Error("No rendered viewer is visible. Open a document and save again.");
  const panel = document.getElementById("project-explorer-panel");
  panel?.setAttribute("data-capturing-thumbnail", "true");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = async () => {
      // Let the compositor remove the gallery and its backdrop before capture.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const result = await capture(rect);
      if (!result.ok) throw new Error(result.error);
      return validateProjectThumbnail(result.dataUrl);
    };
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Viewer capture timed out; the existing preview was kept.")), 5000);
    })]);
  } finally { clearTimeout(timer); panel?.removeAttribute("data-capturing-thumbnail"); }
};
