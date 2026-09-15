import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROCEDURAL_SCENE_SCRIPT_ROUND_TRIP_FIXTURE } from "../../renderer/src/geometry/scripting/sceneScriptExamples";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repoRoot = path.resolve(__dirname, "..", "..");
const COMPUTE_ENGINE_FIRST_LAUNCH_KEY = "math3d.computeEngines.firstLaunchSeen";

const launchApp = async (profileDir: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await launchRepoElectron({ args: ["."], cwd: repoRoot, env });
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

const clickFirstVisibleButton = async (page: Page, name: string) => {
  const buttons = page.getByRole("button", { name, exact: true });
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${name}`);
};

const readStats = async (page: Page) => {
  const text = await page.getByTestId("geometry-scene-stats").innerText();
  const match = text.match(/(\d+)\s+objects\s+(?:\||\u00b7)\s+(\d+)\s+visible/i);
  if (!match) throw new Error(`Unable to parse Geometry scene stats: ${text}`);
  return { objects: Number(match[1]), visible: Number(match[2]) };
};

const openSceneScriptPanel = async (page: Page) => {
  await clickFirstVisibleButton(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await clickFirstVisibleButton(page, "Procedural");
  await expect(page.getByTestId("geometry-scene-stats")).toBeVisible();
  await page.getByTestId("geometry-professional-action-more").click();
  await expect(page.getByText("Procedural scripting", { exact: true })).toBeVisible();
  await expect(page.getByTestId("geometry-procedural-script-editor")).toBeVisible();
};

test("Geometry UI preserves a complete Script -> Scene -> Script round trip atomically", async () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-e2e-scene-script-"));
  let app: ElectronApplication | null = null;

  try {
    const launched = await launchApp(profileDir);
    app = launched.app;
    const { page } = launched;
    await resetStorage(page);
    await openSceneScriptPanel(page);

    const editor = page.getByTestId("geometry-procedural-script-editor");
    await page.getByTestId("geometry-run-scene-script-self-test").click();
    await expect(page.getByTestId("geometry-procedural-script-status")).toContainText("PASS");
    await expect.poll(() => readStats(page)).toEqual({ objects: 3, visible: 2 });
    expect(await editor.inputValue()).toContain("select box_alpha");

    await editor.fill(PROCEDURAL_SCENE_SCRIPT_ROUND_TRIP_FIXTURE);
    await page.getByTestId("geometry-script-to-scene").click();
    await expect(page.getByTestId("geometry-procedural-script-status")).toContainText("Applied 3 objects");
    await expect.poll(() => readStats(page)).toEqual({ objects: 3, visible: 2 });

    await page.getByTestId("geometry-scene-to-script").click();
    await expect(page.getByTestId("geometry-procedural-script-status")).toHaveText(
      "Scene -> script generated from 3 objects."
    );
    const canonicalScript = await editor.inputValue();
    expect(canonicalScript).toContain("add box as box_alpha");
    expect(canonicalScript).toContain("width=2.75");
    expect(canonicalScript).toContain("x=-1.5");
    expect(canonicalScript).toContain("rx=0.1");
    expect(canonicalScript).toContain("sx=1.1");
    expect(canonicalScript).toContain("color=#123abc");
    expect(canonicalScript).toContain("opacity=0.65");
    expect(canonicalScript).toContain('"name=Primary Box"');
    expect(canonicalScript).toContain('"group=roundtrip group"');
    expect(canonicalScript).toContain("add sphere as sphere_beta");
    expect(canonicalScript).toContain("visible=false");
    expect(canonicalScript).toContain("add torus as torus_gamma");
    expect(canonicalScript).toContain("select box_alpha");

    await page.getByTestId("geometry-scene-script-roundtrip").click();
    await expect(page.getByTestId("geometry-procedural-script-status")).toHaveText(
      "Scene -> script -> render matched 3 objects."
    );
    await page.getByTestId("geometry-scene-to-script").click();
    expect(await editor.inputValue()).toBe(canonicalScript);
    await expect.poll(() => readStats(page)).toEqual({ objects: 3, visible: 2 });

    await editor.fill(["set box_alpha width=4", "add sphere as broken radius=not-a-number", "delete torus_gamma"].join("\n"));
    await page.getByTestId("geometry-script-to-scene").click();
    await expect(page.getByTestId("geometry-procedural-script-error")).toContainText("invalid number for radius");
    await expect.poll(() => readStats(page)).toEqual({ objects: 3, visible: 2 });

    await page.getByTestId("geometry-scene-to-script").click();
    expect(await editor.inputValue()).toBe(canonicalScript);

    await page.getByTestId("geometry-professional-action-new").click();
    await expect.poll(() => readStats(page)).toEqual({ objects: 0, visible: 0 });
    await expect(page.getByTestId("geometry-professional-expanded-group")).toContainText("New workspace");
    await expect(page.getByTestId("geometry-professional-action-new")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("geometry-professional-action-gallery")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("geometry-professional-action-gallery").click();
    await expect(page.getByTestId("geometry-professional-expanded-group")).toContainText("Gallery choices");
    await expect(page.getByTestId("geometry-professional-action-gallery")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("geometry-professional-action-new")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("geometry-professional-action-new").click();
    await expect(page.getByTestId("geometry-professional-expanded-group")).toContainText("New workspace");
    await page.getByTestId("geometry-professional-expanded-new-object").click();
    await expect.poll(() => readStats(page)).toEqual({ objects: 1, visible: 1 });
    await expect(page.getByTestId("geometry-create-selected-card")).toContainText("Gallery selection: Box");
    await expect(page.getByTestId("geometry-create-object-preset-shortcuts")).toContainText(
      "Built-in presets and validation"
    );

    await page.getByTestId("geometry-workflow-command-create-presets").click();
    await expect(page.getByTestId("geometry-debug-scene-gallery")).toBeVisible();
    await expect(page.getByTestId("geometry-scene-script-validation-preset")).toBeVisible();
    await page.getByTestId("geometry-run-scene-script-self-test-preset").click();
    await expect(page.getByTestId("geometry-procedural-script-status")).toContainText("PASS");
    await expect.poll(() => readStats(page)).toEqual({ objects: 3, visible: 2 });
  } finally {
    if (app) await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
