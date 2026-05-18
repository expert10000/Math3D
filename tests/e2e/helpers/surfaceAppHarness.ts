import { expect, type Locator, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

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

  const app = await electron.launch({
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
  await page.evaluate(() => localStorage.clear());
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
    return blocks.join("\n");
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

function getInspectorSection(page: Page): Locator {
  return page.locator("section", {
    has: page.getByRole("heading", { name: /^INSPECTOR$/ }),
  }).first();
}

async function clickInspectorTab(page: Page, tabName: RegExp): Promise<void> {
  const inspector = getInspectorSection(page);
  await clickFirstVisibleButtonByNamePattern(inspector, tabName);
}

export async function openSurfaceGenerator(page: Page): Promise<void> {
  await resetSurfaceAppState(page);
  await clickFirstVisibleButton(page, "Surfaces");
  await clickFirstVisibleButton(page, "Inspector");
  await expect(page.getByTestId("surface-input").first()).toBeVisible();
  await clickInspectorTab(page, /^Results\b/i);
  await expect(page.getByTestId("generate-button").first()).toBeVisible();
  await expect(page.getByTestId("worker-status").first()).toBeVisible();
}

export async function waitForWorkerReady(page: Page): Promise<void> {
  await expect.poll(
    async () => (await readWorkerStatusText(page)).toLowerCase(),
    { timeout: 20_000 }
  ).toContain("worker: ready");
}

export async function setSurfaceExpression(page: Page, expression: string): Promise<void> {
  await clickInspectorTab(page, /^Object\b/i);
  await expect(page.getByTestId("surface-input").first()).toBeVisible();
  await page.getByTestId("surface-input").first().fill(expression);
}

export async function setSimpleSurfaceExpression(page: Page): Promise<void> {
  await setSurfaceExpression(page, "x*x + y*y + z*z - 1");
}

export async function clickGenerate(page: Page): Promise<void> {
  await clickInspectorTab(page, /^Results\b/i);
  await expect(page.getByTestId("generate-button").first()).toBeVisible();
  await page.getByTestId("generate-button").first().click();
}

export async function assertGenerateButtonReset(page: Page): Promise<void> {
  await clickInspectorTab(page, /^Results\b/i);
  const generate = page.getByTestId("generate-button").first();
  await expect(generate).toBeEnabled({ timeout: 15_000 });
  await expect(generate).toHaveText(/preview \(VTK\)/i);
}
