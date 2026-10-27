import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Q09 saved Lab scene refuses stale bytes and survives exact relink and restart", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q09-project-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
    "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene");
  const pinned = JSON.parse(await readFile(join(fixture, "scene.json"), "utf8"));
  const original = join(root, "original.qscene"), relocated = join(root, "relocated.qscene");
  await cp(fixture, original, { recursive: true });
  await cp(fixture, relocated, { recursive: true });
  const launch = (args: string[]) => launchRepoElectron({ args, cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch([".", "--quantum-scene", original]);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("QWZ supplied energy bands");
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      return { id: project.identity.id, reference: project.quantumScenes[0], bytes: localStorage.getItem("math3d.project.v1") };
    });
    expect(saved.reference).toMatchObject({ directory: original, sceneFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    await app.close();

    const binary = join(original, "band-energy-0.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    app = await launch(["."]);
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${saved.id}`).click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await projects.getByTestId(`project-open-quantum-scene-${saved.reference.sceneFingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText(/Scene unavailable:.*integrity/);
    await expect(page.getByTestId("quantum-scene-preview")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved.bytes);
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, relocated);
    await projects.getByTestId(`project-relink-quantum-scene-${saved.reference.sceneFingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Save project to retain the relink");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved.bytes);
    // Opening a saved Project also restores its active Geometry workspace. Its
    // floating header can cover the compact Project management action, so
    // invoke the same enabled button handler without a blocked pointer event.
    await projects.getByTestId("project-save").evaluate((button: HTMLButtonElement) => button.click());
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const relinked = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    expect(relinked).toMatchObject({ directory: relocated, sceneFingerprint: saved.reference.sceneFingerprint });
    await app.close();

    app = await launch(["."]);
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${saved.id}`).click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await projects.getByTestId(`project-open-quantum-scene-${saved.reference.sceneFingerprint}`).click();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("QWZ supplied energy bands");
    await expect(page.getByTestId("quantum-source-directory")).toHaveText(relocated);
    await expect(page.getByTestId("quantum-scene-preview")).toContainText(pinned.provenance.runId);
    await expect(page.getByTestId("quantum-scene-preview")).toContainText(pinned.provenance.resultSha256);
    // Recent and Project links have distinct scopes: the last direct import
    // still targets the tampered original, while the saved Project owns the
    // explicit exact-fingerprint relink to the relocated bundle.
    const reopened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(reopened).toMatchObject({ ok: false, canceled: false, error: expect.stringMatching(/integrity/i) });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q09-project-")) throw new Error("Unsafe Q09 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
