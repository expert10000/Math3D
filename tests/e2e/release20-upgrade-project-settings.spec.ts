import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { definedEnvironment } from "./helpers/electronLauncher";

const projectTitle = "Upgrade Graph from v1.7.0";
const checkpointKey = "math3d.mixed-workspace.v1";

test("M3D20-13c published 1.7 Project and setting survive the exact 2.0 upgrade", async () => {
  const phase = process.env.MATH3D_RELEASE20_UPGRADE_PHASE;
  test.skip(process.platform !== "win32" || !process.env.MATH3D_PACKAGED_APP_EXE ||
    !process.env.MATH3D_RELEASE20_UPGRADE_PROFILE || !["seed", "verify", "rollback"].includes(phase ?? ""),
  "Run through scripts/release20-upgrade.ps1 with two exact installed artifacts");
  test.setTimeout(120_000);
  const executable = resolve(process.env.MATH3D_PACKAGED_APP_EXE!);
  const profile = resolve(process.env.MATH3D_RELEASE20_UPGRADE_PROFILE!);
  const userData = join(profile, "user-data");
  const expectedVersion = phase === "verify" ? "2.0.0" : "1.7.0";
  const app = await electron.launch({ executablePath: executable, cwd: dirname(executable),
    args: [`--user-data-dir=${userData}`],
    env: definedEnvironment({ ...process.env, MATH3D_E2E: "1", MATH3D_E2E_PROFILE_ROOT: profile,
      MATH3D_E2E_USER_DATA_DIR: userData }) });
  try {
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe(expectedVersion);
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("top-settings-button").click();
    const setting = page.getByTestId("settings-command-preview-overlays-toggle");
    await expect(setting).toBeVisible();
    if (phase === "seed") await setting.setChecked(false);
    await expect(setting).not.toBeChecked();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByTestId("workspace-nav-graphs").click();
    if (phase === "seed") {
      await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Add Graph" }).click();
      await page.getByRole("dialog", { name: "Choose graph type" })
        .getByRole("button", { name: "Function", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Create graph" });
      const form = editor.getByRole("form", { name: "New function" });
      await form.getByLabel("Start from preset").selectOption("parabola");
      await form.getByLabel("Function expression").fill("x^2 + 1");
      await editor.getByRole("button", { name: "Create graph" }).click();
      await expect(editor).toBeHidden();
    }
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
    const savedButton = gallery.getByRole("button", { name: `Open project ${projectTitle}`, exact: true });
    await expect(savedButton).toBeVisible();
    const checkpointBytes = await page.evaluate(key => localStorage.getItem(key), checkpointKey);
    expect(checkpointBytes).not.toBeNull();
    expect(checkpointBytes).toContain(projectTitle);
    const graph = JSON.parse(checkpointBytes!).entries.find((entry: { module: string }) => entry.module === "graph2d")?.checkpoint;
    expect(graph?.source?.objects?.length).toBeGreaterThan(0);
    expect(checkpointBytes).toContain("x^2 + 1");
    if (phase !== "seed") {
      const seed = JSON.parse(readFileSync(resolve(process.env.MATH3D_RELEASE20_UPGRADE_SEED!), "utf8"));
      expect(checkpointBytes).toBe(seed.checkpointBytes);
      await savedButton.click();
      await expect(gallery).toBeHidden();
      await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    }
    const output = process.env.MATH3D_RELEASE20_UPGRADE_RESULT;
    if (!output) throw new Error("Upgrade phase evidence path is required");
    writeFileSync(resolve(output), JSON.stringify({ schema: "math3d/release20-upgrade-phase/v1", phase,
      version: expectedVersion, projectTitle, settingOff: true, checkpointBytes,
      checkpointSha256: createHash("sha256").update(checkpointBytes!).digest("hex") }, null, 2) + "\n");
  } finally { await app.close(); }
});
