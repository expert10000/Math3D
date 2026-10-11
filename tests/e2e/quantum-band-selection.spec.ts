import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import { writeLargeBandFixture } from "../../scripts/quantum-band-fixtures.mjs";

test("SSH line and QWZ surface selection keep exact samples through Project restart and refuse tampering", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q06-bands-"));
  const fixtures = resolve(__dirname, "..", "fixtures", "quantum-scene");
  const ssh = join(root, "ssh.qscene"), qwz = join(root, "qwz.qscene");
  await cp(join(fixtures, "run-145ac3f06cb940c28d457937345b0243-bands.qscene"), ssh, { recursive: true });
  await cp(join(fixtures, "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene"), qwz, { recursive: true });
  const large = await writeLargeBandFixture(qwz, join(root, "large.qscene"));
  const launch = (args: string[] = ["."]) => launchRepoElectron({ args, cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch([".", "--quantum-scene", ssh]);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("line sample");
    await expect(page.getByTestId("quantum-band-selection")).toContainText("band-0:sample:0");
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Source run:");
    const sshFingerprint = (await page.evaluate(() => (window as any).quantumScenes.reopenRecent())).reference.sceneFingerprint;
    const exactSsh = await page.evaluate(async fingerprint => (window as any).quantumScenes.bandSample({
      fingerprint, objectId: "band-1", sampleIndex: 10,
    }), sshFingerprint);
    expect(exactSsh).toMatchObject({ objectId: "band-1", sampleIndex: 10,
      sampleId: "band-1:sample:10", coordinateDatasetId: "band-k", energyDatasetId: "band-energy-1" });
    expect(Number.isFinite(exactSsh.k[0]) && Number.isFinite(exactSsh.energy)).toBe(true);
    await page.getByTestId("quantum-scene-close").click();

    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, qwz);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command", { command: "file:open-quantum-scene" }); });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    const stale = await page.evaluate(async fingerprint => {
      try { await (window as any).quantumScenes.bandSample({ fingerprint, objectId: "band-0", sampleIndex: 0 }); return "accepted"; }
      catch (error) { return String(error); }
    }, sshFingerprint);
    expect(stale).toMatch(/does not match the active verified scene/);
    await page.getByRole("button", { name: "Inspect first band sample band-1" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("surface sample");
    await expect(page.getByTestId("quantum-band-selection")).toContainText("kx:");
    await expect(page.getByTestId("quantum-band-selection")).toContainText("ky:");
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Energy:");
    const canvas = page.getByTestId("quantum-scene-geometry").locator("canvas").first();
    const bounds = (await canvas.boundingBox())!;
    let pickedSurface = false;
    for (const x of [.3, .45, .6, .7]) {
      for (const y of [.25, .4, .55, .7]) {
        await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
        if (await page.getByTestId("quantum-band-selection").count()) { pickedSurface = true; break; }
      }
      if (pickedSurface) break;
    }
    expect(pickedSurface).toBe(true);
    await expect(page.getByTestId("quantum-band-selection")).toContainText("dataset index:");
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("Eigenstates and global band identity are not inferred");
    await page.getByTestId("quantum-scene-close").click();
    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, large);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command", { command: "file:open-quantum-scene" }); });
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("Synthetic bounded band surface");
    await expect(page.getByTestId("quantum-band-lod")).toContainText("Display-only 2× grid LOD");
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("band-0:sample:0");
    const largeFingerprint = (await page.evaluate(() => (window as any).quantumScenes.reopenRecent())).reference.sceneFingerprint;
    const lastLarge = await page.evaluate(async fingerprint => (window as any).quantumScenes.bandSample({
      fingerprint, objectId: "band-1", sampleIndex: 960,
    }), largeFingerprint);
    expect(lastLarge).toMatchObject({ sampleId: "band-1:sample:960", energyDatasetId: "band-energy-1" });
    await page.getByTestId("quantum-scene-close").click();

    if (!(await page.getByTestId("project-explorer-panel").isVisible())) await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const reference = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    await expect(page.getByTestId(`project-open-quantum-scene-${reference.sceneFingerprint}`)).toBeVisible();
    await page.getByTestId(`project-open-quantum-scene-${reference.sceneFingerprint}`)
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("band-0:sample:0");
    const source = await readFile(join(large, "scene.json"));
    await writeFile(join(large, "scene.json"), Buffer.concat([source, Buffer.from(" ")]));
    await page.getByRole("button", { name: "Inspect first band sample band-1" }).click();
    await expect(page.getByRole("alert")).toContainText(/Band selection refused:.*(integrity|file size|hash)/i);
    await expect(page.getByTestId("quantum-band-selection")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q06-bands-"))
      throw new Error("Unsafe Q06 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
