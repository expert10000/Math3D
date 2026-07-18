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
  await clickFirstVisibleButton(page, /^Extend$/);
};

const selectValue = async (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((element) => (element as HTMLSelectElement).value);

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
    await expect(page.getByTestId("geometry-line-pair-panel")).toHaveCount(1);
    await configureGeometryViewerForConstructionPicking(page);
    const edgeA = await findEdgePickCandidate(page);

    await extendCommittedEdge(page, edgeA);
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-a")).not.toBe("");
    const lineAId = await selectValue(page, "geometry-line-pair-source-a");

    const edgeB = await findEdgePickCandidate(page, (candidate) => edgePickKey(candidate) !== edgePickKey(edgeA));
    await extendCommittedEdge(page, edgeB);
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-b")).not.toBe("");
    const lineBId = await selectValue(page, "geometry-line-pair-source-b");
    expect(lineBId).not.toBe(lineAId);
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

    await expect(page.locator('[data-construction-type="edge-line-through-two-vertices"]')).toHaveCount(2);
    await expect(page.locator('[data-construction-type="line-pair-plane-through-lines"]')).toHaveCount(1);
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-a")).not.toBe("");
    await expect.poll(() => selectValue(page, "geometry-line-pair-source-b")).not.toBe("");
    await expect(page.getByTestId("geometry-derived-construction-torus-plane-through-lines")).toBeVisible();
    await expect(page.getByTestId("geometry-plane-construction-method-torus-plane-through-lines")).toHaveText("Through 2 Lines");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-0")).toHaveText("Line A: Line A - extended torus edge");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-1")).toHaveText("Line B: Line B - extended torus edge");
    await expect(page.getByTestId("geometry-plane-construction-input-torus-plane-through-lines-2")).toHaveText("Relation: Intersecting");
    await expect(page.getByTestId("geometry-plane-construction-result-torus-plane-through-lines")).toHaveText("Plane");
    await page.getByTestId("geometry-plane-method-through-2-lines").click();
    await expect(page.getByTestId("geometry-plane-through-lines-preview-status")).toContainText("Preview plane is shown");
    await expect(page.getByTestId("geometry-plane-create-button")).toBeEnabled();
    await expect(page.getByTestId("geometry-left-panel").getByText("Construction torus", { exact: true })).toBeVisible();
  } finally {
    if (app) await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});
