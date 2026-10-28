import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { definedEnvironment, launchRepoElectron } from "./helpers/electronLauncher";

test("Settings validates a selected installed Theory Lab before remembering it", async () => {
  test.skip(process.platform !== "win32" || !process.env.QLAB_E2E_INSTALLED_EXE,
    "Set QLAB_E2E_INSTALLED_EXE to the clean installed Lab executable");
  const root = await mkdtemp(join(tmpdir(), "math3d-lab-settings-"));
  const installed = resolve(process.env.QLAB_E2E_INSTALLED_EXE!);
  const installedMath3D = process.env.MATH3D_E2E_INSTALLED_EXE;
  const env: Record<string, string | undefined> = { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_PROFILE_ROOT: root,
    MATH3D_E2E_USER_DATA_DIR: join(root, "user-data") };
  delete env.MATH3D_THEORY_LAB_HOME;
  const app = installedMath3D
    ? await electron.launch({ executablePath: installedMath3D, cwd: dirname(installedMath3D),
      args: [`--user-data-dir=${join(root, "user-data")}`], env: definedEnvironment(env) })
    : await launchRepoElectron({ cwd: resolve(__dirname, "..", ".."), args: ["."], env });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("top-settings-button").click();
    await expect(page.getByTestId("settings-theory-lab-status")).toContainText("No installation selected");
    await app.evaluate(({ dialog }) => {
      (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: ["C:\\missing\\Quantum Hamiltonian Lab.exe"] });
    });
    await page.getByTestId("settings-theory-lab-choose-installed").click();
    await expect(page.getByTestId("settings-theory-lab-installation").getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("settings-theory-lab-status")).toContainText("No installation selected");
    await app.evaluate(({ dialog }, path) => {
      (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, installed);
    await page.getByTestId("settings-theory-lab-choose-installed").click();
    await expect(page.getByTestId("settings-theory-lab-status")).toContainText("Ready · installed application");
    await expect(page.getByTestId("settings-theory-lab-path")).toContainText(installed);
    const saved = JSON.parse(await readFile(join(root, "user-data", "theory-lab-target.json"), "utf8"));
    expect(saved).toEqual({ schema: "math3d/theory-lab-target/v2", path: installed });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("math3d-lab-settings-"))
      throw new Error("Unsafe settings test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
