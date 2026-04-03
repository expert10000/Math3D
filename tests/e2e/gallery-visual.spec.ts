import { expect, test, type Locator, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clickFirstVisible, clickFirstVisibleButton } from "./helpers/uiActions";

const repoRoot = path.resolve(__dirname, "..", "..");

const launchApp = async (profileDir: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ["."],
    cwd: repoRoot,
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  return { app, page };
};

const resetStorage = async (page: Page): Promise<void> => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
};

const clickFirstVisibleByTestId = async (page: Page, testId: string): Promise<void> => {
  const items = page.getByTestId(testId);
  await clickFirstVisible(items, `data-testid=${testId}`);
};

const ensureSurfacesGalleryMode = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Surfaces");
  const layout3Buttons = page.getByRole("button", { name: "Layout 3", exact: true });
  if ((await layout3Buttons.count()) > 0) {
    await clickFirstVisibleButton(page, "Layout 3");
  }
  const familyButton = page.getByTestId("surface-family-explicit");
  if ((await familyButton.count()) > 0 && (await familyButton.first().isVisible())) {
    return;
  }
  const galleryButton = page.getByRole("button", { name: "Gallery", exact: true });
  if ((await galleryButton.count()) > 0) {
    await clickFirstVisibleButton(page, "Gallery");
  }
  await expect(page.getByTestId("surface-family-explicit").first()).toBeVisible();
};

const snapshotOpts = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  maxDiffPixels: 120,
  timeout: 20_000,
};
const surfaceSnapshotOpts = {
  ...snapshotOpts,
  maxDiffPixels: 30_000,
};

const waitForImagesLoaded = async (scope: Locator): Promise<void> => {
  await expect(scope).toBeVisible();
  await scope.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  await scope.page().waitForTimeout(250);
};

test.setTimeout(10 * 60 * 1000);

test("Gallery cards visual baseline", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-visual-"));
  let app: ElectronApplication | null = null;
  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;
    await resetStorage(page);

    await clickFirstVisibleButton(page, "Geometry");
    await clickFirstVisibleButton(page, "Procedural");
    const geometryGallery = page.getByTestId("geometry-gallery");
    await expect(geometryGallery).toBeVisible();
    await waitForImagesLoaded(geometryGallery);
    await expect(geometryGallery).toHaveScreenshot("geometry-gallery-cards.png", snapshotOpts);

    await ensureSurfacesGalleryMode(page);
    await clickFirstVisibleByTestId(page, "surface-family-implicit");
    const implicitGrid = page.getByTestId("surface-preset-grid");
    await expect(implicitGrid).toBeVisible();
    await waitForImagesLoaded(implicitGrid);
    await expect(implicitGrid).toHaveScreenshot("surface-implicit-cards.png", surfaceSnapshotOpts);

    await clickFirstVisibleByTestId(page, "surface-family-parametric");
    const paramGrid = page.getByTestId("param-preset-grid");
    await expect(paramGrid).toBeVisible();
    await waitForImagesLoaded(paramGrid);
    await expect(paramGrid).toHaveScreenshot("surface-parametric-cards.png", surfaceSnapshotOpts);

    const weierstrassFamilyButton = page.getByTestId("surface-family-weierstrass");
    if (!(await weierstrassFamilyButton.first().isVisible())) {
      await clickFirstVisibleByTestId(page, "surface-family-more");
    }
    await clickFirstVisibleByTestId(page, "surface-family-weierstrass");
    const weierGrid = page.getByTestId("weierstrass-preset-grid");
    await expect(weierGrid).toBeVisible();
    await waitForImagesLoaded(weierGrid);
    await expect(weierGrid).toHaveScreenshot("surface-weierstrass-cards.png", surfaceSnapshotOpts);
  } finally {
    if (app) {
      await app.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});
