import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { definedEnvironment } from "./helpers/electronLauncher";

test("installed prerelease opens pinned QWZ and 2p scenes with usable field framing", async () => {
  test.skip(process.platform !== "win32" || !process.env.MATH3D_E2E_INSTALLED_EXE,
    "Requires an installed Windows Math3D executable");
  test.setTimeout(180_000);
  const executable = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const root = await mkdtemp(join(tmpdir(), "m3d-installed-prerelease-"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    MATH3D_E2E_PROFILE_ROOT: join(root, "profile"),
    MATH3D_E2E_USER_DATA_DIR: join(root, "user-data"),
  };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path");
  if (pathKey && env[pathKey])
    env[pathKey] = env[pathKey].split(delimiter).filter(entry => !/python|conda/i.test(entry)).join(delimiter);
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.MATH3D_PYTHON;
  const app = await electron.launch({ executablePath: executable, cwd: dirname(executable),
    args: [`--user-data-dir=${env.MATH3D_E2E_USER_DATA_DIR}`], env: definedEnvironment(env) });
  try {
    const page = await app.firstWindow();
    const settings = page.getByTestId("settings-preferences-panel");
    if (await settings.isVisible())
      await settings.locator("..").getByRole("button", { name: "Close", exact: true }).click();
    const openExamples = async () => {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
        .fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
      await expect(page.getByTestId("quantum-scene-examples")).toBeVisible();
    };
    await openExamples();
    await page.getByTestId("quantum-example-qwz-curvature").click();
    await expect(page.getByTestId("quantum-topology-inspector")).toContainText("Lower-band Berry curvature");
    await expect(page.getByTestId("quantum-vector-reciprocal-b1")).toContainText("source samples shown");
    await page.getByTestId("quantum-scene-close").click();

    await openExamples();
    await page.getByTestId("quantum-example-hydrogen-2p").click();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
    await page.getByTestId("quantum-scene-geometry").getByRole("button", { name: "Volume", exact: true }).click();
    const volume = page.getByTestId("quantum-field-volume");
    await expect(volume.getByTestId("quantum-volume-source")).toContainText("a0");
    await volume.getByRole("button", { name: "Fit visible field" }).click();
    await expect(volume.getByTestId("volume-slice-viewer-free"))
      .toHaveAttribute("data-camera-fit-target", "crop");
    await volume.getByRole("button", { name: "Fit volume grid" }).click();
    await expect(volume.getByTestId("volume-slice-viewer-free"))
      .toHaveAttribute("data-camera-fit-target", "volume");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-installed-prerelease-"))
      throw new Error("Unsafe installed prerelease cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
