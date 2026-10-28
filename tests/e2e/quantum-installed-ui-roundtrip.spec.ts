import { expect, test } from "@playwright/test";
import { _electron as electron, chromium } from "playwright";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { definedEnvironment } from "./helpers/electronLauncher";

const command = promisify(execFile);

function isolatedInstalledEnvironment(values: Record<string, string | undefined>) {
  const pathKey = Object.keys(values).find(key => key.toLowerCase() === "path");
  if (pathKey && values[pathKey])
    values[pathKey] = values[pathKey].split(delimiter).filter(entry => !/python|conda/i.test(entry)).join(delimiter);
  delete values.ELECTRON_RUN_AS_NODE;
  delete values.PYTHONHOME;
  delete values.PYTHONPATH;
  delete values.MATH3D_PYTHON;
  return definedEnvironment(values);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port");
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
  return address.port;
}

async function stopHandoffLab(executable: string, port: number, runId: string) {
  const name = basename(executable).replaceAll("'", "''");
  const { stdout } = await command("powershell.exe", ["-NoProfile", "-Command",
    `Get-CimInstance Win32_Process -Filter "Name = '${name}'" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`],
    { maxBuffer: 1024 * 1024 });
  const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : [];
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    const process = entry as { ProcessId?: number; ExecutablePath?: string; CommandLine?: string };
    if (typeof process.ProcessId === "number" && process.ExecutablePath?.toLowerCase() === executable.toLowerCase() &&
        process.CommandLine?.includes(`--remote-debugging-port=${port}`) && process.CommandLine.includes(runId))
      await command("taskkill", ["/PID", String(process.ProcessId), "/T", "/F"]);
  }
}

