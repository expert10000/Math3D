import { expect, test, type Locator, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

const snapshotOpts = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  maxDiffPixels: 120,
  timeout: 20_000,
};

const waitForImagesLoaded = async (scope: Locator): Promise<void> => {
  await expect.poll(async () => {
    return scope.evaluate((root) => {
      const images = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
      return images.every((img) => img.complete && img.naturalWidth > 0);
    });
  }).toBe(true);
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

    await page.getByRole("button", { name: "Geometry", exact: true }).click();
    await page.getByRole("button", { name: "Procedural", exact: true }).click();
    const geometryGallery = page.getByTestId("geometry-gallery");
    await expect(geometryGallery).toBeVisible();
    await waitForImagesLoaded(geometryGallery);
    await expect(geometryGallery).toHaveScreenshot("geometry-gallery-cards.png", snapshotOpts);

    await page.getByRole("button", { name: "Surfaces", exact: true }).click();
    await page.getByTestId("surface-family-implicit").click();
    const implicitGrid = page.getByTestId("surface-preset-grid");
    await expect(implicitGrid).toBeVisible();
    await waitForImagesLoaded(implicitGrid);
    await expect(implicitGrid).toHaveScreenshot("surface-implicit-cards.png", snapshotOpts);

    await page.getByTestId("surface-family-parametric").click();
    const paramGrid = page.getByTestId("param-preset-grid");
    await expect(paramGrid).toBeVisible();
    await waitForImagesLoaded(paramGrid);
    await expect(paramGrid).toHaveScreenshot("surface-parametric-cards.png", snapshotOpts);

    const weierstrassFamilyButton = page.getByTestId("surface-family-weierstrass");
    if (!(await weierstrassFamilyButton.isVisible())) {
      await page.getByTestId("surface-family-more").click();
    }
    await page.getByTestId("surface-family-weierstrass").click();
    const weierGrid = page.getByTestId("weierstrass-preset-grid");
    await expect(weierGrid).toBeVisible();
    await waitForImagesLoaded(weierGrid);
    await expect(weierGrid).toHaveScreenshot("surface-weierstrass-cards.png", snapshotOpts);
  } finally {
    if (app) {
      await app.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});
