import { expect, test } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..", "..");
const installRoot =
  process.env.MATH3D_INSTALL_ROOT ??
  path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Math3D");
const installedAppExe =
  process.env.MATH3D_INSTALLED_APP_EXE ?? path.join(installRoot, "Math3D.exe");
const installedWorkerExe =
  process.env.MATH3D_INSTALLED_WORKER_EXE ??
  path.join(installRoot, "resources", "python-worker", "worker.exe");
const runPackagedE2E = ["1", "true", "yes", "on"].includes(
  String(process.env.MATH3D_RUN_PACKAGED_E2E ?? "").toLowerCase()
);

test.describe("Packaged desktop flow", () => {
  test.skip(
    !runPackagedE2E,
    "Set MATH3D_RUN_PACKAGED_E2E=1 to run installed-app and bundled-worker packaged tests."
  );
  test.skip(
    !(existsSync(installedAppExe) && existsSync(installedWorkerExe)),
    `Installed app/worker not found. app=${installedAppExe} worker=${installedWorkerExe}`
  );

  test("installed app launches", async () => {
    let app: ElectronApplication | null = null;
    try {
      const launchEnv: Record<string, string | undefined> = {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
      };
      delete launchEnv.ELECTRON_RUN_AS_NODE;

      app = await electron.launch({
        executablePath: installedAppExe,
        args: [],
        env: launchEnv,
      });
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: "Math3D", exact: true })).toBeVisible();
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  test("bundled worker responds and one tiny real operation succeeds", async () => {
    const smokeScript = path.join(repoRoot, "scripts", "smoke-python-worker.mjs");
    const { stdout } = await execFileAsync(
      process.execPath,
      [smokeScript, "--exe", installedWorkerExe],
      {
        cwd: repoRoot,
        timeout: 3 * 60 * 1000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    expect(stdout).toContain("[smoke] ok");
  });
});
