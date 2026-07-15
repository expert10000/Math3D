import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repoRoot = path.resolve(__dirname, "..", "..");
const COMPUTE_ENGINE_FIRST_LAUNCH_KEY = "math3d.computeEngines.firstLaunchSeen";

type PickMode = "object" | "face" | "edge" | "vertex";
type Bounds = { x: number; y: number; width: number; height: number };

const launchApp = async (profileDir: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const launchEnv: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
    MATH3D_E2E: "1",
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await launchRepoElectron({
    args: ["."],
    cwd: repoRoot,
    env: launchEnv,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  return { app, page };
};

const resetStorage = async (page: Page) => {
  await page.evaluate((firstLaunchKey) => {
    localStorage.clear();
    localStorage.setItem(firstLaunchKey, "1");
  }, COMPUTE_ENGINE_FIRST_LAUNCH_KEY);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
};

const clickFirstVisibleButton = async (page: Page, name: string | RegExp) => {
  const buttons = page.getByRole("button", typeof name === "string" ? { name, exact: true } : { name });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${String(name)}`);
};

const openProceduralGeometry = async (page: Page) => {
  await clickFirstVisibleButton(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await clickFirstVisibleButton(page, "Procedural");
  await expect(page.getByTestId("geometry-scene-stats")).toBeVisible();
  const torusQuickAdd = page.getByTestId("geometry-gallery-quick-add-torus");
  await expect(torusQuickAdd).toBeVisible();
  await torusQuickAdd.click();
  await clickFirstVisibleButton(page, "Fit scene");
  await expect(page.getByTestId("geometry-pick-committed")).toBeVisible();
};

const pointGrid = (box: Bounds) => {
  const points: Array<{ x: number; y: number }> = [];
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

const selectPickMode = async (page: Page, mode: PickMode) => {
  await page.getByTestId(`geometry-pick-mode-${mode}`).click();
  await expect(page.getByTestId(`geometry-pick-mode-${mode}`)).toHaveAttribute("aria-pressed", "true");
};

const clickUntilCommitted = async (page: Page, mode: PickMode) => {
  await selectPickMode(page, mode);
  const viewer = page.getByTestId("main-viewer");
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  if (!box) throw new Error("Viewer bounds unavailable");

  const entity = page.getByTestId("geometry-pick-committed-entity");
  const status = page.getByTestId("geometry-pick-committed-status");
  const points = pointGrid(box);
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
    const ok = await entity
      .evaluate((node, expectedMode) => (node.textContent ?? "").toLowerCase().includes(String(expectedMode)), mode)
      .catch(() => false);
    const valid = await status.evaluate((node) => (node.textContent ?? "").trim() === "valid").catch(() => false);
    if (ok && valid) return;
  }
  throw new Error(`Unable to commit ${mode} pick after ${points.length} viewer clicks`);
};

test("Geometry pick readout commits object, face, edge, and vertex modes", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-pick-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page);

    await clickUntilCommitted(page, "object");
    await expect(page.getByTestId("geometry-pick-committed-entity")).toContainText("object");
    await expect(page.getByTestId("geometry-pick-object-id")).not.toHaveText("");
    await expect(page.getByTestId("geometry-pick-committed-type")).not.toHaveText("n/a");

    await clickUntilCommitted(page, "face");
    await expect(page.getByTestId("geometry-pick-committed-entity")).toContainText("face");
    await expect(page.getByTestId("geometry-pick-face")).not.toContainText("n/a");
    await expect(page.getByTestId("geometry-pick-world-point")).not.toContainText("none");

    await clickUntilCommitted(page, "edge");
    await expect(page.getByTestId("geometry-pick-committed-entity")).toContainText("edge");
    await expect(page.getByTestId("geometry-pick-edge")).not.toContainText("n/a");

    await clickUntilCommitted(page, "vertex");
    await expect(page.getByTestId("geometry-pick-committed-entity")).toContainText("vertex");
    await expect(page.getByTestId("geometry-pick-vertex")).not.toContainText("n/a");
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});
