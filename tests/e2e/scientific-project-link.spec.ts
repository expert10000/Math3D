import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("reference scene links to a Project without arrays, survives restart, and refuses tampering", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-scientific-project-"));
  const pythonCommand = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
  const executable = execFileSync(pythonCommand, ["-c", "import sys;print(sys.executable)"], { encoding: "utf8" }).trim();
  const spec = resolve("integrations/python/examples/sincos-grid.json");
  const output = join(root, "source.sscene"), relocated = join(root, "relocated.sscene");
  const options = { args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } };
  const installedExe = process.env.MATH3D_INSTALLED_EXE;
  const launch = () => installedExe ? electron.launch({ executablePath: installedExe,
    args: [`--user-data-dir=${join(root, "profile", "user-data")}`],
    env: { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: join(root, "profile", "user-data") } })
    : launchRepoElectron(options);
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }, choices) => {
      let index = 0;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [choices.files[index++]] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: choices.output });
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    }, { files: [executable, spec], output });
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    const chooser = page.getByTestId("quantum-scene-examples");
    await chooser.getByTestId("scientific-prepare-reference-publisher").click();
    await expect(chooser.getByTestId("scientific-publisher-confirmation")).toContainText(spec);
    await chooser.getByTestId("scientific-run-publisher").click();
    const preview = page.getByTestId("scientific-scene-preview");
    await expect(preview).toContainText("Python sin(x) cos(y) reference grid");
    await preview.getByRole("button", { name: "Close" }).click();
    await cp(output, relocated, { recursive: true });

    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-scientific-scene").click();
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Close" }).click();
    await expect(projects.getByTestId("project-scientific-scene-message")).toContainText("staged");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const reference = saved.scientificScenes[0];
    expect(reference).toMatchObject({ format: "scientific-scene/v1", directory: output,
      sceneFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(saved)).not.toContain("values.f64");

    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    const restarted = page.getByTestId("project-explorer-panel");
    await expect(restarted.getByTestId("project-scene-shortcuts")).toContainText("Python sin(x) cos(y) reference grid");
    await restarted.getByTestId(`project-scene-shortcut-scientific-${reference.sceneFingerprint}`).click();
    await expect(page.getByTestId("scientific-scene-preview")).toBeVisible();
    await page.getByTestId("scientific-scene-preview").getByRole("button", { name: "Close" }).click();
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, output);
    await restarted.getByTestId("project-import-sscene").click();
    await expect(page.getByTestId("scientific-scene-preview")).toBeVisible();
    await page.getByTestId("scientific-scene-preview").getByRole("button", { name: "Close" }).click();
    const openLink = restarted.getByTestId(`project-open-scientific-scene-${reference.sceneFingerprint}`);
    await expect(openLink).toBeVisible();
    await openLink.click();
    await expect(page.getByTestId("scientific-scene-preview")).toContainText("Python sin(x) cos(y) reference grid");
    await page.getByTestId("scientific-scene-preview").getByRole("button", { name: "Close" }).click();
    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    const source = join(output, manifest.resources[0].path);
    const damaged = Buffer.from(await readFile(source)); damaged[0] ^= 1;
    await writeFile(source, damaged);
    await openLink.click();
    await expect(restarted.getByTestId("project-scientific-scene-message")).toContainText(/Scene unavailable:.*integrity/);
    await expect(page.getByTestId("scientific-scene-preview")).toBeHidden();

    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, relocated);
    await restarted.getByTestId(`project-relink-scientific-scene-${reference.sceneFingerprint}`).click();
    await expect(restarted.getByTestId("project-scientific-scene-message")).toContainText("Save project to retain the relink");
    await restarted.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).scientificScenes[0].directory))
      .toBe(relocated);
    await openLink.click();
    await expect(page.getByTestId("scientific-scene-preview")).toContainText("Python sin(x) cos(y) reference grid");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-scientific-project-"))
      throw new Error("Unsafe scientific Project test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
