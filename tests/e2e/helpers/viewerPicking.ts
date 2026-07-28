import { expect, type Locator, type Page } from "@playwright/test";

export type ViewerBounds = { x: number; y: number; width: number; height: number };
export type ViewerPoint = { x: number; y: number };

const visibleBox = async (locator: Locator): Promise<ViewerBounds | null> => {
  if (!(await locator.isVisible().catch(() => false))) return null;
  return locator.boundingBox().catch(() => null);
};

export const largestVisibleSurfaceViewerCanvasHost = async (page: Page): Promise<Locator> => {
  const hosts = page.getByTestId("surface-viewer-canvas-host");
  const count = await hosts.count();
  let best: Locator | null = null;
  let bestArea = 0;
  for (let i = 0; i < count; i += 1) {
    const host = hosts.nth(i);
    const box = await visibleBox(host);
    const area = box ? box.width * box.height : 0;
    if (area > bestArea) {
      bestArea = area;
      best = host;
    }
  }
  if (!best) throw new Error("No visible surface viewer canvas host found.");
  return best;
};

export const surfaceViewerPickBox = async (page: Page): Promise<ViewerBounds> => {
  const viewer = page.getByTestId("main-viewer");
  await expect(viewer).toBeVisible();

  const canvasHost = await largestVisibleSurfaceViewerCanvasHost(page).catch(() => null);
  const box = canvasHost ? await canvasHost.boundingBox().catch(() => null) : await viewer.boundingBox();
  if (!box) throw new Error("Viewer bounds unavailable.");

  const toolbarBox = await visibleBox(page.getByTestId("geometry-context-toolbar"));
  const controlsBox = await visibleBox(page.getByText("Viewport", { exact: true }));
  const overlayBottom = Math.max(
    box.y,
    toolbarBox && toolbarBox.y < box.y + box.height ? toolbarBox.y + toolbarBox.height : box.y,
    controlsBox && controlsBox.y < box.y + box.height ? controlsBox.y + controlsBox.height : box.y
  );
  const y = Math.min(box.y + box.height - 12, overlayBottom > box.y ? overlayBottom + 8 : box.y);
  return {
    ...box,
    y,
    height: Math.max(12, box.y + box.height - y),
  };
};

export const pointGrid = (box: ViewerBounds): ViewerPoint[] => {
  const points: ViewerPoint[] = [];
  const center = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  points.push(center);

  for (const [fx, fy] of [
    [0.22, 0.03],
    [0.5, 0.03],
    [0.78, 0.03],
    [0.22, 0.97],
    [0.5, 0.97],
    [0.78, 0.97],
    [0.03, 0.22],
    [0.03, 0.5],
    [0.03, 0.78],
    [0.97, 0.22],
    [0.97, 0.5],
    [0.97, 0.78],
  ]) {
    points.push({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  }

  for (const radius of [0.1, 0.18, 0.26, 0.34]) {
    for (const [dx, dy] of [
      [0, -radius],
      [radius, 0],
      [0, radius],
      [-radius, 0],
      [radius, -radius],
      [radius, radius],
      [-radius, radius],
      [-radius, -radius],
    ]) {
      points.push({ x: box.x + box.width * (0.5 + dx), y: box.y + box.height * (0.5 + dy) });
    }
  }

  const minX = box.x + box.width * 0.04;
  const maxX = box.x + box.width * 0.96;
  const minY = box.y + box.height * 0.04;
  const maxY = box.y + box.height * 0.96;
  for (let y = minY; y <= maxY; y += 18) {
    for (let x = minX; x <= maxX; x += 18) {
      points.push({ x, y });
    }
  }
  return points;
};

export const clickSurfaceViewerCanvas = async (page: Page, fx = 0.5, fy = 0.5): Promise<void> => {
  const host = await largestVisibleSurfaceViewerCanvasHost(page);
  const box = await host.boundingBox();
  if (!box) throw new Error("Surface viewer canvas bounds unavailable.");
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
};
