import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const safeCleanup = async (root: string) => {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q09-failure-"))
    throw new Error("Unsafe Q09 cleanup path");
  await rm(root, { recursive: true, force: true });
};

test("Q09 malformed external launch reports refusal without opening a scene", async () => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q09-failure-"));
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", "relative.qscene"], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("app-status-bar")).toContainText("External quantum scene handoff refused: Invalid quantum scene launch folder");
    await expect(page.getByTestId("quantum-scene-preview")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).quantumScenes.consumeLaunch())).toMatchObject({ ok: false, canceled: true });
    const recent = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(recent).toMatchObject({ ok: false, canceled: false });
    expect(recent.error).toContain("No recent quantum scene");
  } finally { await app.close(); await safeCleanup(root); }
});

test("Q09 missing and changed imports leave active verification, recent link and Project bytes intact", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q09-failure-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
    "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene");
  const changed = join(root, "changed.qscene");
  await cp(fixture, changed, { recursive: true });
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const opened = await page.evaluate(() => (window as any).quantumScenes.openExample("qwz-bands"));
    expect(opened.ok).toBe(true);
    const fingerprint = opened.reference.sceneFingerprint;
    const projectBefore = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const missing = await page.evaluate(ref => (window as any).quantumScenes.openReference(ref),
      { directory: join(root, "missing.qscene"), sceneFingerprint: fingerprint });
    expect(missing).toMatchObject({ ok: false, canceled: false });
    const binary = join(changed, "band-energy-0.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, changed);
    const refused = await page.evaluate(() => (window as any).quantumScenes.open());
    expect(refused).toMatchObject({ ok: false, canceled: false });
    expect(refused.error).toMatch(/integrity/);
    expect(await page.evaluate(hash => (window as any).quantumScenes.verifyActive(hash), fingerprint)).toBe(true);
    const recent = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(recent).toMatchObject({ ok: true, reference: { sceneFingerprint: fingerprint } });
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(projectBefore);
  } finally { await app.close(); await safeCleanup(root); }
});
