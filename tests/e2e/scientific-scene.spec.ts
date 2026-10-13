import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("non-quantum scientific fixture opens in the existing viewer and inspects a verified source sample", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-scientific-scene-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    const chooser = page.getByTestId("quantum-scene-examples");
    await chooser.getByTestId("scientific-example-sincos").click();
    const preview = page.getByTestId("scientific-scene-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("sin(x) cos(y)");
    await expect(preview).toContainText("17 × 17 samples");
    await preview.getByRole("button", { name: "Inspect center sample" }).click();
    const selection = page.getByTestId("scientific-sample-selection");
    await expect(selection).toContainText("index 144 · grid [8, 8]");
    await expect(selection).toContainText("f = 0.0000000");
    await expect(selection).toContainText("Stable sample ID: sincos-grid:f:144");
    const fingerprint = await preview.locator("code").filter({ hasText: /^[a-f0-9]{64}$/ }).textContent();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const refused = await page.evaluate(async () => {
      try {
        await (window as any).scientificScenes.sample({ fingerprint: "0".repeat(64), datasetId: "f", sampleIndex: 0 });
        return false;
      } catch { return true; }
    });
    expect(refused).toBe(true);
    await preview.getByRole("button", { name: "Close" }).click();
    await expect(preview).toBeHidden();
    const refusedAfterClose = await page.evaluate(async savedFingerprint => {
      try {
        await (window as any).scientificScenes.sample({ fingerprint: savedFingerprint, datasetId: "f", sampleIndex: 0 });
        return false;
      } catch { return true; }
    }, fingerprint);
    expect(refusedAfterClose).toBe(true);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-scientific-scene-"))
      throw new Error("Unsafe scientific scene cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit external .sscene picker keeps source verification and refuses changed bytes", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-scientific-external-"));
  const directory = join(root, "external.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/sincos.sscene"), directory, { recursive: true });
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const showChooser = async () => {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
        .fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
      return page.getByTestId("quantum-scene-examples");
    };
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, directory);
    let chooser = await showChooser();
    await chooser.getByTestId("scientific-open-directory").click();
    const preview = page.getByTestId("scientific-scene-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("external producer (untrusted)");
    await expect(preview).toContainText("Hashes verify the selected bytes");
    const dataPath = join(directory, "values.f64");
    const original = await readFile(dataPath);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(dataPath, changed);
    await preview.getByRole("button", { name: "Inspect center sample" }).click();
    await expect(preview.getByRole("alert")).toContainText("resource integrity failed");
    await preview.getByRole("button", { name: "Close" }).click();
    await expect(preview).toBeHidden();
    chooser = await showChooser();
    await chooser.getByTestId("scientific-open-directory").click();
    await expect(chooser.getByRole("alert")).toContainText("resource integrity failed");
    await writeFile(dataPath, original);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, root);
    await chooser.getByTestId("scientific-open-directory").click();
    await expect(chooser.getByRole("alert")).toContainText("Choose a .sscene directory");
    const rendererPathRefused = await page.evaluate(async () => {
      const result = await (window as any).scientificScenes.openDirectory("C:\\renderer-chosen.sscene");
      return result.ok === false && result.canceled === false;
    });
    expect(rendererPathRefused).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await chooser.getByTestId("scientific-open-directory").click();
    await expect(chooser.getByRole("alert")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-scientific-external-"))
      throw new Error("Unsafe external scientific scene cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
