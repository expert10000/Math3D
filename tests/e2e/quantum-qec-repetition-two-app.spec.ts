import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { definedEnvironment, launchRepoElectron } from "./helpers/electronLauncher";

const labCheckout = process.env.QLAB_E2E_CHECKOUT;

test("saved ideal QEC run reopens, exports exact rounds, and opens in Math3D", async ({}, testInfo) => {
  test.skip(!labCheckout || process.platform !== "win32", "Requires a built Windows Theory Lab checkout");
  test.setTimeout(180_000);
  const lab = resolve(labCheckout!), math3d = resolve(__dirname, "..", "..");
  const root = await mkdtemp(join(tmpdir(), "m3d-qec-two-app-"));
  const labProfile = join(root, "lab-profile"), exportParent = join(root, "export");
  await mkdir(labProfile); await mkdir(exportParent);
  const launchLab = () => electron.launch({ executablePath: join(lab, "node_modules", "electron", "dist", "electron.exe"),
    args: [lab], cwd: lab, env: definedEnvironment({ ...process.env, QLAB_TEST_PROFILE: labProfile }) });
  let labApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let mathApp: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    labApp = await launchLab();
    let labPage = await labApp.firstWindow();
    await labPage.getByTestId("worker-status").filter({ hasText: "READY" }).waitFor({ timeout: 45_000 });
    await labPage.getByRole("button", { name: "Backend", exact: true }).click();
    const qec = labPage.getByTestId("qec-repetition-example");
    await qec.getByLabel("QEC flip schedule").fill("0, none, 1");
    await qec.getByRole("button", { name: "Measure ideal syndromes" }).click();
    await expect(qec.getByTestId("qec-saved-status")).toContainText("Saved immutable run");
    const runId = (await qec.getByTestId("qec-saved-status").innerText()).match(/run-[a-f0-9]{32}/)?.[0];
    expect(runId).toBeTruthy();
    await labApp.close(); labApp = undefined;

    labApp = await launchLab();
    labPage = await labApp.firstWindow();
    await labPage.getByRole("button", { name: "Backend", exact: true }).click();
    const reopened = labPage.getByTestId("qec-repetition-example");
    await reopened.getByTestId("qec-saved-runs").getByRole("button", { name: `Reopen ${runId}` }).click();
    await expect(reopened.getByTestId("qec-saved-status")).toContainText("Reopened verified run");
    const saved = await labPage.evaluate(id => (window as any).quantum.getQecRepetitionRun(id), runId);
    await labApp.evaluate(({ dialog }, parent) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] });
    }, exportParent);
    await reopened.getByRole("button", { name: "Export verified QEC scene" }).click();
    await expect(reopened.getByTestId("qec-saved-status")).toContainText("Exported verified QEC scene");
    const folder = join(exportParent, `${runId}-qec.qscene`);
    const scene = JSON.parse(await readFile(join(folder, "scene.json"), "utf8"));
    expect(scene.provenance).toMatchObject({ runId, resultSha256: saved.resultSha256,
      model: "qec_repetition_ideal", kind: "numerical-result" });
    for (const [dataset, expected] of [
      ["qec-syndrome", saved.result.rounds.flatMap((row: any) => row.syndrome)],
      ["qec-defects", saved.result.rounds.flatMap((row: any) => row.defects)],
      ["qec-data-bits", saved.result.rounds.flatMap((row: any) => row.dataBits)],
    ] as const) {
      const bytes = await readFile(join(folder, `${dataset}.f64`));
      expect(Array.from({ length: bytes.length / 8 }, (_, index) => bytes.readDoubleLE(index * 8))).toEqual(expected);
    }

    mathApp = await launchRepoElectron({ args: [".", "--quantum-scene", folder], cwd: math3d,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "math-profile") } });
    const mathPage = await mathApp.firstWindow();
    const preview = mathPage.getByTestId("quantum-scene-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(runId!);
    await expect(preview).toContainText("qec_repetition_ideal");
    await expect(preview.getByTestId("qec-repetition-profile")).toContainText("not a surface-code");
    await expect(preview.getByTestId("quantum-open-source-run")).toHaveCount(0);
    const opened = await mathPage.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(opened.ok).toBe(true);
    expect(opened.reference.sceneFingerprint).toBe(createHash("sha256").update(JSON.stringify(scene)).digest("hex"));
    await mathPage.screenshot({ path: testInfo.outputPath("qec-math3d.png") });
    const scenePath = join(folder, "scene.json"), original = await readFile(scenePath);
    await writeFile(scenePath, Buffer.concat([original, Buffer.from(" ")]));
    await expect(mathPage.evaluate((fingerprint: string) => (window as any).quantumScenes.verifyActive(fingerprint),
      opened.reference.sceneFingerprint)).rejects.toThrow();
  } finally {
    await mathApp?.close(); await labApp?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qec-two-app-"))
      throw new Error("Unsafe QEC two-app cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
