import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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

test("GRA-10 imports checked complex and vector components as separate Graph series", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "components.sscene");
  await mkdir(directory);
  const samples = [
    { id: "real", values: [1, 0, -1, 0] },
    { id: "imaginary", values: [0, 1, 0, -1] },
    { id: "east", values: [2, 3, 4, 5] },
    { id: "north", values: [5, 4, 3, 2] },
  ];
  const resources = await Promise.all(samples.map(async sample => {
    const bytes = Buffer.alloc(sample.values.length * 8);
    sample.values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    await writeFile(join(directory, `${sample.id}.f64`), bytes);
    return { id: sample.id, path: `${sample.id}.f64`, format: "f64le", count: sample.values.length,
      bytes: bytes.length, sha256: hash(bytes) };
  }));
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "components", title: "Component study",
    source: { producer: "theory-lab", sourceId: "run-2", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources,
    coordinates: [{ id: "time", kind: "cartesian", axes: [{ name: "time", unit: "s" }],
      origin: [0], spacing: [1], periodic: [false] }],
    datasets: [
      { id: "wave", semanticType: "complex-scalar-field", coordinateSystem: "time", shape: [4],
        order: "last-axis-fastest", quantity: { name: "Wave", unit: "V" }, real: "real", imaginary: "imaginary" },
      { id: "velocity", semanticType: "vector-field", coordinateSystem: "time", shape: [4],
        order: "last-axis-fastest", quantity: { name: "Velocity", unit: "m/s" },
        components: [{ name: "east", resource: "east" }, { name: "north", resource: "north" }] },
    ], views: [],
  });
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "scientific-scene-bundle/v1",
    manifest: { path: "manifest.json", bytes: Buffer.byteLength(manifest), sha256: hash(manifest) } }));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const preview = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await preview.getByLabel("Dataset component").selectOption("wave:imaginary");
    await expect(preview).toContainText("Wave imaginary (V)");
    await preview.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Wave imaginary");
    await preview.getByLabel("Dataset component").selectOption("velocity:north");
    await expect(preview).toContainText("Velocity north (m/s)");
    await preview.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Velocity north");
    await preview.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await page.getByTestId("kernel-workspace-reopen").click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Wave imaginary");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Velocity north");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-10 imports a vector bundle published by the reference Python tool", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "published-vector.sscene");
  const specPath = join(root, "vector.json");
  await writeFile(specPath, JSON.stringify({
    sceneId: "published-vector", title: "Measured velocity", producer: "python",
    sourceId: "run-3", sourceSchema: "python-data/v1", coordinateKind: "cartesian",
    axes: [{ name: "time", unit: "s" }], origin: [0], spacing: [0.5], periodic: [false], shape: [4],
    datasetId: "velocity", quantity: { name: "Velocity", unit: "m/s" },
    components: [{ name: "east", values: [1, 2, 3, 4] }, { name: "north", values: [4, 3, 2, 1] }],
  }));
  const python = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
  execFileSync(python, [resolve("integrations/python/scientific_scene_publisher.py"),
    "--spec", specPath, "--output", directory]);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const preview = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await preview.getByLabel("Dataset component").selectOption("velocity:north");
    await expect(preview).toContainText("Velocity north (m/s)");
    await preview.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Velocity north");
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("python/run-3");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
