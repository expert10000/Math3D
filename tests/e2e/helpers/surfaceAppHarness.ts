import { expect, type Locator, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./electronLauncher";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const COMPUTE_ENGINE_FIRST_LAUNCH_KEY = "math3d.computeEngines.firstLaunchSeen";

export type LaunchedSurfaceApp = {
  app: ElectronApplication;
  page: Page;
  profileDir: string;
};

export async function launchSurfaceApp(
  extraEnv: Record<string, string | undefined> = {}
): Promise<LaunchedSurfaceApp> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-surface-"));
  const launchEnv: Record<string, string | undefined> = {
    ...process.env,
    ...extraEnv,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
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

  return { app, page, profileDir };
}

export async function closeSurfaceApp(ctx: LaunchedSurfaceApp | null): Promise<void> {
  if (!ctx) return;
  await ctx.app.close();
  rmSync(ctx.profileDir, { recursive: true, force: true });
}

export async function resetSurfaceAppState(page: Page): Promise<void> {
  await page.evaluate((firstLaunchKey) => {
    localStorage.clear();
    localStorage.setItem(firstLaunchKey, "1");
  }, COMPUTE_ENGINE_FIRST_LAUNCH_KEY);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
}

export async function readWorkerStatusText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
    const blocks = Array.from(document.querySelectorAll("[data-testid='worker-status']"))
      .map((el) => normalize((el as HTMLElement).innerText || el.textContent || ""))
      .filter(Boolean);
    if (blocks.length > 0) return blocks.join("\n");
    const statusBar = document.querySelector("[data-testid='app-status-bar']") as HTMLElement | null;
    if (statusBar) return normalize(statusBar.innerText || statusBar.textContent || "");
    return "";
  });
}

async function clickFirstVisibleButton(page: Page, name: string): Promise<void> {
  const buttons = page.getByRole("button", { name, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${name}`);
}

async function clickTopmostVisibleButton(page: Page, name: string): Promise<void> {
  const buttons = page.getByRole("button", { name, exact: true });
  const count = await buttons.count();
  let bestIndex = -1;
  let bestY = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    if (!box) continue;
    if (box.y < bestY) {
      bestY = box.y;
      bestIndex = i;
    }
  }
  if (bestIndex >= 0) {
    await buttons.nth(bestIndex).click();
    return;
  }
  throw new Error(`Topmost visible button not found: ${name}`);
}

async function ensureSurfaceEditorOpen(page: Page): Promise<void> {
  const visibleTextarea = page.locator("textarea:visible").first();
  if ((await visibleTextarea.count()) > 0 && (await visibleTextarea.isVisible())) return;
  const showPanels = page.getByRole("button", { name: /^Show panels$/i }).first();
  if ((await showPanels.count()) > 0 && (await showPanels.isVisible())) {
    await showPanels.click();
  }
  const openState = page.getByRole("button", { name: /^Surface editor: on$/i }).first();
  if ((await openState.count()) > 0 && (await openState.isVisible())) return;
  await clickFirstVisibleButtonByNamePattern(page, /^Surface editor$/i);
}

async function clickFirstVisibleButtonByNamePattern(scope: Page | Locator, name: RegExp): Promise<void> {
  const buttons = scope.getByRole("button", { name });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found for pattern: ${name.toString()}`);
}

async function clickFirstVisibleByTestId(scope: Page | Locator, testId: string): Promise<void> {
  const items = scope.getByTestId(testId);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    if (!(await item.isVisible())) continue;
    await item.click();
    return;
  }
  throw new Error(`Visible test-id target not found: ${testId}`);
}

function getInspectorSection(page: Page): Locator {
  return page.locator("section", {
    has: page.getByRole("heading", { name: /^INSPECTOR$/ }),
  }).first();
}

async function resolveSurfaceInput(page: Page, timeoutMs = 20_000): Promise<Locator> {
  const byTestId = page.getByTestId("surface-input").first();
  const byPlaceholder = page.getByPlaceholder("e.g. x*x + y*y + z*z - 1").first();
  const byEditorTextarea = page.locator("textarea:visible").first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await byTestId.count()) > 0 && (await byTestId.isVisible())) return byTestId;
    if ((await byPlaceholder.count()) > 0 && (await byPlaceholder.isVisible())) return byPlaceholder;
    if ((await byEditorTextarea.count()) > 0 && (await byEditorTextarea.isVisible())) return byEditorTextarea;
    await page.waitForTimeout(120);
  }
  throw new Error("Implicit surface input not visible.");
}

async function clickInspectorTab(page: Page, tabName: RegExp): Promise<void> {
  const inspector = getInspectorSection(page);
  await clickFirstVisibleButtonByNamePattern(inspector, tabName);
}

export async function openSurfaceGenerator(page: Page): Promise<void> {
  await resetSurfaceAppState(page);
  await clickFirstVisibleButton(page, "Surfaces");
  await clickFirstVisibleByTestId(page, "surface-family-implicit");
  await clickFirstVisibleButtonByNamePattern(page, /^Edit custom f\(x,y,z\)$/i);
  await clickFirstVisibleButtonByNamePattern(page, /^Show Scene\/Object tabs$/i);
  await ensureSurfaceEditorOpen(page);
  await clickFirstVisibleButton(page, "Inspector");
  await clickInspectorTab(page, /^Object\b/i);
  await resolveSurfaceInput(page);
  await expect(page.getByRole("button", { name: /^Preview$/i }).first()).toBeVisible();
}

export async function waitForWorkerReady(page: Page): Promise<void> {
  await expect.poll(
    async () => (await readWorkerStatusText(page)).toLowerCase(),
    { timeout: 20_000 }
  ).toMatch(/worker:\s*ready|analysis ready/);
}

export async function setSurfaceExpression(page: Page, expression: string): Promise<void> {
  await ensureSurfaceEditorOpen(page);
  const input = await resolveSurfaceInput(page);
  await input.fill(expression);
  await input.focus();
  await input.press("Control+Enter");
  const applyButtons = page.getByRole("button", { name: /^Apply$/i });
  if ((await applyButtons.count()) > 0 && (await applyButtons.first().isVisible())) {
    await applyButtons.first().click({ force: true });
  }
}

export async function expectSurfaceExpressionValue(page: Page, expected: string): Promise<void> {
  const input = await resolveSurfaceInput(page);
  await expect(input).toHaveValue(expected);
}

export async function setSimpleSurfaceExpression(page: Page): Promise<void> {
  await setSurfaceExpression(page, "x*x + y*y + z*z - 1");
}

export async function clickGenerate(page: Page): Promise<void> {
  await clickFirstVisibleByTestId(page, "surface-workflow-preview");
  const showPanels = page.getByRole("button", { name: /^Show panels$/i }).first();
  if ((await showPanels.count()) > 0 && (await showPanels.isVisible())) {
    await showPanels.click();
  }
}

export async function assertGenerateButtonReset(page: Page): Promise<void> {
  const generate = page.getByTestId("surface-workflow-preview").first();
  await expect(generate).toBeEnabled({ timeout: 15_000 });
  await expect(generate).toHaveText(/preview/i);
}
