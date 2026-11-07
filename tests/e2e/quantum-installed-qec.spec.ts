import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { definedEnvironment } from "./helpers/electronLauncher";

const command = promisify(execFile);

async function closeInstalled(app: Awaited<ReturnType<typeof electron.launch>> | undefined) {
  if (!app) return;
  const pid = app.process()?.pid;
  try {
    await Promise.race([app.close(), new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Packaged app close timed out")), 5_000))]);
  } catch {
    if (pid) await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
  }
}

function installedEnvironment(values: Record<string, string | undefined>) {
  const env = definedEnvironment(values);
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.MATH3D_PYTHON;
  return env;
}

test("installed Lab exports a saved ideal QEC run that installed Math3D verifies and reopens", async () => {
  test.skip(process.platform !== "win32" || !process.env.QLAB_E2E_INSTALLED_EXE ||
    !process.env.MATH3D_E2E_INSTALLED_EXE, "Requires both installed applications");
  test.setTimeout(240_000);
  const labExe = resolve(process.env.QLAB_E2E_INSTALLED_EXE!);
  const mathExe = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const root = await mkdtemp(join(tmpdir(), "installed-qec-two-app-"));
  const labProfile = join(root, "lab-profile"), exportParent = join(root, "export");
  const mathProfile = join(root, "math-profile"), mathUserData = join(mathProfile, "user-data");
  await mkdir(labProfile); await mkdir(exportParent); await mkdir(mathUserData, { recursive: true });
  const launchLab = () => electron.launch({ executablePath: labExe, cwd: dirname(labExe),
    args: [`--user-data-dir=${labProfile}`],
    env: installedEnvironment({ ...process.env, QLAB_TEST_PROFILE: labProfile }) });
  let labApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let mathApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    labApp = await launchLab();
    let page = await labApp.firstWindow();
    await expect(page.getByTestId("worker-status")).toContainText("READY", { timeout: 45_000 });
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    const qec = page.getByTestId("qec-repetition-example");
    await qec.getByLabel("QEC flip schedule").fill("0, none, 1");
    await qec.getByRole("button", { name: "Measure ideal syndromes" }).click();
    await expect(qec.getByTestId("qec-saved-status")).toContainText("Saved immutable run");
    const runId = (await qec.getByTestId("qec-saved-status").innerText()).match(/run-[a-f0-9]{32}/)?.[0];
    expect(runId).toBeTruthy();
    await closeInstalled(labApp); labApp = undefined;

    labApp = await launchLab();
    page = await labApp.firstWindow();
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    const reopened = page.getByTestId("qec-repetition-example");
    await reopened.getByTestId("qec-saved-runs").getByRole("button", { name: `Reopen ${runId}` }).click();
    await expect(reopened.getByTestId("qec-saved-status")).toContainText("Reopened verified run");
    const saved = await page.evaluate(id => (window as any).quantum.getQecRepetitionRun(id), runId);
    await labApp.evaluate(({ dialog }, parent) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] });
    }, exportParent);
    await reopened.getByRole("button", { name: "Export verified QEC scene" }).click();
    await expect(reopened.getByTestId("qec-saved-status")).toContainText("Exported verified QEC scene");
    const bundle = join(exportParent, `${runId}-qec.qscene`);
    const scene = JSON.parse(await readFile(join(bundle, "scene.json"), "utf8"));
    expect(scene.provenance).toMatchObject({ runId, resultSha256: saved.resultSha256,
      model: "qec_repetition_ideal", kind: "numerical-result" });
    for (const [dataset, expected] of [
      ["qec-syndrome", saved.result.rounds.flatMap((row: any) => row.syndrome)],
      ["qec-defects", saved.result.rounds.flatMap((row: any) => row.defects)],
      ["qec-data-bits", saved.result.rounds.flatMap((row: any) => row.dataBits)],
    ] as const) {
      const bytes = await readFile(join(bundle, `${dataset}.f64`));
      expect(Array.from({ length: bytes.length / 8 }, (_, index) => bytes.readDoubleLE(index * 8))).toEqual(expected);
    }
    await closeInstalled(labApp); labApp = undefined;

    mathApp = await electron.launch({ executablePath: mathExe, cwd: dirname(mathExe),
      args: [`--user-data-dir=${mathUserData}`, "--quantum-scene", bundle],
      env: installedEnvironment({ ...process.env, MATH3D_E2E: "1",
        MATH3D_E2E_PROFILE_ROOT: mathProfile, MATH3D_E2E_USER_DATA_DIR: mathUserData }) });
    const mathPage = await mathApp.firstWindow();
    const preview = mathPage.getByTestId("quantum-scene-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(runId!);
    await expect(preview).toContainText("qec_repetition_ideal");
    await expect(preview.getByTestId("qec-repetition-profile")).toContainText("not a surface-code");
    const opened = await mathPage.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(opened.ok).toBe(true);
    const sceneFingerprint = createHash("sha256").update(JSON.stringify(scene)).digest("hex");
    expect(opened.reference.sceneFingerprint).toBe(sceneFingerprint);
    if (process.env.MATH3D_SIGNOFF_QEC_RESULT_PATH) {
      await writeFile(resolve(process.env.MATH3D_SIGNOFF_QEC_RESULT_PATH), JSON.stringify({
        schema: "math3d/installed-qec-result/v1", runId, resultSha256: saved.resultSha256,
        sceneFingerprint, exactArraysVerified: true, installedProfileVisible: true,
        installedSceneReopened: true,
      }, null, 2) + "\n");
    }
  } finally {
    await closeInstalled(mathApp); await closeInstalled(labApp);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("installed-qec-two-app-"))
      throw new Error("Unsafe installed QEC cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
