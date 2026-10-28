import { expect, test } from "@playwright/test";
import { _electron as electron, chromium } from "playwright";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { definedEnvironment, launchRepoElectron } from "./helpers/electronLauncher";

const command = promisify(execFile);
const labCheckout = process.env.QLAB_E2E_CHECKOUT;
const installedLab = process.env.QLAB_E2E_INSTALLED_EXE;
const installedMath3D = process.env.MATH3D_E2E_INSTALLED_EXE;
const math3d = resolve(__dirname, "..", "..");

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port");
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
  return address.port;
}

async function launchedLabPids(executable: string, port: number, runId: string): Promise<number[]> {
  const processName = basename(executable).replaceAll("'", "''");
  const { stdout } = await command("powershell.exe", ["-NoProfile", "-Command",
    `Get-CimInstance Win32_Process -Filter "Name = '${processName}'" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`],
    { maxBuffer: 1024 * 1024 });
  const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : [];
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((entry: any) =>
    typeof entry?.ProcessId === "number" &&
    typeof entry?.ExecutablePath === "string" && entry.ExecutablePath.toLowerCase() === executable.toLowerCase() &&
    typeof entry?.CommandLine === "string" && entry.CommandLine.includes(`--remote-debugging-port=${port}`) &&
    entry.CommandLine.includes("--quantum-source-run") && entry.CommandLine.includes(runId))
    .map((entry: any) => entry.ProcessId);
}

