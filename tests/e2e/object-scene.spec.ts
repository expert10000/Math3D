import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repoRoot = path.resolve(__dirname, "..", "..");
const COMPUTE_ENGINE_FIRST_LAUNCH_KEY = "math3d.computeEngines.firstLaunchSeen";

type GeometryStats = {
  objectCount: number;
  visibleCount: number;
};

const parseGeometryStats = (raw: string): GeometryStats => {
  const match = raw.match(/(\d+)\s+objects\s+\((\d+)\s+visible\)/i);
  if (!match) {
    throw new Error(`Unable to parse geometry stats from: "${raw}"`);
  }
  return {
    objectCount: Number(match[1]),
    visibleCount: Number(match[2]),
  };
};

const readGeometryStats = async (page: Page): Promise<GeometryStats> => {
  const text = await page.getByTestId("geometry-scene-stats").innerText();
  return parseGeometryStats(text);
};

const launchApp = async (env: Record<string, string | undefined>): Promise<{ app: ElectronApplication; page: Page }> => {
  const launchEnv: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    ELECTRON_ENABLE_LOGGING: "1",
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
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
};

const clickFirstVisibleButton = async (page: Page, name: string | RegExp) => {
  const buttons = page.getByRole("button", typeof name === "string" ? { name, exact: true } : { name });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
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
};

const openGeometrySceneTree = async (page: Page) => {
  await clickFirstVisibleButton(page, /^(?:\d+\s+)?Place$/);
  await clickFirstVisibleButton(page, "Scene tree");
  await expect(page.getByTestId("unified-object-tree")).toBeVisible();
};

const openWorkbookPanel = async (page: Page) => {
  await clickFirstVisibleButton(page, "Surfaces");
  await clickFirstVisibleButton(page, "Workbook");
};

const installSaveCapture = async (page: Page) => {
  await page.evaluate(() => {
    const win = window as unknown as {
      __math3dE2E?: { installed?: boolean; lastSavedText?: string | null };
    };
    if (win.__math3dE2E?.installed) return;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    win.__math3dE2E = { installed: true, lastSavedText: null };
    URL.createObjectURL = (obj: Blob | MediaSource): string => {
      if (obj instanceof Blob) {
        void obj.text().then((text) => {
          if (win.__math3dE2E) win.__math3dE2E.lastSavedText = text;
        });
      }
      return originalCreateObjectURL(obj);
    };
  });
};

const saveWorkspace = async (page: Page): Promise<string> => {
  await openWorkbookPanel(page);
  await installSaveCapture(page);
  await page.evaluate(() => {
    const win = window as unknown as { __math3dE2E?: { lastSavedText?: string | null } };
    if (win.__math3dE2E) win.__math3dE2E.lastSavedText = null;
  });
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const win = window as unknown as { __math3dE2E?: { lastSavedText?: string | null } };
      return win.__math3dE2E?.lastSavedText?.length ?? 0;
    });
  }).toBeGreaterThan(0);
  const payload = await page.evaluate(() => {
    const win = window as unknown as { __math3dE2E?: { lastSavedText?: string | null } };
    return win.__math3dE2E?.lastSavedText ?? "";
  });
  const outPath = path.join(os.tmpdir(), `math3d-workspace-${Date.now()}-${Math.random().toString(16).slice(2)}.math3d`);
  writeFileSync(outPath, payload, "utf8");
  return outPath;
};

