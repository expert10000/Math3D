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

test("GRA-10 previews and imports explicit lines from a verified 2D scalar grid", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "grid.sscene");
  await mkdir(directory);
  const values = Buffer.alloc(12 * 8);
  Array.from({ length: 12 }, (_, index) => values.writeDoubleLE(index, index * 8));
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "grid", title: "Measured grid",
    source: { producer: "theory-lab", sourceId: "run-2d", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [{ id: "samples", path: "samples.f64", format: "f64le", count: 12, bytes: values.length, sha256: hash(values) }],
    coordinates: [{ id: "plane", kind: "cartesian", axes: [{ name: "time", unit: "s" }, { name: "distance", unit: "m" }],
      origin: [2, 10], spacing: [.5, 2], periodic: [false, false] }],
    datasets: [{ id: "amplitude", semanticType: "scalar-field", coordinateSystem: "plane", shape: [3, 4],
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
    const open = async () => {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Import scientific dataset" }).click();
      return page.getByRole("dialog", { name: "Import verified scientific dataset" });
    };
    let dialog = await open();
    await expect(dialog).toContainText("shape [3, 4]");
    await expect(dialog).toContainText("Axis 0: time (s)");
    await dialog.getByLabel("Varying axis").selectOption("0");
    await dialog.getByLabel("Fixed index").selectOption("1");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (2, 1)");
    await expect(dialog).toContainText("last (3, 9)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 line imported from this grid");
    await expect(dialog.getByRole("button", { name: "Import as point series" })).toBeDisabled();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · distance = 12 m");
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("distance = 12 m");
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(page.getByLabel("Graph functions", { exact: true })).not.toContainText("Amplitude");
    await page.keyboard.press("Control+y");
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("distance = 12 m");
    await dialog.getByLabel("Varying axis").selectOption("1");
    await dialog.getByLabel("Fixed index").selectOption("2");
    const changed = Buffer.from(values); changed[0] ^= 1;
    await writeFile(join(directory, "samples.f64"), changed);
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("button", { name: "Import as point series" })).toBeDisabled();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · distance = 12 m");
    await writeFile(join(directory, "samples.f64"), values);
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (10, 8)");
    await expect(dialog).toContainText("last (16, 11)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2 lines imported from this grid");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · time = 3 s");
    await expect(dialog.getByLabel("Fixed index")).toHaveValue("0");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (10, 0)");
    await expect(dialog).toContainText("last (16, 3)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(dialog).toContainText("3 lines imported from this grid");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · time = 2 s");
    const swatches = await page.getByLabel("Graph functions", { exact: true }).locator(".graph2d-function-swatch")
      .evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.backgroundColor));
    expect(new Set(swatches).size).toBe(3);
    await dialog.getByLabel("Fixed index").selectOption("2");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("This grid line is already imported");
    await expect(dialog.getByRole("button", { name: "Import as point series" })).toBeDisabled();
    await writeFile(join(directory, "samples.f64"), changed);
    await dialog.getByLabel("Varying axis").selectOption("0");
    await dialog.getByLabel("Fixed index").selectOption("0");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("button", { name: "Import as point series" })).toBeDisabled();
    const fingerprint = hash(manifest);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    const stale = await page.evaluate(async request => {
      const scenes = (window as unknown as { scientificScenes: { previewGraphSlice: (selection: {
        fingerprint: string; datasetId: string; varyingAxis: 0 | 1; fixedIndex: number }) => Promise<unknown> } }).scientificScenes;
      try { await scenes.previewGraphSlice(request); return false; } catch { return true; }
    }, { fingerprint, datasetId: "amplitude", varyingAxis: 1 as const, fixedIndex: 2 });
    expect(stale).toBe(true);
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await page.getByTestId("kernel-workspace-reopen").click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("time = 2 s");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · distance = 12 m");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · time = 3 s");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Amplitude · time = 2 s");
    const reopenedSwatches = await page.getByLabel("Graph functions", { exact: true }).locator(".graph2d-function-swatch")
      .evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.backgroundColor));
    expect(reopenedSwatches).toEqual(swatches);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-10 keeps a verified 256² grid outside the renderer and previews one 256-row line", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "large-grid.sscene");
  await mkdir(directory);
  const values = Buffer.alloc(256 * 256 * 8);
  for (let index = 0; index < 256 * 256; index += 1) values.writeDoubleLE(index, index * 8);
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "large-grid", title: "Large grid",
    source: { producer: "theory-lab", sourceId: "large-run", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [{ id: "samples", path: "samples.f64", format: "f64le", count: 65536, bytes: values.length, sha256: hash(values) }],
    coordinates: [{ id: "plane", kind: "cartesian", axes: [{ name: "x", unit: "m" }, { name: "y", unit: "m" }],
      origin: [0, 0], spacing: [1, 1], periodic: [false, false] }],
    datasets: [{ id: "height", semanticType: "scalar-field", coordinateSystem: "plane", shape: [256, 256],
      order: "last-axis-fastest", quantity: { name: "Height", unit: "m" }, real: "samples" }], views: [],
  });
  await writeFile(join(directory, "samples.f64"), values);
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
    await preview.getByLabel("Varying axis").selectOption("0");
    await preview.getByLabel("Fixed index").selectOption("255");
    await preview.getByRole("button", { name: "Preview line" }).click();
    await expect(preview).toContainText("256 checked samples");
    await expect(preview).toContainText("first (0, 255)");
    await expect(preview).toContainText("last (255, 65535)");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-10 opens bundled 2D grid presets without a folder picker", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => { throw new Error("Preset must not open a folder picker"); }; });
    const openPreset = async (name: string) => {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name }).click();
      return page.getByRole("dialog", { name: "Import verified scientific dataset" });
    };
    let dialog = await openPreset("Thermal gradient grid preset");
    await expect(dialog).toContainText("Thermal gradient · sample scalar grid");
    await expect(dialog).toContainText("shape [5, 7]");
    await expect(dialog.getByLabel("Varying axis")).toHaveValue("0");
    await expect(dialog.getByLabel("Fixed index")).toHaveValue("3");
    await expect(dialog.getByRole("button", { name: "Preview line" })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Import as point series" })).toBeDisabled();
    await dialog.getByLabel("Varying axis").selectOption("0");
    await dialog.getByLabel("Fixed index").selectOption("2");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (0, 286)");
    await expect(dialog).toContainText("last (4, 289)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("distance = 4 m");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Varying axis").selectOption("1");
    await dialog.getByLabel("Fixed index").selectOption("3");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("Line at time = 3 s");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Temperature · distance = 4 m");
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Temperature · time = 3 s");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    dialog = await openPreset("Sine–cosine grid preset");
    await expect(dialog).toContainText("shape [17, 17]");
    await dialog.getByLabel("Varying axis").selectOption("1");
    await dialog.getByLabel("Fixed index").selectOption("12");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("17 checked samples");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    const invalid = await page.evaluate(async () => {
      const scenes = (window as unknown as { scientificScenes: { openGraphDatasetPreset: (id: string) => Promise<{
        ok: boolean; error?: string }> } }).scientificScenes;
      return scenes.openGraphDatasetPreset("../unknown");
    });
    expect(invalid).toMatchObject({ ok: false, error: "Invalid Graph dataset preset" });
  } finally {
    await closeSurfaceApp(app);
  }
});
