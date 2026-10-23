import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { definedEnvironment, launchRepoElectron } from "./helpers/electronLauncher";

const labCheckout = process.env.QLAB_E2E_CHECKOUT;
const command = promisify(execFile);

const canonical = (opened: any) => {
  expect(opened).toMatchObject({ ok: true, reference: { sceneFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...document } = opened.document;
  return { document, fingerprint: opened.reference.sceneFingerprint,
    mappedObjectIds: opened.mappedObjectIds, deferredObjectIds: opened.deferredObjectIds,
    deferredFieldIds: opened.deferredFieldIds };
};

async function liveReceiverPids(executable: string, uniqueRoot: string): Promise<number[]> {
  if (process.platform !== "win32") throw new Error("The live Q09 receiver cleanup currently requires Windows");
  const { stdout } = await command("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"],
    { maxBuffer: 1024 * 1024 });
  const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : [];
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.filter((entry: any) =>
    typeof entry?.ProcessId === "number" &&
    typeof entry?.ExecutablePath === "string" && entry.ExecutablePath.toLowerCase() === executable.toLowerCase() &&
    typeof entry?.CommandLine === "string" && entry.CommandLine.includes("--quantum-scene") &&
    entry.CommandLine.includes(uniqueRoot)).map((entry: any) => entry.ProcessId);
}

test("Q09 real Theory Lab button launches Math3D with the same canonical portable scene as manual import", async () => {
  test.skip(!labCheckout, "Set QLAB_E2E_CHECKOUT to a built Theory Lab checkout for the live two-app acceptance");
  test.skip(process.platform !== "win32", "The live receiver process cleanup is Windows-only");
  test.setTimeout(180_000);
  const math3d = resolve(__dirname, "..", "..");
  const lab = resolve(labCheckout!);
  const root = await mkdtemp(join(tmpdir(), "m3d-q09-two-app-"));
  const labProfile = join(root, "lab-profile");
  const receiverProfile = join(root, "receiver-profile");
  const receiverExecutable = join(math3d, "node_modules", "electron", "dist", "electron.exe");
  await mkdir(labProfile);
  let labApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let controlledApp: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, QLAB_TEST_PROFILE: labProfile, QLAB_MATH3D_HOME: math3d,
      MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: receiverProfile };
    delete env.ELECTRON_RUN_AS_NODE;
    labApp = await electron.launch({ executablePath: join(lab, "node_modules", "electron", "dist", "electron.exe"),
      args: [lab], cwd: lab, env: definedEnvironment(env) });
    const labPage = await labApp.firstWindow();
    await labPage.getByTestId("worker-status").filter({ hasText: "READY" }).waitFor({ timeout: 45_000 });
    await labPage.getByRole("button", { name: /Rabi dynamics/ }).click();
    await labPage.getByRole("combobox", { name: "Dynamics engine" }).selectOption("native");
    await labPage.getByTestId("run-evolution").click();
    await labPage.getByTestId("evolution-state").filter({ hasText: "COMPLETE" }).waitFor({ timeout: 30_000 });
    const runId = await labPage.getByTestId("workspace-run-id").innerText();
    const source = await labPage.evaluate(id => (window as any).quantum.getScene(id, "standard"), runId);
    await labPage.getByTestId("view-in-scenes").click();
    await labPage.getByTestId("scenes-page").waitFor();
    await labPage.getByTestId("open-in-math3d").click();
    await labPage.getByRole("status").filter({ hasText: "Math3D launched with this verified scene" }).waitFor({ timeout: 30_000 });

    const recentFile = join(receiverProfile, "quantum-scene-recent.json");
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(recentFile, "utf8")).directory as string; }
      catch { return ""; }
    }, { timeout: 45_000 }).toMatch(/\.qscene$/i);
    const recent = JSON.parse(await readFile(recentFile, "utf8"));
    expect(recent.directory).toContain(labProfile);
    const scene = JSON.parse(await readFile(join(recent.directory, "scene.json"), "utf8"));
    expect(scene).toEqual(source.scene);
    expect(scene.provenance).toMatchObject({ runId, resultSha256: source.scene.provenance.resultSha256 });
    expect(recent.sceneFingerprint).toBe(createHash("sha256").update(JSON.stringify(scene)).digest("hex"));
    expect(await liveReceiverPids(receiverExecutable, root)).not.toHaveLength(0);

    const exportParent = join(root, "export-parent");
    await mkdir(exportParent);
    await labApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, exportParent);
    await labPage.getByTestId("export-scene").click();
    await labPage.getByRole("status").filter({ hasText: "Exported verified scene bundle" }).waitFor();
    const exported = join(exportParent, (await readdir(exportParent)).find(name => name.endsWith(".qscene"))!);
    expect(JSON.parse(await readFile(join(exported, "scene.json"), "utf8"))).toEqual(scene);

    for (const pid of await liveReceiverPids(receiverExecutable, root))
      await command("taskkill", ["/PID", String(pid), "/T", "/F"]);
    await labApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, exported);
    await labPage.getByTestId("import-scene").click();
    await labPage.getByRole("status").filter({ hasText: "Opened verified scene bundle" }).waitFor();
    await labPage.getByTestId("open-in-math3d").click();
    await labPage.getByRole("status").filter({ hasText: "Math3D launched with the verified imported scene" }).waitFor();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(recentFile, "utf8")).directory as string; }
      catch { return ""; }
    }, { timeout: 45_000 }).toBe(exported);
    expect(await liveReceiverPids(receiverExecutable, root)).not.toHaveLength(0);

    // Open the exact Lab-created bytes through an independently controlled
    // Math3D window so we can compare the visible startup route and the picker.
    controlledApp = await launchRepoElectron({ args: [".", "--quantum-scene", recent.directory], cwd: math3d,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "controlled-profile") } });
    const mathPage = await controlledApp.firstWindow();
    await expect(mathPage.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(mathPage.getByTestId("quantum-scene-preview")).toContainText(runId);
    await expect(mathPage.getByTestId("quantum-scene-preview")).toContainText(source.scene.provenance.resultSha256);
    const launched = await mathPage.evaluate(() => (window as any).quantumScenes.reopenRecent());
    const expected = canonical(launched);
    expect(expected.fingerprint).toBe(recent.sceneFingerprint);
    await controlledApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, recent.directory);
    const picked = await mathPage.evaluate(() => (window as any).quantumScenes.open());
    expect(canonical(picked)).toEqual(expected);
    await controlledApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, exported);
    const exportedPicked = await mathPage.evaluate(() => (window as any).quantumScenes.open());
    expect(canonical(exportedPicked)).toEqual(expected);
  } finally {
    await controlledApp?.close();
    // Kill only the receiver process launched with this test's unique Lab
    // profile and this exact Math3D executable; never touch a user's app.
    for (const pid of await liveReceiverPids(receiverExecutable, root).catch(() => []))
      await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
    if (labApp) {
      const labPid = labApp.process()?.pid;
      try {
        await Promise.race([labApp.close(), new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Theory Lab did not close promptly")), 8_000))]);
      } catch {
        if (labPid) await command("taskkill", ["/PID", String(labPid), "/T", "/F"]).catch(() => {});
      }
    }
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q09-two-app-")) throw new Error("Unsafe Q09 cleanup path");
    // Chromium may briefly retain Windows session files after its process exits.
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
