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

type CaptureViewPolicy = {
  padding: number;
  direction: { x: number; y: number; z: number };
};

const resolveOutputRoot = (): string => {
  const raw = process.env.MATH3D_THUMBNAIL_OUT_DIR?.trim();
  if (!raw) return path.join(repoRoot, "gallery-images", "captured");
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
};

const toPosixRelative = (absolutePath: string): string =>
  path.relative(repoRoot, absolutePath).split(path.sep).join("/");

const captureDelayMs = Number(process.env.MATH3D_THUMBNAIL_CAPTURE_DELAY_MS ?? 450);
const THUMBNAIL_ASPECT = 16 / 10;

const CANONICAL_CAPTURE_POLICY: CaptureViewPolicy = {
  // Targets ~65-75% object fill in the final 16:10 crop.
  padding: 1.74,
  direction: { x: 1, y: 0.68, z: 1.2 },
};

const OPEN_SURFACE_CAPTURE_POLICY: CaptureViewPolicy = {
  // Lower pitch helps preserve profile/waist/rim readability for open surfaces.
  padding: 1.8,
  direction: { x: 1.08, y: 0.58, z: 1.24 },
};

const SURFACE_CAPTURE_POLICY_OVERRIDES: Record<string, Partial<CaptureViewPolicy>> = {
  sphere: { padding: 1.8, direction: { x: 1, y: 0.72, z: 1.18 } },
  hyperboloid: { padding: 1.8, direction: { x: 1.1, y: 0.6, z: 1.24 } },
  paraboloid: { padding: 1.78, direction: { x: 1.12, y: 0.56, z: 1.2 } },
  cone: { padding: 1.78, direction: { x: 1.06, y: 0.58, z: 1.22 } },
  cylinder: { padding: 1.78, direction: { x: 1.04, y: 0.6, z: 1.22 } },
  graph_paraboloid: { padding: 1.78, direction: { x: 1.12, y: 0.56, z: 1.2 } },
};

const OBJECT_CAPTURE_POLICY_OVERRIDES: Record<string, Partial<CaptureViewPolicy>> = {
  sphere: { padding: 1.8, direction: { x: 1, y: 0.72, z: 1.18 } },
  torus: { padding: 1.74, direction: { x: 1.03, y: 0.66, z: 1.2 } },
  cone: { padding: 1.78, direction: { x: 1.06, y: 0.58, z: 1.22 } },
  cylinder: { padding: 1.78, direction: { x: 1.04, y: 0.6, z: 1.22 } },
};

const OPEN_SURFACE_HINTS = [
  "open",
  "paraboloid",
  "hyperboloid",
  "saddle",
  "wave",
  "sinc",
  "ripple",
  "gyroid",
  "scherk",
  "helicoid",
  "enneper",
  "boy",
  "dini",
  "mobius",
  "klein",
  "tube",
  "sweep",
  "ruled",
];

const mergeCapturePolicy = (
  base: CaptureViewPolicy,
  override?: Partial<CaptureViewPolicy>
): CaptureViewPolicy => ({
  padding: override?.padding ?? base.padding,
  direction: {
    x: override?.direction?.x ?? base.direction.x,
    y: override?.direction?.y ?? base.direction.y,
    z: override?.direction?.z ?? base.direction.z,
  },
});

const resolveSurfaceCapturePolicy = (id: string, family: string, subtype?: string): CaptureViewPolicy => {
  const key = id.trim().toLowerCase();
  const isOpenLike =
    family === "explicit" ||
    family === "weierstrass" ||
    subtype === "ruled" ||
    subtype === "sweep" ||
    OPEN_SURFACE_HINTS.some((hint) => key.includes(hint));
  const base = isOpenLike ? OPEN_SURFACE_CAPTURE_POLICY : CANONICAL_CAPTURE_POLICY;
  const direct = SURFACE_CAPTURE_POLICY_OVERRIDES[key];
  if (direct) return mergeCapturePolicy(base, direct);
  for (const [match, override] of Object.entries(SURFACE_CAPTURE_POLICY_OVERRIDES)) {
    if (key.includes(match)) return mergeCapturePolicy(base, override);
  }
  return base;
};

