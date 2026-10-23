import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GRA-14 3D arrows reverify one complete vector bundle and reject changed or missing bytes", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector3d-"));
  const directory = join(root, "flow.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(importer).toContainText("shape [21, 21, 17]");
    await importer.getByRole("button", { name: "Open in 3D vector editor" }).click();
    const editor = page.getByRole("dialog", { name: "3D vector field editor" });
    await expect(editor).toContainText("east");
    await expect(editor).toContainText("north");
    await expect(editor).toContainText("up");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("125 of 125 bounded samples");
    const canvas = editor.locator("canvas");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Arrow canvas did not mount");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 55, bounds.y + bounds.height / 2 + 30);
    await page.mouse.up();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("125 of 125 bounded samples");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Open saved document" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("125 of 125 bounded samples");

    const resource = join(directory, "north.f64");
    const manifestBytes = await readFile(join(directory, "manifest.json"));
    const fingerprint = createHash("sha256").update(manifestBytes).digest("hex");
    const active = await page.evaluate(async ({ folder, sourceFingerprint }) => {
      const bridge = (window as unknown as { scientificScenes: {
        openGraphDatasetReference: (request: unknown) => Promise<{ ok: boolean }>;
      } }).scientificScenes;
      return bridge.openGraphDatasetReference({ locator: { kind: "directory", value: folder },
        sceneFingerprint: sourceFingerprint });
    }, { folder: directory, sourceFingerprint: fingerprint });
    expect(active.ok).toBe(true);
    const original = await readFile(resource);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    const freshPreview = await page.evaluate(async (sourceFingerprint) => {
      const bridge = (window as unknown as { scientificScenes: {
        previewVectorVolume: (request: unknown) => Promise<unknown>;
        closeGraphDataset: (fingerprint: string) => Promise<boolean>;
      } }).scientificScenes;
      try { await bridge.previewVectorVolume({ fingerprint: sourceFingerprint, datasetId: "field",
        components: ["east", "north", "up"] }); return "unexpected success"; }
      catch (error) { return String(error); }
      finally { await bridge.closeGraphDataset(sourceFingerprint); }
    }, fingerprint);
    expect(freshPreview).toMatch(/integrity failed.*north/i);
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);

    await rm(resource);
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector3d-"))
      throw new Error("Unsafe vector-field fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-14 expression editor preserves a saved document and enforces the glyph budget", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "3D vector field editor" }).click();
    const editor = page.getByRole("dialog", { name: "3D vector field editor" });
    await expect(editor.getByLabel("P(x,y,z)")).toHaveValue("-y");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("125 of 125 bounded samples");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByLabel("P(x,y,z)").fill("1");
    await editor.getByRole("button", { name: "Open saved document" }).click();
    await expect(editor.getByLabel("P(x,y,z)")).toHaveValue("-y");
    await editor.getByLabel("Density x").fill("16");
    await editor.getByLabel("Density y").fill("16");
    await editor.getByLabel("Density z").fill("16");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("alert")).toContainText("glyph budget");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
import { createHash } from "node:crypto";
