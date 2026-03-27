import { expect, test, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");

type ObjectCaptureEntry = {
  id: string;
  file: string;
};

type SurfaceCaptureEntry = {
  id: string;
  family: string;
  subtype?: string;
  file: string;
};

type CaptureManifest = {
  generatedAt: string;
  outputRoot: string;
  objects: ObjectCaptureEntry[];
  surfaces: SurfaceCaptureEntry[];
};

const resolveOutputRoot = (): string => {
  const raw = process.env.MATH3D_THUMBNAIL_OUT_DIR?.trim();
  if (!raw) return path.join(repoRoot, "gallery-images", "captured");
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
};

const toPosixRelative = (absolutePath: string): string =>
  path.relative(repoRoot, absolutePath).split(path.sep).join("/");

const captureDelayMs = Number(process.env.MATH3D_THUMBNAIL_CAPTURE_DELAY_MS ?? 450);

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

const openProceduralGeometry = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Geometry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Procedural", exact: true }).click();
  await expect(page.getByTestId("geometry-gallery")).toBeVisible();
};

const openSurfacesWorkspace = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Surfaces", exact: true }).click();
  await expect(page.getByTestId("surface-family-explicit")).toBeVisible();
  await expect(page.getByTestId("surface-viewer-canvas-host").first()).toBeVisible();
};

const settleRenderer = async (page: Page): Promise<void> => {
  await page.waitForTimeout(captureDelayMs);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
};

