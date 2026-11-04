import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("portable quantum Project opens from a moved pack and refuses changed blobs", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi06-ui-"));
  const source = resolve(__dirname, "..", "fixtures", "quantum-qi01",
    "run-05ce1036d70c466eb4f900944a85c474.qscene");
  const pack = join(root, "source.qpack"), moved = join(root, "moved.qpack");
  let app = await launchRepoElectron({ args: [".", "--quantum-scene", source],
    cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const reference = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    await projects.getByTestId(`project-admit-quantum-scene-${reference.sceneFingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Project contents");
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, pack);
    await projects.getByTestId("project-export-quantum-pack").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("exported", { timeout: 60_000 });
    await cp(pack, moved, { recursive: true });
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "new-host-profile") } });
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, moved);
    await projects.getByTestId("project-open-quantum-pack").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("verified", { timeout: 60_000 });
    await expect(page.getByTestId("project-import-open")).toBeEnabled();
    await page.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    expect(restored.sceneFingerprint).toBe(reference.sceneFingerprint);
    expect(restored.directory).toContain("quantum-pack-scenes");
    const manifest = JSON.parse(await readFile(join(moved, "manifest.json"), "utf8"));
    const blob = join(moved, "blobs", manifest.scenes[0].files.find((item: { name: string }) => item.name === "scene.json").sha256);
    const bytes = await readFile(blob); bytes[0] ^= 1; await writeFile(blob, bytes);
    await projects.getByTestId("project-open-quantum-pack").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("blob hash changed");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi06-ui-")) throw new Error("Unsafe QI-06 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
