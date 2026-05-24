import { expect, test, type Locator, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clickFirstVisible, clickFirstVisibleButton } from "./helpers/uiActions";

const repoRoot = path.resolve(__dirname, "..", "..");
const E2E_VIEWPORT = { width: 1024, height: 720 };

const normalizeWindowScale = async (app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.setZoomFactor(1);
  });
};

const launchApp = async (profileDir: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [".", "--force-device-scale-factor=1"],
    cwd: repoRoot,
    env,
  });
  const page = await app.firstWindow();
  await normalizeWindowScale(app);
  await page.setViewportSize(E2E_VIEWPORT);
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

const getSurfacesLayout3ModeToggle = (page: Page) => page.getByTestId("surfaces-layout3-mode-toggle").first();

const readToggleLabel = async (toggle: ReturnType<typeof getSurfacesLayout3ModeToggle>): Promise<string> =>
  (await toggle.innerText()).replace(/\s+/g, " ").trim().toLowerCase();

const setSurfacesLayout3PanelMode = async (page: Page, mode: "browse" | "work"): Promise<void> => {
  const toggle = getSurfacesLayout3ModeToggle(page);
  if ((await toggle.count()) === 0 || !(await toggle.isVisible())) return;
  const label = await readToggleLabel(toggle);
  if (mode === "work" && (label.includes("show scene/object tabs") || label.includes("tabs"))) {
    await clickFirstVisible(toggle, 'data-testid="surfaces-layout3-mode-toggle"');
    return;
  }
  if (mode === "browse" && label === "gallery") {
    await clickFirstVisible(toggle, 'data-testid="surfaces-layout3-mode-toggle"');
  }
};

const ensureSurfacesGalleryMode = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Surfaces");
  const layout3Buttons = page.getByRole("button", { name: /^(Layout 3|L3)$/ });
  if ((await layout3Buttons.count()) > 0 && (await layout3Buttons.first().isVisible())) {
    await clickFirstVisible(layout3Buttons, 'button "Layout 3/L3"');
  }
  await setSurfacesLayout3PanelMode(page, "browse");
  await expect(page.getByTestId("surface-family-explicit").first()).toBeVisible();
};

const snapshotOpts = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  maxDiffPixels: 120,
  timeout: 20_000,
};
const geometrySnapshotOpts = {
  ...snapshotOpts,
  maxDiffPixels: 2_000,
};
const surfaceSnapshotOpts = {
  ...snapshotOpts,
  maxDiffPixels: 30_000,
};