const prepareSurfaceCaptureUi = async (page: Page): Promise<void> => {
  const surfaceParamOverlay = page.locator('[aria-label="Surface parameter overlay"]');
  if ((await surfaceParamOverlay.count()) > 0 && (await surfaceParamOverlay.first().isVisible())) {
    const closeButton = surfaceParamOverlay.first().getByRole("button", { name: "Close", exact: true });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  await page.evaluate(() => {
    const styleId = "math3d-thumb-capture-clean-ui";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      [data-testid="app-status-bar"] { display: none !important; }
      [aria-label="Surface parameter overlay"] { display: none !important; }
      div:has(> [data-testid="surface-viewer-canvas-host"]) > :not([data-testid="surface-viewer-canvas-host"]) {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  });
  await page.waitForTimeout(120);
};

const captureScene = async (page: Page, outPath: string): Promise<void> => {
  const host = page.getByTestId("surface-viewer-canvas-host").first();
  await expect(host).toBeVisible();
  await prepareSurfaceCaptureUi(page);
  await settleRenderer(page);
  mkdirSync(path.dirname(outPath), { recursive: true });
  await host.screenshot({ path: outPath });
};

const clearGeometryObjects = async (page: Page): Promise<void> => {
  const rows = page.getByTestId("geometry-object-row");
  while (true) {
    const count = await rows.count();
    if (count === 0) break;
    await page.getByTestId("geometry-object-delete").first().click();
    await expect.poll(async () => rows.count()).toBeLessThan(count);
  }
};

const getIdsByTestIdPrefix = async (
  page: Page,
  prefix: string,
  options: { visibleOnly?: boolean } = {}
): Promise<string[]> => {
  const locator = page.locator(`[data-testid^='${prefix}']`);
  const count = await locator.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (options.visibleOnly && !(await item.isVisible())) continue;
    const testId = await item.getAttribute("data-testid");
    if (!testId || !testId.startsWith(prefix)) continue;
    ids.push(testId.slice(prefix.length));
  }
  return ids;
};

const captureObjectGallery = async (
  page: Page,
  outputRoot: string,
  manifest: CaptureManifest
): Promise<void> => {
  const ids = await getIdsByTestIdPrefix(page, "geometry-gallery-card-");
  for (const id of ids) {
    const card = page.getByTestId(`geometry-gallery-card-${id}`);
    const quickAdd = page.getByTestId(`geometry-gallery-quick-add-${id}`);
    await card.scrollIntoViewIfNeeded();
    if (await quickAdd.isDisabled()) continue;

    await clearGeometryObjects(page);
    await quickAdd.click();
    await expect.poll(async () => page.getByTestId("geometry-object-row").count()).toBeGreaterThan(0);

    const outPath = path.join(outputRoot, "objects", `${id}.png`);
    await captureScene(page, outPath);
    manifest.objects.push({ id, file: toPosixRelative(outPath) });
  }
};

const captureSurfaceCards = async (
  page: Page,
  outputRoot: string,
  manifest: CaptureManifest,
  options: {
    family: string;
    subtype?: string;
    testIdPrefix: "surface-preset-card-" | "param-preset-card-" | "weierstrass-preset-card-";
    folder: string;
  }
): Promise<void> => {
  await expect.poll(async () => page.locator(`[data-testid^='${options.testIdPrefix}']`).count()).toBeGreaterThan(0);
  const ids = await getIdsByTestIdPrefix(page, options.testIdPrefix, { visibleOnly: true });
  for (const id of ids) {
    const card = page.getByTestId(`${options.testIdPrefix}${id}`);
    if ((await card.count()) === 0 || !(await card.first().isVisible())) continue;
    await card.first().scrollIntoViewIfNeeded();
    await card.first().click();
    const outPath = path.join(outputRoot, options.folder, `${id}.png`);
    await captureScene(page, outPath);
    manifest.surfaces.push({
      id,
      family: options.family,
      subtype: options.subtype,
      file: toPosixRelative(outPath),
    });
  }
};

test.setTimeout(20 * 60 * 1000);

test("Capture gallery thumbnails for objects and surfaces", async () => {
  const outputRoot = resolveOutputRoot();
  mkdirSync(outputRoot, { recursive: true });
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-thumbs-"));

  const manifest: CaptureManifest = {
    generatedAt: new Date().toISOString(),
    outputRoot: toPosixRelative(outputRoot),
    objects: [],
    surfaces: [],
  };

  let app: ElectronApplication | null = null;
  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;
    await resetStorage(page);

    await openProceduralGeometry(page);
    await captureObjectGallery(page, outputRoot, manifest);

    await openSurfacesWorkspace(page);

    await page.getByTestId("surface-family-explicit").click();
    await captureSurfaceCards(page, outputRoot, manifest, {
      family: "explicit",
      testIdPrefix: "surface-preset-card-",
      folder: path.join("surfaces", "explicit"),
    });

    await page.getByTestId("surface-family-implicit").click();
    await captureSurfaceCards(page, outputRoot, manifest, {
      family: "implicit",
      testIdPrefix: "surface-preset-card-",
      folder: path.join("surfaces", "implicit"),
    });

    await page.getByTestId("surface-family-parametric").click();
    await captureSurfaceCards(page, outputRoot, manifest, {
      family: "parametric",
      testIdPrefix: "param-preset-card-",
      folder: path.join("surfaces", "parametric"),
    });

    await page.getByTestId("surface-family-spline").click();
    await captureSurfaceCards(page, outputRoot, manifest, {
      family: "spline",
      testIdPrefix: "param-preset-card-",
      folder: path.join("surfaces", "spline"),
    });

    await page.getByTestId("surface-family-constructed").click();
    for (const subtype of ["rotational", "sweep", "tube", "ruled"] as const) {
      await page.getByTestId(`param-constructed-subtype-${subtype}`).click();
      await captureSurfaceCards(page, outputRoot, manifest, {
        family: "constructed",
        subtype,
        testIdPrefix: "param-preset-card-",
        folder: path.join("surfaces", "constructed", subtype),
      });
    }

    const weierstrassFamilyButton = page.getByTestId("surface-family-weierstrass");
    if (!(await weierstrassFamilyButton.isVisible())) {
      await page.getByTestId("surface-family-more").click();
    }
    await page.getByTestId("surface-family-weierstrass").click();
    await captureSurfaceCards(page, outputRoot, manifest, {
      family: "weierstrass",
      testIdPrefix: "weierstrass-preset-card-",
      folder: path.join("surfaces", "weierstrass"),
    });

    writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  } finally {
    if (app) {
      await app.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});