const openWorkspace = async (page: Page, filePath: string) => {
  await openWorkbookPanel(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open...", exact: true }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
};

test("Object/scene behavior: create, toggle visibility, remove, overlay state remains consistent", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-obj-"));
  const env = {
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
  };

  let app: ElectronApplication | null = null;
  try {
    const launched = await launchApp(env);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page);
    await openGeometrySceneTree(page);

    const initialStats = await readGeometryStats(page);

    await clickFirstVisibleButton(page, /^(?:\d+\s+)?Create$/);
    await page.getByTestId("geometry-add-object").click();
    await expect.poll(async () => (await readGeometryStats(page)).objectCount).toBe(initialStats.objectCount + 1);
    const createdStats = await readGeometryStats(page);
    expect(createdStats.visibleCount).toBe(initialStats.visibleCount + 1);

    await openGeometrySceneTree(page);
    const sceneTree = page.getByTestId("unified-object-tree");
    const hideButton = sceneTree.getByRole("button", { name: /^Hide$/ }).first();
    await expect(hideButton).toBeVisible();
    await hideButton.click();
    await expect.poll(async () => {
      const stats = await readGeometryStats(page);
      return stats.visibleCount;
    }).toBe(createdStats.visibleCount - 1);

    const actionMenu = sceneTree.getByTitle("Actions").first();
    await actionMenu.click();
    await sceneTree.getByRole("button", { name: "Delete", exact: true }).first().click();
    await expect.poll(async () => (await readGeometryStats(page)).objectCount).toBe(initialStats.objectCount);
    const finalStats = await readGeometryStats(page);
    expect(finalStats.objectCount).toBe(initialStats.objectCount);
    expect(finalStats.visibleCount).toBe(initialStats.visibleCount);

    await expect(page.getByTestId("unified-object-tree")).toBeVisible();
    await expect(page.getByTestId("app-status-bar")).toContainText("Geometry viewer (procedural)");
  } finally {
    if (app) {
      await app.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry gallery: select vs add flow, quick add, and filtering", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-gallery-"));
  const env = {
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
  };

  let app: ElectronApplication | null = null;
  try {
    const launched = await launchApp(env);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page);
    const baseCount = (await readGeometryStats(page)).objectCount;

    const sphereCard = page.getByTestId("geometry-gallery-card-sphere");
    await expect(sphereCard).toBeVisible();
    await sphereCard.click({ position: { x: 16, y: 16 } });
    await expect.poll(async () => (await readGeometryStats(page)).objectCount).toBe(baseCount);

    await page.getByTestId("geometry-add-object").click();
    await expect.poll(async () => (await readGeometryStats(page)).objectCount).toBe(baseCount + 1);

    const quickAddTorus = page.getByTestId("geometry-gallery-quick-add-torus");
    await expect(quickAddTorus).toBeVisible();
    await expect(quickAddTorus).toBeEnabled();
    await quickAddTorus.dispatchEvent("click");
    await expect.poll(async () => (await readGeometryStats(page)).objectCount).toBe(baseCount + 2);

    await page.getByTestId("geometry-gallery-search").fill("zzzz-no-match");
    await expect(page.getByText("No gallery cards match this search/filter.")).toBeVisible();

    await page.getByTestId("geometry-gallery-search").fill("");
    await page.getByTestId("geometry-gallery-category-filter").selectOption("polyhedra");
    await expect(page.getByTestId("geometry-gallery-card-cube")).toBeVisible();
    await expect(page.getByTestId("geometry-gallery-card-sphere")).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Persistence: save workspace and reopen restores scene", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-persist-"));
  const env = {
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
  };

  let firstApp: ElectronApplication | null = null;
  let secondApp: ElectronApplication | null = null;
  let savedWorkspacePath: string | null = null;
  try {
    const first = await launchApp(env);
    firstApp = first.app;
    const firstPage = first.page;
    await resetStorage(firstPage);
    await openProceduralGeometry(firstPage);
    const baseCount = (await readGeometryStats(firstPage)).objectCount;

    await firstPage.getByTestId("geometry-add-object").click();
    await expect.poll(async () => (await readGeometryStats(firstPage)).objectCount).toBe(baseCount + 1);
    const savedStats = await readGeometryStats(firstPage);

    savedWorkspacePath = await saveWorkspace(firstPage);
    await expect.poll(async () => {
      return firstPage.evaluate(() => Number(localStorage.getItem("math3d.workbook.manualSaveAt.v1") ?? 0));
    }).toBeGreaterThan(0);

    await firstApp.close();
    firstApp = null;

    const second = await launchApp(env);
    secondApp = second.app;
    const secondPage = second.page;

    await openWorkspace(secondPage, savedWorkspacePath);
    await openProceduralGeometry(secondPage);
    await expect.poll(async () => (await readGeometryStats(secondPage)).objectCount).toBe(savedStats.objectCount);
    const reopenedStats = await readGeometryStats(secondPage);
    expect(reopenedStats.objectCount).toBe(savedStats.objectCount);
    expect(reopenedStats.visibleCount).toBe(savedStats.visibleCount);
    await expect(secondPage.getByTestId("app-status-bar")).toContainText("Geometry viewer (procedural)");
  } finally {
    if (firstApp) {
      await firstApp.close();
    }
    if (secondApp) {
      await secondApp.close();
    }
    if (savedWorkspacePath) {
      rmSync(savedWorkspacePath, { force: true });
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
});
