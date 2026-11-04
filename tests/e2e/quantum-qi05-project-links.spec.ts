import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Project persists reciprocal QWZ scene links across restart", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi05-ui-"));
  const fixtures = resolve(__dirname, "..", "fixtures", "quantum-qi01");
  const curvature = join(fixtures, "run-05ce1036d70c466eb4f900944a85c474.qscene");
  const bands = join(fixtures, "run-05ce1036d70c466eb4f900944a85c474-bands.qscene");
  const launch = (args: string[]) => launchRepoElectron({ args, cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch([".", "--quantum-scene", curvature]);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0].sceneFingerprint);
    await projects.getByTestId(`project-admit-quantum-scene-${first}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Project contents");
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, bands);
    await projects.getByTestId("project-import-qscene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("QWZ supplied energy bands");
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const second = await page.evaluate(firstFingerprint => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes
      .find((item: { sceneFingerprint: string }) => item.sceneFingerprint !== firstFingerprint)?.sceneFingerprint, first);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    await projects.getByTestId(`project-admit-quantum-scene-${second}`).click();
    await expect(projects.getByTestId(`project-quantum-linked-${first}`)).toContainText("1");
    await expect(projects.getByTestId(`project-quantum-linked-${second}`)).toContainText("1");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
      .filter((entry: { module: string }) => entry.module === "quantum").length), { timeout: 60_000 }).toBe(2);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.filter((entry: { module: string }) => entry.module === "quantum").length).toBe(2);
    await app.close();
    app = await launch(["."]);
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await expect(projects.getByTestId(`project-quantum-linked-${first}`)).toContainText("1");
    await expect(projects.getByTestId(`project-quantum-linked-${second}`)).toContainText("1");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi05-ui-")) throw new Error("Unsafe QI-05 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
