import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("explicit external Python job publishes, verifies, opens, and cancels without auto-run", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-python-scene-e2e-"));
  const pythonCommand = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
  const executable = execFileSync(pythonCommand, ["-c", "import sys;print(sys.executable)"], { encoding: "utf8" }).trim();
  const script = resolve("integrations/python/scientific_scene_publisher.py");
  const spec = join(root, "field.json"), output = join(root, "published.sscene");
  await writeFile(spec, JSON.stringify({ sceneId: "ui-python-grid", title: "UI Python grid", producer: "python",
    sourceId: "ui-test", sourceSchema: "python-data/v1", coordinateKind: "cartesian",
    axes: [{ name: "x", unit: "m" }, { name: "y", unit: "m" }], origin: [0, 0], spacing: [1, 1],
    periodic: [false, false], shape: [2, 2], datasetId: "f",
    quantity: { name: "value", unit: "K" }, real: [1, 2, 3, 4] }));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const chooser = async () => {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
        .fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
      return page.getByTestId("quantum-scene-examples");
    };
    const setPickers = async (publisher: string, destination: string) => {
      await app.evaluate(({ dialog }, choices) => {
        let index = 0;
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [choices.files[index++]] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: choices.output });
        dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
      }, { files: [executable, publisher, spec], output: destination });
    };
    await setPickers(script, output);
    let dialog = await chooser();
    await dialog.getByTestId("scientific-prepare-publisher").click();
    const confirmation = dialog.getByTestId("scientific-publisher-confirmation");
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(executable);
    await expect(confirmation).toContainText(script);
    await expect(confirmation).toContainText(output);
    await expect(readFile(join(output, "manifest.json"))).rejects.toThrow();
    await confirmation.getByTestId("scientific-run-publisher").click();
    const preview = page.getByTestId("scientific-scene-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("UI Python grid");
    await preview.getByRole("button", { name: "Inspect center sample" }).click();
    await expect(preview.getByTestId("scientific-sample-selection")).toContainText("f = 4.0000000 K");
    expect(JSON.parse(await readFile(join(output, "manifest.json"), "utf8")).sceneId).toBe("ui-python-grid");
    await preview.getByRole("button", { name: "Close" }).click();
    await expect(preview).toBeHidden();

    const referenceOutput = join(root, "reference.sscene");
    await app.evaluate(({ dialog }, choices) => {
      let index = 0;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [choices.files[index++]] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: choices.output });
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    }, { files: [executable, spec], output: referenceOutput });
    dialog = await chooser();
    await dialog.getByTestId("scientific-prepare-reference-publisher").click();
    await expect(dialog.getByTestId("scientific-publisher-confirmation")).toContainText("Math3D reference publisher");
    await expect(dialog.getByTestId("scientific-publisher-confirmation")).toContainText(script);
    await dialog.getByTestId("scientific-run-publisher").click();
    await expect(preview).toContainText("UI Python grid");
    expect(JSON.parse(await readFile(join(referenceOutput, "manifest.json"), "utf8")).sceneId).toBe("ui-python-grid");
    await preview.getByRole("button", { name: "Close" }).click();

    const slowScript = join(root, "slow.py"), canceledOutput = join(root, "cancelled.sscene");
    await writeFile(slowScript, "import time\ntime.sleep(10)\n");
    await setPickers(slowScript, canceledOutput);
    dialog = await chooser();
    await dialog.getByTestId("scientific-prepare-publisher").click();
    await expect(dialog.getByTestId("scientific-publisher-confirmation")).toBeVisible();
    await dialog.getByTestId("scientific-run-publisher").click();
    await expect(dialog.getByTestId("scientific-cancel-publisher")).toBeVisible();
    await page.waitForTimeout(150);
    await dialog.getByTestId("scientific-cancel-publisher").click();
    await expect(dialog.getByRole("alert")).toContainText("cancelled");
    await expect(readFile(join(canceledOutput, "manifest.json"))).rejects.toThrow();

    const unapprovedOutput = join(root, "unapproved.sscene");
    await setPickers(script, unapprovedOutput);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await dialog.getByTestId("scientific-prepare-publisher").click();
    await expect(dialog.getByTestId("scientific-publisher-confirmation")).toBeVisible();
    await dialog.getByTestId("scientific-run-publisher").click();
    await expect(dialog.getByRole("alert")).toContainText("cancelled");
    await expect(readFile(join(unapprovedOutput, "manifest.json"))).rejects.toThrow();
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-python-scene-e2e-"))
      throw new Error("Unsafe Python publisher E2E cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
