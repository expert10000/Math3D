import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

test("GRA-10 explicitly imports a verified 1D scientific dataset and rejects changed bytes", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "wave.sscene");
  await mkdir(directory);
  const values = Buffer.alloc(32);
  [0, 1, 0, -1].forEach((value, index) => values.writeDoubleLE(value, index * 8));
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "wave", title: "Measured wave",
    source: { producer: "theory-lab", sourceId: "run-1", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [{ id: "samples", path: "samples.f64", format: "f64le", count: 4, bytes: 32, sha256: hash(values) }],
    coordinates: [{ id: "time", kind: "cartesian", axes: [{ name: "time", unit: "s" }],
      origin: [2], spacing: [.25], periodic: [false] }],
    datasets: [{ id: "amplitude", semanticType: "scalar-field", coordinateSystem: "time", shape: [4],
      order: "last-axis-fastest", quantity: { name: "Amplitude", unit: "V" }, real: "samples" }], views: [],
  });
  await writeFile(join(directory, "samples.f64"), values);
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "scientific-scene-bundle/v1",
    manifest: { path: "manifest.json", bytes: Buffer.byteLength(manifest), sha256: hash(manifest) } }));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const preview = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(preview).toContainText("4 checked samples");
    await expect(preview).toContainText("time (s)");
    await expect(preview).toContainText("Amplitude (V)");
    await preview.getByRole("button", { name: "Import as point series" }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude");
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("theory-lab/run-1");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await page.getByTestId("kernel-workspace-reopen").click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude");
    const changed = Buffer.from(await readFile(join(directory, "samples.f64")));
    changed[0] ^= 1;
    await writeFile(join(directory, "samples.f64"), changed);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await expect(page.getByRole("alert")).toContainText("resource integrity failed");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
