import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const match =
    raw.match(/(\d+)\s+objects\s+(?:\||\u00b7)\s+(\d+)\s+visible/i) ??
    raw.match(/(\d+)\s+objects\s+\|\s+(\d+)\s+visible/i) ??
    raw.match(/(\d+)\s+objects\s+\((\d+)\s+visible\)/i);
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

const saveWorkspace = async (page: Page, testInfo: TestInfo): Promise<string> => {
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
  const outPath = testInfo.outputPath("saved-workspace.math3d");
  mkdirSync(path.dirname(outPath), { recursive: true });
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

test("Geometry professional shell keeps current workspaces and tools reachable", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-geometry-shell-"));
  const env = { APPDATA: profileDir, LOCALAPPDATA: profileDir };

  let app: ElectronApplication | null = null;
  try {
    const launched = await launchApp(env);
    app = launched.app;
    const page = launched.page;
    await resetStorage(page);
    await openProceduralGeometry(page);

    await expect(page.getByTestId("geometry-professional-shell")).toBeVisible();
    for (const id of ["gallery", "new", "demo", "compare", "more"]) {
      await expect(page.getByTestId(`geometry-professional-action-${id}`)).toBeVisible();
    }
    for (const id of ["construct", "modify", "analyze", "navigate"]) {
      await expect(page.getByTestId(`geometry-professional-tool-${id}`)).toBeVisible();
    }

    await page.getByTestId("geometry-professional-tool-modify").click();
    await expect(page.getByTestId("geometry-selection-driven-modify")).toBeVisible();
    await expect(page.getByTestId("geometry-modify-group-body")).toBeVisible();
    await expect(page.getByTestId("geometry-modify-group-curve")).toHaveCount(0);
    await expect(page.getByTestId("geometry-modify-command-body-boolean")).toHaveAttribute("data-status", "warning");
    await expect(page.getByTestId("geometry-modify-command-body-shell")).toHaveAttribute("data-status", "unavailable");
    await expect(page.getByTestId("geometry-modify-command-body-shell")).toContainText("exact editing kernel");

    await page.getByTestId("geometry-professional-action-gallery").click();
    await expect(page.getByTestId("geometry-gallery-search")).toBeVisible();
    await expect(page.getByTestId("geometry-professional-expanded-object-gallery")).toBeVisible();
    await expect(page.getByTestId("geometry-professional-expanded-scene-gallery")).toBeVisible();

    await page.getByTestId("geometry-professional-tool-navigate").click();
    await expect(page.getByTestId("unified-object-tree")).toBeVisible();
    await expect(page.getByTestId("geometry-semantic-navigator")).toBeVisible();
    await expect(page.getByTestId("geometry-semantic-selection-readout")).toContainText("revision");
    await page.getByTestId("geometry-right-panel-tab-dependencies").click();
    await expect(page.getByTestId("geometry-lineage-inspector")).toBeVisible();
    await expect(page.getByTestId("geometry-canonical-metadata")).toContainText("geometry-object-metadata-v1");
    await expect(page.getByTestId("geometry-canonical-metadata")).toContainText("parametric-procedural");
    await expect(page.getByTestId("geometry-canonical-metadata")).toContainText("scene-unit");
    for (const id of ["open-parent", "open-source", "show-dependencies", "show-dependents", "recompute", "freeze", "detach"]) {
      await expect(page.getByTestId(`geometry-lineage-action-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("geometry-lineage-action-show-dependents")).toBeEnabled();
    await page.getByTestId("geometry-lineage-action-show-dependents").click();
    await expect(page.getByTestId("geometry-semantic-filter-trimBoundaries")).toBeVisible();
    await page.getByTestId("geometry-semantic-filter-solids").click();
    await expect(page.getByTestId("geometry-semantic-selection-readout")).toContainText("No semantic entity selected");
    await page.getByTestId("geometry-semantic-filter-solids").click();
    await expect(page.getByTestId("geometry-semantic-selection-readout")).toContainText("revision");
    await page.getByTestId("geometry-semantic-filter-hidden").click();
    await expect(page.getByTestId("geometry-semantic-filter-hidden")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("geometry-semantic-selector-same-surface-type").click();
    await expect(page.getByTestId("geometry-semantic-status")).toContainText("selected");
    await page.getByTestId("geometry-semantic-command-frame").click();
    await expect(page.getByTestId("geometry-semantic-status")).toContainText("Framed");
    await page.getByTestId("geometry-professional-tool-analyze").click();
    await page.getByRole("button", { name: "volume / area / centroid / bounds", exact: true }).click();
    await expect(page.getByTestId("geometry-analysis-result-semantic-source")).toContainText("geometry-semantic-v1");
    await expect(page.getByTestId("geometry-analysis-result-lifecycle")).toContainText("ready");
    await expect(page.getByTestId("geometry-analysis-result-request")).toContainText("scalar / point / table / warning");
    await expect(page.getByTestId("geometry-analysis-result-provenance")).toContainText("Geometry analytical core");
    await expect(page.getByTestId("geometry-analysis-result-fingerprint")).toHaveAttribute("title", /sourceRevision/);
    await expect(page.getByTestId("geometry-analysis-result-computation-history")).toContainText("1 run");
    await expect(page.getByTestId("geometry-analysis-result-history")).toHaveValue(/geometry:/);
    await expect(page.getByTestId("geometry-analysis-result-definition")).toContainText("Quantity");
    await expect(page.getByTestId("geometry-exact-curve-analysis-controls")).toBeVisible();
    await page.getByTestId("geometry-exact-curve-preset").selectOption("circle");
    await page.getByTestId("geometry-run-exact-curve-analysis").click();
    await expect(page.getByTestId("geometry-exact-curve-result")).toContainText("Curvature κ");
    await expect(page.getByTestId("geometry-exact-curve-frame")).toContainText("r‴(t)");
    await expect(page.getByTestId("geometry-exact-curve-diagnostics")).toContainText("first exact, second exact, third exact");
    await expect(page.getByTestId("geometry-exact-curve-visualization")).toContainText("Osculating circle: ready");
    await expect(page.getByTestId("geometry-exact-curve-plot")).toBeVisible();
    await expect(page.getByTestId("geometry-analysis-result-provenance")).toContainText("Geometry exact curve core");
    await expect(page.getByTestId("geometry-analysis-result-warnings")).toContainText("None");
    await expect(page.getByTestId("geometry-exact-curve-open-curves")).toBeVisible();
    await expect(page.getByTestId("geometry-exact-surface-analysis-controls")).toBeVisible();
    await page.getByTestId("geometry-exact-surface-preset").selectOption("sphere");
    await page.getByTestId("geometry-run-exact-surface-analysis").click();
    await expect(page.getByTestId("geometry-exact-surface-result")).toContainText("Gaussian K");
    await expect(page.getByTestId("geometry-exact-surface-forms")).toContainText("Shape operator");
    await expect(page.getByTestId("geometry-exact-surface-visualization")).toContainText("Normal sections: 2/2");
    await expect(page.getByTestId("geometry-exact-surface-heatmap")).toBeVisible();
    await expect(page.getByTestId("geometry-exact-surface-conventions")).toContainText("k1>=k2");
    await expect(page.getByTestId("geometry-exact-surface-conventions")).toContainText("compatible yes");
    await expect(page.getByTestId("geometry-analysis-result-provenance")).toContainText("Geometry exact surface core");
    await expect(page.getByTestId("geometry-analysis-result-warnings")).toContainText("degenerate");
    await expect(page.getByTestId("geometry-exact-surface-open-surfaces")).toBeVisible();
    await expect(page.getByTestId("geometry-intrinsic-analysis-controls")).toBeVisible();
    await page.getByTestId("geometry-run-intrinsic-analysis").click();
    await expect(page.getByTestId("geometry-intrinsic-analysis-result")).toContainText("Arc length");
    await expect(page.getByTestId("geometry-intrinsic-metric")).toContainText("Christoffel");
    await expect(page.getByTestId("geometry-intrinsic-geodesics")).toContainText("analytic");
    await expect(page.getByTestId("geometry-intrinsic-overlays")).toContainText("metric ellipse");
    await expect(page.getByTestId("geometry-intrinsic-endpoints")).toContainText("picked-surface-point");
    await page.getByTestId("geometry-professional-tool-construct").click();
    await expect(page.getByTestId("geometry-construct-panel-tab-create")).toBeVisible();
    await expect(page.getByTestId("geometry-construct-taxonomy")).toBeVisible();
    await page.getByTestId("geometry-construct-tool-reference-lines").click();
    await expect(page.getByTestId("geometry-construct-existing-tools")).toContainText("Existing Lines tools");
    await expect(page.getByTestId("geometry-construct-category-lines")).toHaveAttribute("open", "");
    await page.getByTestId("geometry-construct-family-surfaces").locator("summary").click();
    await page.getByTestId("geometry-construct-tool-surface-bezier").click();
    await expect(page.getByTestId("geometry-construct-draft")).toContainText("Preview active · not in history");
    await page.getByTestId("geometry-construct-param-size").fill("2.2");
    await expect(page.getByTestId("geometry-construct-commit")).toBeEnabled();
    await page.getByTestId("geometry-construct-commit").click();
    await expect(page.getByText(/Committed Bézier/)).toBeVisible();

    await page.getByTestId("geometry-professional-action-new").click();
    await page.getByTestId("geometry-professional-expanded-new-scratch").click();
    await expect(page.getByTestId("geometry-mode-scratch")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("geometry-publish-construction-scene")).toBeEnabled();
    await page.getByTestId("geometry-publish-construction-scene").click();
    await expect(page.getByTestId("geometry-mode-procedural")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("unified-object-tree")).toContainText("Scratch construction");
    const newWorkbookEntry = page.getByTestId("geometry-professional-expanded-new-workbook");
    if (!(await newWorkbookEntry.isVisible())) await page.getByTestId("geometry-professional-action-new").click();
    await newWorkbookEntry.click();
    await expect(page.getByTestId("geometry-mode-workbook")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("geometry-professional-action-more").click();
    await expect(page.getByText("Procedural scripting", { exact: true })).toBeVisible();
    await expect(page.getByTestId("geometry-professional-expanded-script")).toBeVisible();
    await page.getByTestId("geometry-scene-to-script").click();
    await expect(page.getByTestId("geometry-procedural-script-editor")).toContainText("constructionKind=surface-bezier");
    await expect(page.getByTestId("geometry-procedural-script-editor")).toContainText("authoringSource=professional-construct");
    await page.getByTestId("geometry-scene-script-roundtrip").click();
    await expect(page.getByText(/Scene -> script -> render matched/)).toBeVisible();

    await page.getByTestId("geometry-professional-action-demo").click();
    await expect(page.getByTestId("geometry-mode-demo")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("geometry-mode-procedural").click();
    await expect(page.getByTestId("geometry-mode-procedural")).toHaveAttribute("aria-pressed", "true");
  } finally {
    if (app) await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

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

test("Persistence: save workspace and reopen restores scene", async ({}, testInfo) => {
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

    savedWorkspacePath = await saveWorkspace(firstPage, testInfo);
    const savedWorkspaceText = readFileSync(savedWorkspacePath, "utf8");
    expect(savedWorkspaceText).toContain('"sceneIdentities"');
    expect(savedWorkspaceText).toContain('"selectedSceneEntityId"');
    expect(savedWorkspaceText).toContain('"moduleKind": "geometry"');
    expect(savedWorkspaceText).toContain('"metadataSchema": "geometry-object-metadata-v1"');
    expect(savedWorkspaceText).toContain('"representation": "parametric-procedural"');
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
    await secondPage.getByTestId("geometry-right-panel-tab-dependencies").click();
    await expect(secondPage.getByTestId("geometry-canonical-metadata")).toContainText("geometry-object-metadata-v1");
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