test("installed Lab UI creates a saved SSH run and exports a scene that installed Math3D returns to its exact run", async () => {
  test.skip(process.platform !== "win32" || !process.env.QLAB_E2E_INSTALLED_EXE || !process.env.MATH3D_E2E_INSTALLED_EXE,
    "Set both installed executable paths; no Theory Lab checkout is used");
  test.setTimeout(180_000);
  const labExe = resolve(process.env.QLAB_E2E_INSTALLED_EXE!);
  const mathExe = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const root = await mkdtemp(join(tmpdir(), "installed-ui-roundtrip-"));
  const labProfile = join(root, "lab-profile"), sceneParent = join(root, "exports");
  const mathProfileRoot = process.env.MATH3D_SIGNOFF_MATH_PROFILE
    ? resolve(process.env.MATH3D_SIGNOFF_MATH_PROFILE) : join(root, "math3d-profile");
  const mathUserData = join(mathProfileRoot, "user-data");
  const port = await freePort();
  let runId = "";
  await mkdir(labProfile); await mkdir(sceneParent); await mkdir(mathUserData, { recursive: true });
  try {
    const labEnv: Record<string, string | undefined> = { ...process.env, QLAB_TEST_PROFILE: labProfile };
    const lab = await electron.launch({ executablePath: labExe, cwd: dirname(labExe),
      args: [`--user-data-dir=${labProfile}`], env: isolatedInstalledEnvironment(labEnv) });
    try {
      const page = await lab.firstWindow();
      await expect(page.getByTestId("worker-status")).toContainText("READY", { timeout: 45_000 });
      await page.locator('details[data-model-group="topology"] summary').click();
      await page.getByRole("button", { name: "Topological bands" }).click();
      await expect(page.getByTestId("topology-lab")).toBeVisible();
      await page.getByTestId("run-topology").click();
      await expect(page.getByTestId("topology-result")).toBeVisible({ timeout: 45_000 });
      runId = (await page.getByTestId("workspace-run-id").innerText()).trim();
      expect(runId).toMatch(/^run-[A-Za-z0-9_-]+$/);
      await page.getByTestId("view-in-scenes").click();
      await expect(page.getByTestId("scenes-page")).toBeVisible();
      await expect(page.getByTestId("scene-run-id")).toContainText(runId);
      await lab.evaluate(({ dialog }, parent) => {
        (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [parent] });
      }, sceneParent);
      await page.getByTestId("export-scene").click();
      await expect(page.getByTestId("scenes-page").getByRole("status")).toContainText("Exported verified scene bundle");
    } finally { await lab.close(); }

    const bundles = (await readdir(sceneParent)).filter(name => name.endsWith(".qscene"));
    expect(bundles).toHaveLength(1);
    const bundle = join(sceneParent, bundles[0]);
    const savedRun = JSON.parse(await readFile(join(labProfile, "runs", runId, "manifest.json"), "utf8")) as {
      hashes: { result: string };
    };
    const resultBytes = await readFile(join(labProfile, "runs", runId, "result.json"));
    const resultSha256 = createHash("sha256").update(resultBytes).digest("hex");
    expect(savedRun.hashes.result).toBe(resultSha256);
    const scene = JSON.parse(await readFile(join(bundle, "scene.json"), "utf8")) as {
      provenance: { runId: string; resultSha256: string };
    };
    expect(scene.provenance).toMatchObject({ runId, resultSha256 });
    await writeFile(join(mathUserData, "theory-lab-target.json"), JSON.stringify({
      schema: "math3d/theory-lab-target/v2", path: labExe,
    }) + "\n");
    const mathEnv: Record<string, string | undefined> = { ...process.env, MATH3D_E2E: "1",
      MATH3D_E2E_USER_DATA_DIR: mathUserData, MATH3D_E2E_PROFILE_ROOT: mathProfileRoot,
      MATH3D_E2E_LAB_DEBUG_PORT: String(port), QLAB_TEST_PROFILE: labProfile };
    delete mathEnv.MATH3D_THEORY_LAB_HOME;
    const math = await electron.launch({ executablePath: mathExe, cwd: dirname(mathExe),
      args: [`--user-data-dir=${mathUserData}`, "--quantum-scene", bundle], env: isolatedInstalledEnvironment(mathEnv) });
    const mathPid = math.process()?.pid;
    try {
      const page = await math.firstWindow();
      await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
      await expect(page.getByTestId("quantum-scene-preview")).toContainText(runId);
      const target = await page.evaluate(() => (window as Window & { quantumScenes?: {
        theoryLabTargetStatus: () => Promise<{ state: string; source: string; path?: string }>;
      } }).quantumScenes?.theoryLabTargetStatus());
      expect(target).toMatchObject({ state: "ready", source: "saved", path: labExe });
      await page.getByTestId("quantum-open-source-run").click();
      await expect(page.getByTestId("quantum-source-run-status")).toContainText(runId);
      await expect.poll(async () => {
        try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; }
        catch { return false; }
      }, { timeout: 45_000 }).toBe(true);
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      try {
        await expect.poll(() => browser.contexts().flatMap(context => context.pages()).length,
          { timeout: 30_000 }).toBeGreaterThan(0);
        const reopened = browser.contexts().flatMap(context => context.pages())[0];
        await expect(reopened.getByTestId("workspace-run-id")).toHaveText(runId, { timeout: 45_000 });
        await expect(reopened.getByTestId("workspace-message")).toContainText(`reopened · ${runId}`);
        if (process.env.MATH3D_SIGNOFF_RESULT_PATH) {
          await writeFile(resolve(process.env.MATH3D_SIGNOFF_RESULT_PATH), JSON.stringify({
            schema: "math3d/stable-two-app-ui-result/v1", runId, resultSha256,
            sceneBundle: basename(bundle), sceneProvenanceVerified: true,
            installedMath3DOpenedExactRun: true,
          }, null, 2) + "\n");
        }
      } finally { await browser.close(); }
    } finally {
      // A packaged Electron window can close before Playwright's context
      // handshake completes. Bound cleanup and stop only this test instance.
      try {
        await Promise.race([math.close(), new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Packaged Math3D close timed out")), 5_000))]);
      } catch {
        if (mathPid) await command("taskkill", ["/PID", String(mathPid), "/T", "/F"]).catch(() => {});
      }
    }
  } finally {
    if (runId) await stopHandoffLab(labExe, port, runId).catch(() => {});
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("installed-ui-roundtrip-"))
      throw new Error("Unsafe installed UI test cleanup path");
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
