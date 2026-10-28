import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { definedEnvironment } from "./helpers/electronLauncher";

const projectTitle = "Upgrade Graph from v1.6.0";

test("published v1.6.0 Graph Project and setting survive the stable candidate upgrade", async () => {
  const phase = process.env.MATH3D_UPGRADE_PHASE;
  test.skip(process.platform !== "win32" || !process.env.MATH3D_E2E_INSTALLED_EXE ||
    !process.env.MATH3D_UPGRADE_PROFILE_ROOT || !["seed", "verify"].includes(phase ?? ""),
  "Requires an installed Math3D executable, upgrade profile, and seed or verify phase");
  test.setTimeout(90_000);
  const executable = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const profileRoot = resolve(process.env.MATH3D_UPGRADE_PROFILE_ROOT!);
  const userData = join(profileRoot, "user-data");
  const env = definedEnvironment({ ...process.env, MATH3D_E2E: "1",
    MATH3D_E2E_PROFILE_ROOT: profileRoot, MATH3D_E2E_USER_DATA_DIR: userData });
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: executable, cwd: dirname(executable),
    args: [`--user-data-dir=${userData}`], env });
  try {
    const version = await app.evaluate(({ app }) => app.getVersion());
    expect(version).toBe(phase === "seed" ? "1.6.0" : "1.7.0-rc.1");
    const page = await app.firstWindow();
    await page.getByTestId("top-settings-button").click();
    const setting = page.getByTestId("settings-command-preview-overlays-toggle");
    await expect(setting).toBeVisible();
    if (phase === "seed") await setting.setChecked(false);
    await expect(setting).not.toBeChecked();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    let gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    if (phase === "seed") {
      await gallery.getByLabel("Reusable copy title").fill(projectTitle);
      await gallery.getByRole("button", { name: "Save current as reusable copy" }).click();
      await page.getByTestId("graph-gallery-open").click();
      gallery = page.getByTestId("graph-gallery");
      await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    }
    const saved = gallery.getByRole("button", { name: `Open project ${projectTitle}`, exact: true });
    await expect(saved).toBeVisible();
    if (phase === "verify") {
      await saved.click();
      await expect(page.getByTestId("graph-gallery")).toBeHidden();
      await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    }
    if (process.env.MATH3D_UPGRADE_PHASE_RESULT_PATH) {
      await writeFile(resolve(process.env.MATH3D_UPGRADE_PHASE_RESULT_PATH), JSON.stringify({
        schema: "math3d/upgrade-project-settings-phase/v1", phase, version,
        projectTitle, savedProjectVisible: true, commandPreviewOverlaysOff: true,
      }, null, 2) + "\n");
    }
  } finally {
    await app.close();
  }
});