const stabilizeGalleryVisuals = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const styleId = "math3d-e2e-gallery-visual-stabilize";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      [data-testid="app-status-bar"] { display: none !important; }
      [data-testid="geometry-create-selected-card"] { display: none !important; }
      [data-testid="geometry-gallery"],
      [data-testid="surface-preset-grid"],
      [data-testid="param-preset-grid"],
      [data-testid="weierstrass-preset-grid"] {
        scrollbar-width: none !important;
      }
      [data-testid="geometry-gallery"] {
        min-width: 191px !important;
        width: 191px !important;
        max-width: 191px !important;
      }
      [data-testid="geometry-gallery"] > div:first-child {
        display: none !important;
      }
      [data-testid="surface-preset-grid"],
      [data-testid="param-preset-grid"],
      [data-testid="weierstrass-preset-grid"] {
        font-family: "Segoe UI", Tahoma, Arial, sans-serif !important;
      }
      [data-testid="surface-preset-grid"] .gallery-scan-card-title,
      [data-testid="param-preset-grid"] .gallery-scan-card-title,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-title {
        line-height: 16px !important;
      }
      [data-testid="surface-preset-grid"] .gallery-scan-card-summary,
      [data-testid="param-preset-grid"] .gallery-scan-card-summary,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-summary {
        line-height: 13px !important;
      }
      [data-testid="surface-preset-grid"] .gallery-scan-card-formula,
      [data-testid="param-preset-grid"] .gallery-scan-card-formula,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-formula {
        line-height: 12px !important;
      }
      [data-testid="surface-preset-grid"] .gallery-scan-card-chip,
      [data-testid="surface-preset-grid"] .gallery-scan-card-cta,
      [data-testid="surface-preset-grid"] .gallery-scan-card-info-pill,
      [data-testid="param-preset-grid"] .gallery-scan-card-chip,
      [data-testid="param-preset-grid"] .gallery-scan-card-cta,
      [data-testid="param-preset-grid"] .gallery-scan-card-info-pill,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-chip,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-cta,
      [data-testid="weierstrass-preset-grid"] .gallery-scan-card-info-pill {
        line-height: 11px !important;
      }
      [data-testid="geometry-gallery"]::-webkit-scrollbar,
      [data-testid="surface-preset-grid"]::-webkit-scrollbar,
      [data-testid="param-preset-grid"]::-webkit-scrollbar,
      [data-testid="weierstrass-preset-grid"]::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
      }
    `;
    document.head.appendChild(style);
  });
};

const waitForImagesLoaded = async (scope: Locator): Promise<void> => {
  await expect(scope).toBeVisible();
  await scope.evaluate((root) => {
    const images = Array.from(root.querySelectorAll("img"));
    for (const img of images) {
      img.loading = "eager";
      img.decoding = "sync";
    }
  });
  await expect
    .poll(
      async () =>
        scope.evaluate((root) => {
          const rootRect = root.getBoundingClientRect();
          const images = Array.from(root.querySelectorAll("img")).filter((img) => {
            const rect = img.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > rootRect.top &&
              rect.top < rootRect.bottom &&
              rect.right > rootRect.left &&
              rect.left < rootRect.right
            );
          });
          if (!images.length) return 0;
          const pending = images.filter((img) => !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0);
          return pending.length;
        }),
      { timeout: 10_000, intervals: [150, 250, 500] }
    )
    .toBe(0)
    .catch(() => undefined);
  await scope.evaluate(
    (root) =>
      new Promise<void>((resolve) => {
        const rootRect = root.getBoundingClientRect();
        const images = Array.from(root.querySelectorAll("img")).filter((img) => {
          const rect = img.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > rootRect.top &&
            rect.top < rootRect.bottom &&
            rect.right > rootRect.left &&
            rect.left < rootRect.right
          );
        });
        const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        if (!images.length) {
          settle();
          return;
        }
        Promise.all(
          images.map((img) => {
            try {
              if (typeof img.decode === "function") {
                return img.decode().catch(() => undefined);
              }
            } catch {
              return Promise.resolve();
            }
            return Promise.resolve();
          })
        ).finally(settle);
      })
  );
  await scope.page().waitForTimeout(350);
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
    await stabilizeGalleryVisuals(page);

    await clickFirstVisibleButton(page, "Geometry");
    await clickFirstVisibleButton(page, "Procedural");
    await clickFirstVisible(page.getByRole("button", { name: "Diagram", exact: true }), 'button "Diagram"');
    await page.evaluate(() => {
      const byTestId = document.querySelector("[data-testid='geometry-create-selected-card']") as HTMLElement | null;
      if (byTestId) {
        byTestId.style.display = "none";
        return;
      }
      const addButton = document.querySelector("[data-testid='geometry-add-object']") as HTMLElement | null;
      let cursor = addButton;
      while (cursor) {
        if ((cursor.textContent ?? "").includes("Selected:")) {
          cursor.style.display = "none";
          break;
        }
        cursor = cursor.parentElement;
      }
    });
    const geometryGallery = page.getByTestId("geometry-gallery");
    await expect(geometryGallery).toBeVisible();
    await waitForImagesLoaded(geometryGallery);
    await expect(geometryGallery).toHaveScreenshot("geometry-gallery-cards.png", geometrySnapshotOpts);

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
