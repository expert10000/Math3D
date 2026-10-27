import { expect, test } from "@playwright/test";
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { launchRepoElectron } from "./helpers/electronLauncher";

const command = promisify(execFile);
const labCheckout = process.env.QLAB_E2E_CHECKOUT;
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
  const { stdout } = await command("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"],
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
  const executable = join(lab, "node_modules", "electron", "dist", "electron.exe");
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
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture.bundle], cwd: math3d,
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, `math3d-${series}-${outcome}`),
          MATH3D_THEORY_LAB_HOME: lab, QLAB_TEST_PROFILE: profile,
          MATH3D_E2E_LAB_DEBUG_PORT: String(port) } });
      try {
        const page = await app.firstWindow(), scene = page.getByTestId("rice-convergence-profile");
        await expect(scene).toBeVisible();
        await expect(scene).toContainText(fixture.studyId);
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
        for (const pid of await launchedLabPids(executable, port, point.runId).catch(() => []))
          await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
        await app.close();
        active.value = null;
      }
    }

    await handoff("periodic", "opened");
    await handoff("chain", "opened");
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
