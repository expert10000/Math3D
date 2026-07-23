import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repoRoot = path.resolve(__dirname, "..", "..");
const COMPUTE_ENGINE_FIRST_LAUNCH_KEY = "math3d.computeEngines.firstLaunchSeen";
const GEOMETRY_CONSTRUCT_PANEL_KEY = "math3d.ui.geometryConstructPanel.v1";

type PickMode = "object" | "face" | "edge" | "vertex";
type Bounds = { x: number; y: number; width: number; height: number };
type ViewerPoint = { x: number; y: number };
type EdgePickCandidate = {
  edgeLabel: string;
  objectId: string;
  vertices: [number, number];
  point: ViewerPoint;
};

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

const findFirstVisibleButton = async (page: Page, name: string | RegExp) => {
  const buttons = page.getByRole("button", typeof name === "string" ? { name, exact: true } : { name });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (await button.isVisible().catch(() => false)) return button;
  }
  return null;
};

const selectConstructPanelTab = async (
  page: Page,
  tabId: "create" | "edit" | "relations" | "measure" | "tree" | "inspect"
) => {
  const tab = page.getByTestId(`geometry-construct-panel-tab-${tabId}`);
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
};

const configureGeometryViewerForConstructionPicking = async (page: Page) => {
  const moveButtons = page.getByRole("button", { name: "Move", exact: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const moveCount = await moveButtons.count();
    let clicked = false;
    for (let i = 0; i < moveCount; i += 1) {
      const button = moveButtons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;
      if ((await button.getAttribute("aria-pressed").catch(() => null)) === "true") {
        await button.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
    await page.waitForTimeout(100);
  }
  await expect.poll(async () => {
    const moveCount = await moveButtons.count();
    for (let i = 0; i < moveCount; i += 1) {
      const button = moveButtons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;
      if ((await button.getAttribute("aria-pressed").catch(() => null)) === "true") return false;
    }
    return true;
  }).toBe(true);

  const fullButton = await findFirstVisibleButton(page, "Full");
  if (!fullButton) throw new Error("Visible Full quality button not found.");
  if ((await fullButton.getAttribute("aria-pressed").catch(() => null)) !== "true") {
    await fullButton.click();
  }
  await expect(fullButton).toHaveAttribute("aria-pressed", "true");
};

const openProceduralGeometry = async (page: Page, quickAddId = "torus") => {
  await clickFirstVisibleButton(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await clickFirstVisibleButton(page, "Procedural");
  await expect(page.getByTestId("geometry-scene-stats")).toBeVisible();
  const quickAdd = page.getByTestId(`geometry-gallery-quick-add-${quickAddId}`);
  await expect(quickAdd).toBeVisible();
  await quickAdd.click();
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
  const selectionTab = page.getByTestId("geometry-right-panel-tab-selection");
  if (await selectionTab.isVisible().catch(() => false)) {
    await selectionTab.click();
  }
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

const parseEdgeVertices = (edgeLabel: string): [number, number] | null => {
  const match = edgeLabel.match(/\[(\d+),\s*(\d+)\]/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
};

const sharedVertexCount = (a: EdgePickCandidate, b: EdgePickCandidate) =>
  a.vertices.filter((vertex) => b.vertices.includes(vertex)).length;

const edgePickKey = (candidate: EdgePickCandidate) => `${candidate.objectId}:${candidate.edgeLabel}`;

const shareExactlyOneVertex = (a: EdgePickCandidate, b: EdgePickCandidate) =>
  a.objectId === b.objectId && sharedVertexCount(a, b) === 1;

const readCommittedEdgeCandidate = async (page: Page, point: ViewerPoint): Promise<EdgePickCandidate | null> => {
  const entity = (await page.getByTestId("geometry-pick-committed-entity").innerText()).toLowerCase();
  const status = (await page.getByTestId("geometry-pick-committed-status").innerText()).trim();
  if (!entity.includes("edge") || status !== "valid") return null;

  const edgeLabel = (await page.getByTestId("geometry-pick-edge").innerText()).trim();
  const vertices = parseEdgeVertices(edgeLabel);
  if (!vertices) return null;

  const objectId = (await page.getByTestId("geometry-pick-committed-object").getAttribute("data-object-id"))?.trim() ?? "";
  if (!objectId) return null;

  return { edgeLabel, objectId, vertices, point };
};

const findEdgePickCandidate = async (
  page: Page,
  predicate: (candidate: EdgePickCandidate) => boolean = () => true
): Promise<EdgePickCandidate> => {
  await selectPickMode(page, "edge");
  const viewer = page.getByTestId("main-viewer");
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  if (!box) throw new Error("Viewer bounds unavailable");

  const seen = new Set<string>();
  for (const point of pointGrid(box)) {
    await page.mouse.click(point.x, point.y);
    const candidate = await readCommittedEdgeCandidate(page, point);
    if (!candidate) continue;

    const key = edgePickKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    if (predicate(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to find a matching edge pick; collected ${seen.size} edge(s).`);
};

const extendCommittedEdge = async (page: Page, candidate: EdgePickCandidate) => {
  await expect(page.getByTestId("geometry-pick-committed-entity")).toContainText("edge");
  await expect(page.getByTestId("geometry-pick-committed-status")).toHaveText("valid");
  await expect(page.getByTestId("geometry-pick-edge")).toHaveText(candidate.edgeLabel);
  await expect(page.getByTestId("geometry-pick-committed-object")).toHaveAttribute("data-object-id", candidate.objectId);
  await page.getByTestId("geometry-right-panel-tab-actions").click();
  await clickFirstVisibleButton(page, /^Extend$/);
  await page.getByTestId("geometry-right-panel-tab-selection").click();
};

const selectValue = async (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((element) => (element as HTMLSelectElement).value);

const isDetailsOpen = async (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((element) => (element as HTMLDetailsElement).open);

const selectLinePairSources = async (page: Page, sourceAId: string, sourceBId: string) => {
  await page.getByTestId("geometry-line-pair-source-a").selectOption(sourceAId);
  await page.getByTestId("geometry-line-pair-source-b").selectOption(sourceBId);
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
    await page.getByTestId("geometry-right-panel-tab-properties").click();
    await expect(page.getByTestId("geometry-properties-selected-object")).toBeVisible();
    await expect(page.getByTestId("geometry-properties-mesh")).toBeVisible();
    await page.getByTestId("geometry-right-panel-tab-actions").click();
    await expect(page.getByTestId("geometry-context-actions-panel")).toBeVisible();
    await page.getByTestId("geometry-right-panel-tab-selection").click();

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

test("Geometry construct panel remembers workflow and search opens matching sections", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-construct-prefs-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await clickFirstVisibleButton(page, "Construct");
    await expect(page.getByTestId("geometry-workflow-step-create")).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("button", { name: "Transform tools", exact: true })).toHaveCount(0);

    await page.getByTestId("geometry-workflow-step-transform").click();
    await expect(page.getByTestId("geometry-workflow-step-transform")).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("GEOMETRY TRANSFORM", { exact: true })).toBeVisible();
    await expect(page.getByTestId("geometry-construct-panel-tab-create")).toHaveCount(0);

    await page.getByTestId("geometry-workflow-step-create").click();
    await clickFirstVisibleButton(page, "Construct");
    await selectConstructPanelTab(page, "create");

    await page.getByTestId("geometry-point-tool-face-centroid").click();
    await expect(page.getByTestId("geometry-current-tool-sticky")).toContainText("POINTS");

    const pointSection = page.getByTestId("geometry-construct-category-points");
    await pointSection.evaluate((element) => {
      const details = element as HTMLDetailsElement;
      details.open = false;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
    await expect.poll(() => isDetailsOpen(page, "geometry-construct-category-points")).toBe(false);

    await page.getByTestId("geometry-construct-tool-search").fill("coordinate");
    await expect.poll(() => isDetailsOpen(page, "geometry-construct-category-points")).toBe(true);
    await expect(page.getByTestId("geometry-point-tool-vertex-coordinate-label")).toBeVisible();

    await page.getByTestId("geometry-construct-tool-search-clear").click();
    await expect.poll(() => isDetailsOpen(page, "geometry-construct-category-points")).toBe(false);

    await selectConstructPanelTab(page, "relations");
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        }, GEOMETRY_CONSTRUCT_PANEL_KEY)
      )
      .toEqual(expect.objectContaining({
        activeTab: "relations",
        activeCreateFamily: "points",
      }));

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await expect(page.getByTestId("geometry-construct-panel-tab-relations")).toHaveAttribute("aria-pressed", "true");
    await selectConstructPanelTab(page, "create");
    await expect(page.getByTestId("geometry-current-tool-sticky")).toContainText("POINTS");
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry scene gallery filters and opens construct operations playground", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-construct-playground-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await page.getByTestId("geometry-workflow-command-create-presets").click();
    await expect(page.getByText("Scene presets", { exact: true })).toBeVisible();

    await expect(page.getByTestId("geometry-scene-preset-filter-chips")).toBeVisible();
    await page.getByTestId("geometry-scene-preset-filter-playgrounds").click();
    await expect(page.getByTestId("geometry-scene-preset-filter-playgrounds")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/\d+\s*\/\s*\d+\s+presets/)).toBeVisible();
    await expect(page.getByTestId("geometry-debug-scene-card-scene:construct-operations-playground")).toBeVisible();

    await page.getByTestId("geometry-debug-scene-open-scene:construct-operations-playground").click();
    await expect(page.getByTestId("geometry-workflow-step-create")).toHaveAttribute("aria-current", "step");
    await selectConstructPanelTab(page, "tree");
    await expect(page.getByTestId("geometry-derived-construction-construct-playground-principal-plane")).toBeVisible();
    await expect(page.getByTestId("geometry-plane-construction-method-construct-playground-principal-plane")).toContainText("Principal Plane");
    await expect(page.getByTestId("geometry-plane-construction-result-construct-playground-principal-plane")).toContainText("Plane");
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry construct panel stays readable in narrow landscape layout", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-construct-responsive-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await page.setViewportSize({ width: 900, height: 520 });
    await clickFirstVisibleButton(page, "Construct");
    await selectConstructPanelTab(page, "create");

    const layout = await page.evaluate(() => {
      const rectOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const left = rectOf("[data-testid='geometry-left-panel']");
      const right = rectOf("[data-testid='geometry-scene-stats']");
      const sticky = rectOf("[data-testid='geometry-current-tool-sticky']");
      const stickyElement = document.querySelector("[data-testid='geometry-current-tool-sticky']") as HTMLElement | null;
      const slots = Array.from(document.querySelectorAll("[data-testid^='geometry-current-tool-input-']")).map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: (element as HTMLElement).scrollWidth };
      });
      const cards = Array.from(document.querySelectorAll("[data-testid^='geometry-plane-method-']")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          text: (element.textContent ?? "").trim(),
          scrollWidth: (element as HTMLElement).scrollWidth,
        };
      });
      const stats = document.querySelector("[data-testid='geometry-scene-stats']") as HTMLElement | null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bodyScrollWidth: document.documentElement.scrollWidth,
        left,
        right,
        sticky,
        stickyStyle: stickyElement
          ? {
              position: getComputedStyle(stickyElement).position,
              overflowY: getComputedStyle(stickyElement).overflowY,
              maxHeight: getComputedStyle(stickyElement).maxHeight,
            }
          : null,
        slots,
        cards,
        stats: stats
          ? {
              width: stats.getBoundingClientRect().width,
              scrollWidth: stats.scrollWidth,
              whiteSpace: getComputedStyle(stats).whiteSpace,
              overflow: getComputedStyle(stats).overflow,
              textOverflow: getComputedStyle(stats).textOverflow,
            }
          : null,
      };
    });

    expect(layout.viewport).toEqual({ width: 900, height: 520 });
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(900);
    expect(layout.left).not.toBeNull();
    expect(layout.right).not.toBeNull();
    expect(layout.sticky).not.toBeNull();
    expect(layout.stickyStyle).toEqual(expect.objectContaining({
      position: "relative",
      overflowY: "auto",
    }));
    expect(layout.left!.width).toBeLessThanOrEqual(900);
    expect(layout.slots.length).toBeGreaterThan(0);
    for (const slot of layout.slots) {
      expect(slot.left).toBeGreaterThanOrEqual(layout.left!.left - 1);
      expect(slot.right).toBeLessThanOrEqual(layout.left!.right + 1);
      expect(slot.scrollWidth).toBeLessThanOrEqual(Math.ceil(slot.width) + 1);
    }
    expect(layout.cards.length).toBeGreaterThan(0);
    for (const card of layout.cards) {
      expect(card.width).toBeGreaterThanOrEqual(58);
      expect(card.height).toBeGreaterThanOrEqual(30);
      expect(card.scrollWidth).toBeLessThanOrEqual(Math.ceil(card.width) + 4);
      expect(card.text.length).toBeGreaterThan(0);
    }
    expect(layout.stats).toEqual(expect.objectContaining({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }));
    expect(layout.stats!.scrollWidth).toBeGreaterThanOrEqual(Math.floor(layout.stats!.width));
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry construct panel stacks without panel collision on phone landscape", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-construct-phone-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await page.setViewportSize({ width: 760, height: 430 });
    await clickFirstVisibleButton(page, "Construct");
    await selectConstructPanelTab(page, "create");

    const layout = await page.evaluate(() => {
      const rectOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        left: rectOf("[data-testid='geometry-left-panel']"),
        viewer: rectOf("[data-testid='geometry-viewer-panel']"),
        sticky: rectOf("[data-testid='geometry-current-tool-sticky']"),
        stickyStyle: (() => {
          const element = document.querySelector("[data-testid='geometry-current-tool-sticky']") as HTMLElement | null;
          return element
            ? {
                position: getComputedStyle(element).position,
                overflowY: getComputedStyle(element).overflowY,
              }
            : null;
        })(),
        bodyScrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.viewport).toEqual({ width: 760, height: 430 });
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(760);
    expect(layout.left).not.toBeNull();
    expect(layout.viewer).not.toBeNull();
    expect(layout.sticky).not.toBeNull();
    expect(layout.stickyStyle).toEqual(expect.objectContaining({
      position: "relative",
      overflowY: "auto",
    }));
    expect(layout.left!.top).toBeGreaterThanOrEqual(layout.viewer!.bottom - 1);
    expect(layout.left!.height).toBeLessThanOrEqual(Math.ceil(430 * 0.38) + 2);
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry construct: edge extensions auto-fill line pair", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-edge-plane-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await clickFirstVisibleButton(page, "Construct");
    await selectConstructPanelTab(page, "relations");
    await expect(page.getByTestId("geometry-line-pair-panel")).toHaveCount(1);
    await configureGeometryViewerForConstructionPicking(page);
    const edgeA = await findEdgePickCandidate(page);

    await extendCommittedEdge(page, edgeA);
    await selectConstructPanelTab(page, "relations");
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-a")).not.toBe("");
    const lineAId = await selectValue(page, "geometry-line-pair-source-a");

    const edgeB = await findEdgePickCandidate(page, (candidate) => edgePickKey(candidate) !== edgePickKey(edgeA));
    await extendCommittedEdge(page, edgeB);
    await selectConstructPanelTab(page, "relations");
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-b")).not.toBe("");
    const lineBId = await selectValue(page, "geometry-line-pair-source-b");
    expect(lineBId).not.toBe(lineAId);

    const createdEdges = [edgeA, edgeB];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = await findEdgePickCandidate(page, (edge) => !createdEdges.some((created) => edgePickKey(created) === edgePickKey(edge))).catch(
        () => null
      );
      if (!candidate) break;
      createdEdges.push(candidate);
      await extendCommittedEdge(page, candidate);
    }

    await selectConstructPanelTab(page, "relations");
    const lineSourceIds = await page
      .getByTestId("geometry-line-pair-source-a")
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
    let foundMidPlanePreview = false;
    for (const sourceAId of lineSourceIds) {
      for (const sourceBId of lineSourceIds) {
        if (sourceAId === sourceBId) continue;
        await selectLinePairSources(page, sourceAId, sourceBId);
        await selectConstructPanelTab(page, "create");
        await page.getByTestId("geometry-plane-method-mid-plane").click();
        if ((await page.getByTestId("geometry-plane-mid-plane-preview-status").innerText()).includes("Preview plane is shown")) {
          foundMidPlanePreview = true;
          break;
        }
        await selectConstructPanelTab(page, "relations");
      }
      if (foundMidPlanePreview) break;
    }
    if (foundMidPlanePreview) {
      await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
    }
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry construct: relation plane methods show live previews before create", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-relation-plane-preview-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await openProceduralGeometry(page, "box");
    await clickFirstVisibleButton(page, "Construct");
    await selectConstructPanelTab(page, "create");
    await configureGeometryViewerForConstructionPicking(page);

    await page.getByTestId("geometry-plane-method-parallel").click();
    await clickUntilCommitted(page, "face");
    await expect(page.getByTestId("geometry-plane-parallel-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();

    await page.getByTestId("geometry-plane-method-offset").click();
    await expect(page.getByTestId("geometry-plane-offset-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();

    await page.getByTestId("geometry-plane-method-tangent-plane").click();
    await expect(page.getByTestId("geometry-plane-tangent-plane-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();

    await page.getByTestId("geometry-plane-method-symmetry-plane").click();
    const symmetryPreviewStatus = page.getByTestId("geometry-plane-symmetry-plane-preview-status");
    if (!(await symmetryPreviewStatus.innerText()).includes("Preview plane is shown")) {
      await clickUntilCommitted(page, "object");
    }
    await expect(page.getByTestId("geometry-plane-symmetry-plane-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();

    await page.getByTestId("geometry-plane-method-principal-plane").click();
    await page.getByTestId("geometry-principal-plane-output-principal-1").click();
    await expect(page.getByTestId("geometry-plane-principal-plane-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
    await page.getByTestId("geometry-plane-create-button").click();
    await selectConstructPanelTab(page, "tree");
    const principalPlaneCard = page.locator('[data-construction-type="object-principal-plane"]').first();
    await expect(principalPlaneCard).toBeVisible();
    await expect(principalPlaneCard).toContainText("Method");
    await expect(principalPlaneCard).toContainText("Principal Plane");
    await expect(principalPlaneCard).toContainText("Output: Principal 1");
    await expect(principalPlaneCard).toContainText("Result");

    await selectConstructPanelTab(page, "create");
    await page.getByTestId("geometry-plane-method-best-fit-plane").click();
    await expect(page.getByTestId("geometry-plane-best-fit-plane-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
    await page.getByTestId("geometry-plane-create-button").click();
    await selectConstructPanelTab(page, "tree");
    const bestFitPlaneCard = page.locator('[data-construction-type="object-best-fit-plane"]').first();
    await expect(bestFitPlaneCard).toBeVisible();
    await expect(bestFitPlaneCard).toContainText("Best Fit Plane");
    await expect(bestFitPlaneCard).toContainText("Algorithm: Least squares / PCA");
    await expect(bestFitPlaneCard).toContainText("RMS:");
    await expect(bestFitPlaneCard).toContainText("Result");

    await selectConstructPanelTab(page, "create");
    await page.getByTestId("geometry-plane-method-perpendicular").click();
    const perpendicularPreviewStatus = page.getByTestId("geometry-plane-perpendicular-preview-status");
    if (!(await perpendicularPreviewStatus.innerText()).includes("Preview plane is shown")) {
      await findEdgePickCandidate(page);
    }
    await expect(page.getByTestId("geometry-plane-perpendicular-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Geometry preset: torus line-plane construction restores lines and plane", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-torus-plane-preset-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const page = launched.page;

    await resetStorage(page);
    await clickFirstVisibleButton(page, "Geometry");
    await clickFirstVisibleButton(page, "Presets");
    await page.getByTestId("geometry-debug-scene-open-scene:torus-line-plane-construction").click();
    await configureGeometryViewerForConstructionPicking(page);
    await clickFirstVisibleButton(page, /^1 Create$/);
    await clickFirstVisibleButton(page, "Construct");

    await selectConstructPanelTab(page, "tree");
    await expect(page.locator('[data-construction-type="edge-line-through-two-vertices"]')).toHaveCount(2);
    await expect(page.locator('[data-construction-type="line-pair-plane-through-lines"]')).toHaveCount(1);
    await expect(page.getByTestId("geometry-derived-construction-torus-plane-through-lines")).toBeVisible();
    await expect(page.getByTestId("geometry-plane-construction-method-torus-plane-through-lines")).toHaveText("Through 2 Lines");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-0")).toHaveText("Line A: Line A - extended torus edge");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-1")).toHaveText("Line B: Line B - extended torus edge");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-2")).toHaveText("Relation: Intersecting");
    await expect(page.getByTestId("geometry-plane-construction-result-torus-plane-through-lines")).toHaveText("Plane");
    await selectConstructPanelTab(page, "relations");
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-a")).not.toBe("");
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-b")).not.toBe("");
    await selectConstructPanelTab(page, "create");
    await page.getByTestId("geometry-plane-method-through-2-lines").click();
    await expect(page.getByTestId("geometry-plane-through-lines-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
    await expect(page.getByTestId("geometry-plane-method-panel")).toBeVisible();
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});
