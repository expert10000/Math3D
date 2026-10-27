import { expect, test } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const canonical = (opened: any) => {
  expect(opened).toMatchObject({ ok: true, reference: { sceneFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...document } = opened.document;
  return { fingerprint: opened.reference.sceneFingerprint, document,
    mappedObjectIds: opened.mappedObjectIds, deferredObjectIds: opened.deferredObjectIds,
    deferredFieldIds: opened.deferredFieldIds };
};

test("Q09 picker, pinned example and Lab-style launch admit one canonical verified scene", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q09-routes-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
    "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene");
  const handoff = join(root, "lab-handoff.qscene");
  await cp(fixture, handoff, { recursive: true });
  const launch = (args: string[]) => launchRepoElectron({ args, cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch(["."]);
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, handoff);
    const picker = await page.evaluate(() => (window as any).quantumScenes.open());
    const expected = canonical(picker);
    expect(picker.reference.directory).toBe(handoff);
    const reference = await page.evaluate(ref => (window as any).quantumScenes.openReference(ref), picker.reference);
    expect(canonical(reference)).toEqual(expected);
    const pinned = await page.evaluate(() => (window as any).quantumScenes.openExample("qwz-bands"));
    expect(canonical(pinned)).toEqual(expected);
    await app.close();

    // Theory Lab passes only the verified .qscene folder through this startup flag.
    app = await launch([".", "--quantum-scene", handoff]);
    page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("QWZ supplied energy bands");
    const launched = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(canonical(launched)).toEqual(expected);
    expect(launched.reference.directory).toBe(handoff);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q09-routes-")) throw new Error("Unsafe Q09 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