const resolveObjectCapturePolicy = (id: string): CaptureViewPolicy => {
  const key = id.trim().toLowerCase();
  const direct = OBJECT_CAPTURE_POLICY_OVERRIDES[key];
  if (direct) return mergeCapturePolicy(CANONICAL_CAPTURE_POLICY, direct);
  for (const [match, override] of Object.entries(OBJECT_CAPTURE_POLICY_OVERRIDES)) {
    if (key.includes(match)) return mergeCapturePolicy(CANONICAL_CAPTURE_POLICY, override);
  }
  return CANONICAL_CAPTURE_POLICY;
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

const clickFirstVisibleButton = async (page: Page, name: string): Promise<void> => {
  const buttons = page.getByRole("button", { name, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${name}`);
};

const setCheckboxValueIfVisible = async (page: Page, label: string, checked: boolean): Promise<void> => {
  const control = page.getByLabel(label, { exact: true });
  const count = await control.count();
  for (let i = 0; i < count; i++) {
    const box = control.nth(i);
    if (!(await box.isVisible())) continue;
    const current = await box.isChecked();
    if (current === checked) return;
    if (checked) await box.check();
    else await box.uncheck();
    await settleRenderer(page);
    return;
  }
};

const prepareGeometryCaptureUi = async (page: Page): Promise<void> => {
  const transformTab = page.getByRole("button", { name: "Transform", exact: true });
  if ((await transformTab.count()) > 0 && (await transformTab.first().isVisible())) {
    await transformTab.first().click();
    await settleRenderer(page);
  }
  await setCheckboxValueIfVisible(page, "Enable transform gizmo", false);
  await setCheckboxValueIfVisible(page, "Bounding box", false);
  await setCheckboxValueIfVisible(page, "Show 3D gizmo", false);
  const sceneTab = page.getByRole("button", { name: "Scene", exact: true });
  if ((await sceneTab.count()) > 0 && (await sceneTab.first().isVisible())) {
    await sceneTab.first().click();
    await settleRenderer(page);
  }
};

const openProceduralGeometry = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await clickFirstVisibleButton(page, "Procedural");
  await expect(page.getByTestId("geometry-gallery")).toBeVisible();
  await prepareGeometryCaptureUi(page);
};

const openSurfacesWorkspace = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Surfaces");
  await expect(page.getByTestId("surface-family-explicit")).toBeVisible();
  await expect(page.getByTestId("surface-viewer-canvas-host").first()).toBeVisible();
  await clickFirstVisibleButton(page, "Layout 3");
};

const ensureSurfacesGalleryMode = async (page: Page): Promise<void> => {
  const galleryButton = page.getByRole("button", { name: "Gallery", exact: true });
  if ((await galleryButton.count()) > 0 && (await galleryButton.first().isVisible())) {
    await galleryButton.first().click();
  }
  await expect(page.getByTestId("surface-family-explicit")).toBeVisible();
};

const setSurfacesLayout = async (page: Page, layoutLabel: "Layout 1" | "Layout 3"): Promise<void> => {
  const button = page.getByRole("button", { name: layoutLabel, exact: true });
  if ((await button.count()) === 0 || !(await button.first().isVisible())) return;
  await button.first().click();
  await settleRenderer(page);
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

const resetCameraIfAvailable = async (page: Page): Promise<void> => {
  const candidates = [
    page.getByRole("button", { name: "Reset camera", exact: true }),
    page.getByRole("button", { name: "Reset camera view", exact: true }),
  ];
  for (const locator of candidates) {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const button = locator.nth(i);
      if (!(await button.isVisible())) continue;
      await button.click();
      await settleRenderer(page);
      return;
    }
  }
};

const autoFitCameraForCapture = async (
  page: Page,
  policy: CaptureViewPolicy = CANONICAL_CAPTURE_POLICY
): Promise<void> => {
  const padding = Number.isFinite(policy.padding) ? policy.padding : CANONICAL_CAPTURE_POLICY.padding;
  const dx = Number.isFinite(policy.direction.x) ? policy.direction.x : CANONICAL_CAPTURE_POLICY.direction.x;
  const dy = Number.isFinite(policy.direction.y) ? policy.direction.y : CANONICAL_CAPTURE_POLICY.direction.y;
  const dz = Number.isFinite(policy.direction.z) ? policy.direction.z : CANONICAL_CAPTURE_POLICY.direction.z;
  await page.evaluate((payload: { padding: number; dx: number; dy: number; dz: number; aspect: number }) => {
    window.dispatchEvent(
      new CustomEvent("math3d:capture-autofit", {
        detail: {
          padding: payload.padding,
          direction: { x: payload.dx, y: payload.dy, z: payload.dz },
          aspect: payload.aspect,
        },
      })
    );
  }, { padding, dx, dy, dz, aspect: THUMBNAIL_ASPECT });
  await settleRenderer(page);
};

const centeredAspectClip = (
  box: { x: number; y: number; width: number; height: number },
  aspect: number
): { x: number; y: number; width: number; height: number } => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : THUMBNAIL_ASPECT;
  const hostWidth = Math.max(1, box.width);
  const hostHeight = Math.max(1, box.height);
  const hostAspect = hostWidth / hostHeight;

  let clipWidth = hostWidth;
  let clipHeight = hostHeight;
  if (hostAspect > safeAspect) {
    clipWidth = hostHeight * safeAspect;
  } else if (hostAspect < safeAspect) {
    clipHeight = hostWidth / safeAspect;
  }

  const x = box.x + (hostWidth - clipWidth) * 0.5;
  const y = box.y + (hostHeight - clipHeight) * 0.5;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(1, clipWidth),
    height: Math.max(1, clipHeight),
  };
};

const largestCaptureHost = async (page: Page) => {
  const hosts = page.getByTestId("surface-viewer-canvas-host");
  const count = await hosts.count();
  let bestIndex = -1;
  let bestArea = 0;
  for (let i = 0; i < count; i++) {
    const host = hosts.nth(i);
    if (!(await host.isVisible())) continue;
    const box = await host.boundingBox();
    if (!box) continue;
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }
  return bestIndex >= 0 ? hosts.nth(bestIndex) : hosts.first();
};

const captureScene = async (
  page: Page,
  outPath: string,
  policy: CaptureViewPolicy = CANONICAL_CAPTURE_POLICY
): Promise<void> => {
  const host = await largestCaptureHost(page);
  await expect(host).toBeVisible();
  await resetCameraIfAvailable(page);
  await prepareSurfaceCaptureUi(page);
  await autoFitCameraForCapture(page, policy);
  await settleRenderer(page);
  mkdirSync(path.dirname(outPath), { recursive: true });
  const hostBox = await host.boundingBox();
  if (!hostBox) throw new Error("Capture host bounding box unavailable.");
  const clip = centeredAspectClip(hostBox, THUMBNAIL_ASPECT);
  await page.screenshot({ path: outPath, clip });
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
    await settleRenderer(page);

    const outPath = path.join(outputRoot, "objects", `${id}.png`);
    await captureScene(page, outPath, resolveObjectCapturePolicy(id));
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
  await ensureSurfacesGalleryMode(page);
  await expect.poll(async () => page.locator(`[data-testid^='${options.testIdPrefix}']`).count()).toBeGreaterThan(0);
  const ids = await getIdsByTestIdPrefix(page, options.testIdPrefix, { visibleOnly: true });
  for (const id of ids) {
    await ensureSurfacesGalleryMode(page);
    await setSurfacesLayout(page, "Layout 3");
    const card = page.getByTestId(`${options.testIdPrefix}${id}`);
    if ((await card.count()) === 0 || !(await card.first().isVisible())) continue;
    await card.first().scrollIntoViewIfNeeded();
    await card.first().click();
    await settleRenderer(page);
    await setSurfacesLayout(page, "Layout 1");
    const outPath = path.join(outputRoot, options.folder, `${id}.png`);
    await captureScene(page, outPath, resolveSurfaceCapturePolicy(id, options.family, options.subtype));
    await setSurfacesLayout(page, "Layout 3");
    manifest.surfaces.push({
      id,
      family: options.family,
      subtype: options.subtype,
      file: toPosixRelative(outPath),
    });
  }
  await ensureSurfacesGalleryMode(page);
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
    await ensureSurfacesGalleryMode(page);

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