test("real five-run convergence point opens exact Lab runs and refuses missing or changed Lab sources", async () => {
  test.skip(!labCheckout, "Set QLAB_E2E_CHECKOUT to a built Theory Lab checkout for the live two-app acceptance");
  test.skip(process.platform !== "win32", "Detached Lab process cleanup is currently Windows-only");
  test.setTimeout(300_000);
  const lab = resolve(labCheckout!);
  const executable = installedLab || join(lab, "node_modules", "electron", "dist", "electron.exe");
  const root = await mkdtemp(join(tmpdir(), "rice-roundtrip-"));
  const profile = join(root, "lab-profile"), exports = join(root, "exports"), report = join(root, "fixture.json");
  await mkdir(profile); await mkdir(exports);
  const active: { value: { port: number; runId: string } | null } = { value: null };
  try {
    await command(process.execPath, [join(lab, "node_modules", "tsx", "dist", "cli.mjs"),
      join(lab, "scripts", "export-rice-mele-roundtrip.ts"), profile, exports, report],
      { cwd: lab, timeout: 90_000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(report, "utf8")) as {
      bundle: string; studyId: string; sources: { runId: string; resultSha256: string }[];
      selected: { periodic: { runId: string; resultSha256: string; duration: number };
        chain: { runId: string; resultSha256: string; width: number } };
    };
    expect(fixture.sources).toHaveLength(5);

    async function handoff(series: "periodic" | "chain", outcome: "opened" | "missing" | "tampered") {
      const point = fixture.selected[series], port = await freePort();
      active.value = { port, runId: point.runId };
      const mathProfile = join(root, `math3d-${series}-${outcome}`);
      const mathUserData = join(mathProfile, "user-data");
      await mkdir(mathUserData, { recursive: true });
      await writeFile(join(mathUserData, "theory-lab-target.json"), JSON.stringify({
        schema: "math3d/theory-lab-target/v2", path: installedLab || lab,
      }) + "\n");
      const env: Record<string, string | undefined> = { ...process.env, MATH3D_E2E_PROFILE_ROOT: mathProfile,
        MATH3D_E2E_USER_DATA_DIR: mathUserData, MATH3D_E2E: "1",
        QLAB_TEST_PROFILE: profile,
        MATH3D_E2E_LAB_DEBUG_PORT: String(port) };
      delete env.MATH3D_THEORY_LAB_HOME;
      const app = installedMath3D
        ? await electron.launch({ executablePath: installedMath3D, cwd: dirname(installedMath3D),
          args: [`--user-data-dir=${mathUserData}`, "--quantum-scene", fixture.bundle],
          env: definedEnvironment(env) })
        : await launchRepoElectron({ args: [".", "--quantum-scene", fixture.bundle], cwd: math3d, env });
      try {
        const page = await app.firstWindow(), scene = page.getByTestId("rice-convergence-profile");
        await expect(scene).toBeVisible();
        if (series === "periodic" && outcome === "opened") {
          const status = await page.evaluate(() => (window as Window & { quantumScenes?: {
            theoryLabTargetStatus: () => Promise<{ state: string; source: string; path?: string }>;
          } }).quantumScenes?.theoryLabTargetStatus());
          expect(status).toMatchObject({ state: "ready", source: "saved", path: installedLab || lab });
        }
        await expect(scene).toContainText(fixture.studyId);
        await expect(page.getByTestId("rice-convergence-selection")).toHaveCount(0);
        await scene.getByRole("button", { name: series === "periodic"
          ? `Inspect periodic point 2, duration ${fixture.selected.periodic.duration}`
          : `Inspect chain point 3, width ${fixture.selected.chain.width}` }).click();
        await expect(page.getByTestId("rice-convergence-selection")).toContainText(point.runId);
        await expect(page.getByTestId("rice-convergence-selection")).toContainText(point.resultSha256);
        await page.getByTestId("rice-convergence-open-selected-run").click();
        await expect(page.getByTestId("rice-convergence-run-status")).toContainText(point.runId);

        await expect.poll(async () => {
          try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; }
          catch { return false; }
        }, { timeout: 45_000 }).toBe(true);
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        try {
          await expect.poll(() => browser.contexts().flatMap(context => context.pages()).length,
            { timeout: 30_000 }).toBeGreaterThan(0);
          const labPage = browser.contexts().flatMap(context => context.pages())[0];
          if (outcome === "opened") {
            await expect(labPage.getByTestId("workspace-run-id")).toHaveText(point.runId, { timeout: 45_000 });
            await expect(labPage.getByTestId("workspace-message")).toContainText(`reopened · ${point.runId}`);
            await expect(labPage.getByTestId("workspace-message")).not.toContainText(fixture.studyId);
          } else {
            await expect(labPage.getByTestId("workspace-message")).toContainText("Source run unavailable", { timeout: 45_000 });
            await expect(labPage.getByTestId("workspace-run-id")).toHaveCount(0);
            await expect(labPage.getByTestId("workspace-message")).toContainText(
              outcome === "missing" ? /missing|not found|ENOENT/i : /integrity|hash|digest/i);
          }
        } finally { await browser.close().catch(() => {}); }
      } finally {
        const labPids = await launchedLabPids(executable, port, point.runId);
        for (const pid of labPids)
          await command("taskkill", ["/PID", String(pid), "/T", "/F"]);
        if (installedMath3D) {
          // Electron's packaged window can close before Playwright's context
          // handshake completes; bound that close and stop only its own PID.
          const pid = app.process()?.pid;
          try {
            await Promise.race([app.close(), new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Packaged Math3D close timed out")), 5_000))]);
          } catch {
            if (pid) await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
          }
        } else await app.close();
        active.value = null;
      }
    }

    await handoff("periodic", "opened");
    await handoff("chain", "opened");
    // A reopened Math3D profile must demand a fresh verified point selection.
    await handoff("periodic", "opened");
    const periodic = fixture.selected.periodic;
    const sourceDir = join(profile, "runs", periodic.runId);
    await rename(sourceDir, `${sourceDir}-missing`);
    try { await handoff("periodic", "missing"); }
    finally { await rename(`${sourceDir}-missing`, sourceDir); }
    const resultFile = join(sourceDir, "result.json"), original = await readFile(resultFile);
    await writeFile(resultFile, Buffer.concat([original, Buffer.from(" ")]));
    try { await handoff("periodic", "tampered"); }
    finally { await writeFile(resultFile, original); }
  } finally {
    if (active.value) for (const pid of await launchedLabPids(executable, active.value.port, active.value.runId).catch(() => []))
      await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("rice-roundtrip-"))
      throw new Error("Unsafe two-app test cleanup path");
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
