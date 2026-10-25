import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

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
    await page.setViewportSize({ width: 1440, height: 850 });
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

test("GRA-10 imports selected complex and vector lines from one verified 2D scene", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "components.sscene");
  await mkdir(directory);
  const parts = ["real", "imaginary", "east", "north"].map((id, part) => {
    const bytes = Buffer.alloc(12 * 8);
    for (let index = 0; index < 12; index += 1) bytes.writeDoubleLE(part * 100 + index, index * 8);
    return { id, bytes };
  });
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "components", title: "Complex and vector grids",
    source: { producer: "theory-lab", sourceId: "components-2d", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: parts.map(part => ({ id: part.id, path: `${part.id}.f64`, format: "f64le",
      count: 12, bytes: part.bytes.length, sha256: hash(part.bytes) })),
    coordinates: [{ id: "plane", kind: "cartesian", axes: [{ name: "time", unit: "s" }, { name: "distance", unit: "m" }],
      origin: [2, 10], spacing: [.5, 2], periodic: [false, false] }],
    datasets: [
      { id: "wave", semanticType: "complex-scalar-field", coordinateSystem: "plane", shape: [3, 4],
        order: "last-axis-fastest", quantity: { name: "Wave", unit: "V" }, real: "real", imaginary: "imaginary" },
      { id: "velocity", semanticType: "vector-field", coordinateSystem: "plane", shape: [3, 4],
        order: "last-axis-fastest", quantity: { name: "Velocity", unit: "m/s" },
        components: [{ name: "east", resource: "east" }, { name: "north", resource: "north" }] },
    ], views: [],
  });
  for (const part of parts) await writeFile(join(directory, `${part.id}.f64`), part.bytes);
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
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await dialog.getByLabel("Dataset component").selectOption("wave:imaginary");
    await dialog.getByRole("button", { name: "View verified field" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Wave imaginary/ })).toContainText("3 × 4 samples");
    const heatmap = dialog.getByRole("figure", { name: /Verified field plane for Wave imaginary/ });
    await heatmap.getByRole("combobox", { name: "Color range" }).selectOption("manual");
    await heatmap.getByLabel("Color minimum (V)").fill("103");
    await heatmap.getByLabel("Color maximum (V)").fill("108");
    await heatmap.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(heatmap.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, 103 to 108 V");
    await expect(heatmap).toContainText("clamped; source values are unchanged");
    await dialog.getByLabel("Fixed index").selectOption("1");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (2, 101)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Wave imaginary · distance = 12 m");
    await dialog.getByLabel("Dataset component").selectOption("velocity:north");
    await dialog.getByLabel("Varying axis").selectOption("1");
    await dialog.getByLabel("Fixed index").selectOption("2");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("first (10, 308)");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Velocity north · time = 3 s");
    await expect(page.getByLabel("Graph inspector", { exact: true })).toContainText("Velocity north (m/s)");
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    const vector = dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" });
    await expect(vector).toContainText("east → time, north → distance");
    await expect(vector).toContainText("Magnitude (m/s)");
    await expect(vector.getByRole("img")).toHaveAttribute("aria-label", /time \(s\).*distance \(m\)/);
    await expect(vector.locator("svg g[stroke-width='1.5']")).toHaveCount(12);
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(vector).toBeVisible();
    const changed = Buffer.from(parts[3]!.bytes);
    changed[0] ^= 1;
    await writeFile(join(directory, "north.f64"), changed);
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(vector).toHaveCount(0);
    await writeFile(join(directory, "north.f64"), parts[3]!.bytes);
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(vector).toBeVisible();
    await rm(join(directory, "east.f64"));
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/missing|resource/i);
    await expect(vector).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("Graphs views reverified 3D vector planes and rejects changed source bytes", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-dataset-"));
  const directory = join(root, "volume.sscene");
  await mkdir(directory);
  const parts = ["east", "north"].map((id, component) => {
    const bytes = Buffer.alloc(24 * 8);
    for (let index = 0; index < 24; index++) bytes.writeDoubleLE(component * 100 + index, index * 8);
    return { id, bytes };
  });
  const manifest = JSON.stringify({
    schema: "scientific-scene/v1", sceneId: "wind", title: "Wind volume",
    source: { producer: "lab", sourceId: "wind-3d", sourceSchema: "lab/v1", sha256: "a".repeat(64) },
    resources: parts.map(part => ({ id: part.id, path: `${part.id}.f64`, format: "f64le",
      count: 24, bytes: part.bytes.length, sha256: hash(part.bytes) })),
    coordinates: [{ id: "space", kind: "cartesian", axes: [{ name: "x", unit: "m" },
      { name: "y", unit: "m" }, { name: "z", unit: "m" }],
      origin: [1, 2, 3], spacing: [1, 2, 3], periodic: [false, false, false] }],
    datasets: [{ id: "wind", semanticType: "vector-field", coordinateSystem: "space", shape: [2, 3, 4],
      order: "last-axis-fastest", quantity: { name: "Wind", unit: "m/s" },
      components: [{ name: "east", resource: "east" }, { name: "north", resource: "north" }] }], views: [],
  });
  for (const part of parts) await writeFile(join(directory, `${part.id}.f64`), part.bytes);
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
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await dialog.getByLabel("Dataset component").selectOption("wind:north");
    await expect(dialog.getByLabel("Plane normal axis")).toHaveValue("2");
    await dialog.getByLabel("Plane fixed index").selectOption("3");
    await dialog.getByRole("button", { name: "View verified plane" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Wind north/ }))
      .toContainText("z = 12 m · 2 × 3 samples");
    await dialog.getByLabel("Plane normal axis").selectOption("0");
    await dialog.getByLabel("Plane fixed index").selectOption("1");
    await dialog.getByRole("button", { name: "View verified plane" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Wind north/ }))
      .toContainText("x = 2 m · 3 × 4 samples");
    const plane = dialog.getByRole("figure", { name: /Verified field plane for Wind north/ });
    await expect(plane.getByLabel(/Color legend/)).toHaveAttribute("aria-label", /m\/s/);
    await plane.getByRole("combobox", { name: "Color range" }).selectOption("manual");
    await plane.getByLabel("Color minimum (m/s)").fill("110");
    await plane.getByLabel("Color maximum (m/s)").fill("115");
    await plane.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(plane.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, 110 to 115 m/s");
    await expect(plane).toContainText("clamped; source values are unchanged");
    expect(await readFile(join(directory, "north.f64"))).toEqual(parts[1]!.bytes);
    const changedPlane = Buffer.from(parts[1]!.bytes);
    changedPlane[0] ^= 1;
    await writeFile(join(directory, "north.f64"), changedPlane);
    await plane.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: /Verified field plane/ })).toHaveCount(0);
    await writeFile(join(directory, "north.f64"), parts[1]!.bytes);
    await dialog.getByRole("button", { name: "View verified volume" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified volume for Wind north/ }))
      .toContainText("2 × 3 × 4 displayed samples");
    await expect(dialog.getByRole("figure", { name: /Verified volume for Wind north/ }))
      .toContainText("Displayed sample range 100 to 123 m/s");
    await expect(dialog.locator(".graph2d-scientific-volume canvas")).toHaveCount(1);
    const volume = dialog.getByRole("figure", { name: /Verified volume for Wind north/ });
    await volume.getByRole("combobox", { name: "Color range" }).selectOption("data");
    await volume.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(volume.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, 100 to 123 m/s");
    const changed = Buffer.from(parts[1]!.bytes);
    changed[0] ^= 1;
    await writeFile(join(directory, "north.f64"), changed);
    await volume.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: /Verified volume/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "View verified plane" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: /Verified field plane/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "View verified volume" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: /Verified volume/ })).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-dataset-")) throw new Error("Unsafe scientific fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("Graphs opens bundled scalar, complex and vector field presets without a folder picker", async () => {
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
      await page.getByRole("button", { name: "Scientific field presets" }).click();
      const chooser = page.getByRole("dialog", { name: "Scientific field presets" });
      await expect(chooser).toBeVisible();
      await chooser.getByRole("button", { name, exact: true }).click();
      return page.getByRole("dialog", { name: "Import verified scientific dataset" });
    };
    let dialog = await openPreset("Thermal gradient");
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
    dialog = await openPreset("Sine–cosine grid");
    await expect(dialog).toContainText("shape [17, 17]");
    await dialog.getByLabel("Varying axis").selectOption("1");
    await dialog.getByLabel("Fixed index").selectOption("12");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("17 checked samples");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    dialog = await openPreset("Complex wave packet");
    await expect(dialog).toContainText("Complex wave packet · 2D");
    await expect(dialog).toContainText("shape [41, 41]");
    await dialog.getByLabel("Dataset component").selectOption("field:imaginary");
    await dialog.getByRole("button", { name: "View verified field" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Wave amplitude imaginary/ }))
      .toContainText("41 × 41 samples");
    await dialog.getByLabel("Fixed index").selectOption("24");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("41 checked samples");
    await dialog.getByRole("button", { name: "Import as point series" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true })).toContainText("Wave amplitude imaginary");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    dialog = await openPreset("Planar vortex");
    await expect(dialog).toContainText("Planar vortex · 2D vector field");
    await dialog.getByLabel("Dataset component").selectOption("field:north");
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" }))
      .toContainText("Magnitude");
    await dialog.getByRole("button", { name: "View verified field" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Velocity north/ }))
      .toContainText("33 × 33 samples");
    await dialog.getByRole("button", { name: "Preview line" }).click();
    await expect(dialog).toContainText("33 checked samples");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    dialog = await openPreset("Swirling flow volume");
    await expect(dialog).toContainText("Swirling flow · 3D vector field");
    await dialog.getByLabel("Dataset component").selectOption("field:up");
    await dialog.getByRole("button", { name: "View verified plane" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Velocity up/ }))
      .toContainText("21 × 21 samples");
    await dialog.getByRole("button", { name: "View verified volume" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified volume for Velocity up/ }))
      .toContainText("21 × 21 × 17 displayed samples");
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

test("SCI-06 opens varied scalar presets and derives the quadratic volume", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => {
      throw new Error("Preset must not open a folder picker");
    }; });
    for (const [name, title, shape] of [
      ["Quadratic potential", "Quadratic potential · 2D scalar field", "shape [17, 17]"],
      ["Saddle potential", "Saddle potential · 2D scalar field", "shape [17, 17]"],
      ["Gaussian bump", "Gaussian bump · 2D scalar field", "shape [41, 41]"],
    ] as const) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific field presets" }).click();
      const chooser = page.getByRole("dialog", { name: "Scientific field presets" });
      await chooser.getByLabel("Preset data type").selectOption("scalar");
      await chooser.getByRole("button", { name, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
      await expect(dialog).toContainText(title);
      await expect(dialog).toContainText(shape);
      await dialog.getByRole("button", { name: "View verified field" }).click();
      await expect(dialog.getByRole("figure", { name: /Verified field plane/ })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    const chooser = page.getByRole("dialog", { name: "Scientific field presets" });
    await chooser.getByLabel("Preset data type").selectOption("scalar");
    await chooser.getByRole("button", { name: "Quadratic potential volume" }).click();
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(dialog).toContainText("Quadratic potential · 3D scalar field");
    await dialog.getByRole("button", { name: "View verified volume" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified volume for Potential scalar/ }))
      .toContainText("17 × 17 × 17 displayed samples");
    await dialog.getByRole("button", { name: "Save field reference" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields")
      .getByRole("button", { name: "Open field workspace" }).click();
    const workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await workspace.getByLabel("Scalar calculation").selectOption("laplacian");
    await workspace.getByRole("button", { name: "Preview and save derived field" }).click();
    await expect(workspace.getByRole("figure", { name: /Verified volume for Laplacian Potential/ }))
      .toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

test("GRA-13.3 saves one paired 2D vector reference and re-verifies both components after Project reopen", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-reference-"));
  const directory = join(root, "saved-vector.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-flow.sscene"), directory, { recursive: true });
  const north = await readFile(join(directory, "north.f64"));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    let dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(dialog.getByRole("button", { name: "Save 2D vector field reference" })).toBeDisabled();
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    const stale = Buffer.from(north);
    stale[0] ^= 1;
    await writeFile(join(directory, "north.f64"), stale);
    await dialog.getByRole("button", { name: "Save 2D vector field reference" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toHaveCount(0);
    await expect(page.getByLabel("Graph inspector").getByTestId("graph2d-saved-vector-field")).toHaveCount(0);
    await writeFile(join(directory, "north.f64"), north);
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await dialog.getByRole("button", { name: "Save 2D vector field reference" }).click();
    const saved = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-vector-field");
    await expect(saved).toContainText("field · 2D vector field · east + north");
    await expect(saved).toContainText("Both components verified on last opening");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await saved.getByRole("button", { name: "Open 2D field workspace" }).click();
    let fieldWorkspace = page.getByRole("dialog", { name: "2D vector field workspace" });
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await fieldWorkspace.getByRole("spinbutton", { name: "Density x" }).fill("9");
    await fieldWorkspace.getByRole("spinbutton", { name: "Density y" }).fill("7");
    await fieldWorkspace.getByRole("spinbutton", { name: "Arrow limit" }).fill("40");
    await fieldWorkspace.getByRole("spinbutton", { name: "Magnitude scale" }).fill("1.5");
    await fieldWorkspace.getByRole("button", { name: "Save view to Project" }).click();
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const references = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "graph2d")
      .flatMap((entry: { checkpoint: { source: { vectorFieldReferences?: unknown[] } } }) =>
        entry.checkpoint.source.vectorFieldReferences ?? []));
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ components: [
      { datasetId: "field", component: "east" }, { datasetId: "field", component: "north" }] });
    const vectorDocuments = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "vector2d"));
    expect(vectorDocuments).toHaveLength(1);
    expect(vectorDocuments[0].checkpoint.source.display).toEqual({
      density: [9, 7], maxGlyphs: 40, magnitudeScale: 1.5 });
    await page.reload();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-reopen").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Reopened and replay-verified");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(saved).toContainText("Not reverified on this opening");
    await saved.getByRole("button", { name: "Open 2D field workspace" }).click();
    fieldWorkspace = page.getByRole("dialog", { name: "2D vector field workspace" });
    await expect(fieldWorkspace.getByRole("spinbutton", { name: "Density x" })).toHaveValue("9");
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await expect(saved).toContainText("Both components verified on last opening");
    const changed = Buffer.from(north);
    changed[0] ^= 1;
    await writeFile(join(directory, "north.f64"), changed);
    await dialog.getByRole("button", { name: "View verified vector field" }).click();
    await expect(dialog.getByRole("alert")).toContainText("resource integrity failed");
    await expect(dialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toHaveCount(0);
    await expect(saved).toContainText("Changed source — arrows withheld");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    await expect(saved).toContainText("Changed source — arrows withheld");
    await expect(page.getByRole("dialog", { name: "Import verified scientific dataset" })).toHaveCount(0);
    await writeFile(join(directory, "north.f64"), north);
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    await expect(page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Cancel" }).click();
    await rm(join(directory, "east.f64"));
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    await expect(saved).toContainText("Missing source — arrows unavailable");
    await expect(page.getByRole("dialog", { name: "Import verified scientific dataset" })).toHaveCount(0);
    await cp(resolve("tests/fixtures/scientific-scene/vortex-flow.sscene/east.f64"), join(directory, "east.f64"));
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    const projectFieldId = vectorDocuments[0].expected.id as string;
    await expect(projectPanel.getByTestId(`project-view-${projectFieldId}`)).toBeVisible();
    await projectPanel.getByTestId(`project-view-${projectFieldId}`).click();
    fieldWorkspace = page.getByRole("dialog", { name: "2D vector field workspace" });
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await expect(fieldWorkspace.getByRole("spinbutton", { name: "Magnitude scale" })).toHaveValue("1.5");
    await writeFile(join(directory, "north.f64"), changed);
    await fieldWorkspace.getByRole("button", { name: "Reverify arrows" }).click();
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toHaveCount(0);
    await expect(fieldWorkspace.getByRole("alert")).toContainText("resource integrity failed");
    await writeFile(join(directory, "north.f64"), north);
    await fieldWorkspace.getByRole("button", { name: "Reverify arrows" }).click();
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await rm(join(directory, "east.f64"));
    await fieldWorkspace.getByRole("button", { name: "Reverify arrows" }).click();
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toHaveCount(0);
    await expect(fieldWorkspace.getByRole("status")).toContainText("Arrows withheld");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(projectFieldId);
    fieldWorkspace = page.getByRole("dialog", { name: "2D vector field workspace" });
    await expect(fieldWorkspace.getByRole("status")).toContainText("Arrows withheld");
    await expect(fieldWorkspace.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toHaveCount(0);
    await expect(fieldWorkspace.getByRole("spinbutton", { name: "Arrow limit" })).toHaveValue("40");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector-reference-"))
      throw new Error("Unsafe vector fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-13.3 saves a field component reference and revalidates it after Graphs reopen", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Planar vortex" }).click();
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await dialog.getByLabel("Dataset component").selectOption("field:north");
    await expect(dialog.getByRole("button", { name: "Save field reference" })).toBeDisabled();
    await dialog.getByRole("button", { name: "View verified field" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified field plane for Velocity north/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Save field reference" }).click();
    const saved = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields");
    await expect(saved).toContainText("field · north");
    await expect(saved).toContainText("Source verified on last opening");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await saved.getByRole("button", { name: "Open field workspace" }).click();
    let fieldWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(fieldWorkspace.getByRole("figure", { name: /Verified field plane for Velocity north/ })).toBeVisible();
    const fieldPlane = fieldWorkspace.getByRole("figure", { name: /Verified field plane for Velocity north/ });
    await fieldPlane.getByRole("combobox", { name: "Color range" }).selectOption("manual");
    await fieldPlane.getByLabel("Color minimum (m/s)").fill("-2");
    await fieldPlane.getByLabel("Color maximum (m/s)").fill("3");
    await fieldPlane.getByRole("button", { name: "Apply verified color range" }).click();
    await expect(fieldPlane.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, -2 to 3 m/s");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const savedSources = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "graph2d")
      .map((entry: { checkpoint: { source: { fieldReferences?: unknown[] } } }) => entry.checkpoint.source.fieldReferences));
    expect(savedSources).toContainEqual(expect.arrayContaining([expect.objectContaining({ datasetId: "field", component: "north" })]));
    const fieldDocuments = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "field"));
    expect(fieldDocuments).toHaveLength(1);
    expect(fieldDocuments[0].checkpoint.source.display.transfer).toEqual({ mode: "manual", min: -2, max: 3 });
    await page.reload();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-reopen").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Reopened and replay-verified");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const reopened = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields");
    await expect(reopened).toContainText("Not reverified on this opening");
    await reopened.getByRole("button", { name: "Open field workspace" }).click();
    await expect(reopened).toContainText("Source verified on last opening");
    fieldWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(fieldWorkspace).toContainText("Velocity (m/s)");
    await expect(fieldWorkspace.getByRole("figure", { name: /Verified field plane for Velocity north/ })).toBeVisible();
    await expect(fieldWorkspace.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, -2 to 3 m/s");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await projectPanel.getByTestId(`project-view-${fieldDocuments[0].expected.id}`).click();
    fieldWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(fieldWorkspace.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, -2 to 3 m/s");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldDocuments[0].expected.id);
    fieldWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(fieldWorkspace.getByLabel(/Color legend/)).toHaveAttribute("aria-label", "Color legend, -2 to 3 m/s");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
    const changed = await page.evaluate(() => (window as unknown as { scientificScenes: { openGraphDatasetReference:
      (request: { locator: { kind: "preset"; value: string }; sceneFingerprint: string }) => Promise<unknown> } })
      .scientificScenes.openGraphDatasetReference({
      locator: { kind: "preset", value: "vortexFlow" }, sceneFingerprint: "0".repeat(64) }));
    expect(changed).toMatchObject({ ok: false, status: "changed" });
    const missingPath = join(tmpdir(), `math3d-field-reference-missing-${Date.now()}.sscene`);
    const missing = await page.evaluate(path => (window as unknown as { scientificScenes: { openGraphDatasetReference:
      (request: { locator: { kind: "directory"; value: string }; sceneFingerprint: string }) => Promise<unknown> } })
      .scientificScenes.openGraphDatasetReference({ locator: { kind: "directory", value: path },
        sceneFingerprint: "0".repeat(64) }), missingPath);
    expect(missing).toMatchObject({ ok: false, status: "missing" });
  } finally { await closeSurfaceApp(app); }
});

test("SCI-06 saves an independent Laplacian document and reverifies its Project preview", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Sine–cosine grid" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importDialog.getByRole("button", { name: "View verified field" }).click();
    await importDialog.getByRole("button", { name: "Save field reference" }).click();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields")
      .getByRole("button", { name: "Open field workspace" }).click();
    let workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await workspace.getByLabel("Scalar calculation").selectOption("gradient-x");
    await workspace.getByRole("button", { name: "Preview and save derived field" }).click();
    workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(workspace.getByRole("figure", { name: /Verified field plane for Gradient x of scalar value/ }))
      .toBeVisible();
    await workspace.getByRole("button", { name: "Close" }).click();
    await page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields")
      .getByRole("button", { name: "Open field workspace" }).click();
    workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await workspace.getByLabel("Scalar calculation").selectOption("laplacian");
    await workspace.getByRole("button", { name: "Preview and save derived field" }).click();
    workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(workspace.getByRole("figure", { name: /Verified field plane for Laplacian scalar value/ }))
      .toBeVisible();
    await expect(workspace.getByTestId("scientific-derived-provenance"))
      .toContainText("verified source sample");
    await workspace.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    const fieldDocuments = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "field"));
    expect(fieldDocuments).toHaveLength(3);
    expect(fieldDocuments.some((entry: { checkpoint: { source: { derivation?: { operation: string } } } }) =>
      entry.checkpoint.source.derivation?.operation === "gradient-x")).toBe(true);
    const derived = fieldDocuments.find((entry: { checkpoint: { source: { derivation?: { operation: string } } } }) =>
      entry.checkpoint.source.derivation?.operation === "laplacian");
    expect(derived).toBeTruthy();
    expect(JSON.stringify(derived.checkpoint)).not.toContain('"values"');
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(derived.expected.id);
    workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(workspace.getByRole("figure", { name: /Verified field plane for Laplacian scalar value/ }))
      .toBeVisible();
    await expect(workspace).toContainText("Source verified; derived preview recomputed");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-13.4 previews saved scalar rows and columns from Project and rechecks before adding Graph lines", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-field-to-graph-"));
  const directory = join(root, "thermal.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/thermal-gradient.sscene"), directory, { recursive: true });
  const resource = join(directory, "temperature.f64");
  const original = await readFile(resource);
  const manifestBytes = await readFile(join(directory, "manifest.json"));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false,
      filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importDialog.getByRole("button", { name: "View verified field" }).click();
    await expect(importDialog.getByRole("figure", { name: /Verified field plane for Temperature scalar/ })).toBeVisible();
    await importDialog.getByRole("button", { name: "Save field reference" }).click();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const fieldId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.find((entry: { module: string }) => entry.module === "field")?.expected.id as string);
    expect(fieldId).toBeTruthy();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1") !== null)).toBe(true);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    const workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    const line = workspace.getByTestId("scientific-field-line");
    await expect(line).toContainText("Graph x: time (s); y: Temperature (K)");
    await line.getByLabel("Fixed distance").selectOption("1");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("distance = 2 m");
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("5 samples");
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(workspace.getByRole("alert")).toContainText("resource integrity failed");
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toHaveCount(0);
    await writeFile(resource, original);
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toBeVisible();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await line.getByLabel("Line direction").selectOption("1");
    await line.getByLabel("Fixed time").selectOption("2");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("7 samples");
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("time = 2 s");
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await workspace.getByRole("button", { name: "Close" }).click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const graphLines = await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((entry: { module: string }) => entry.module === "graph2d");
      const objects = [...graph.replay.payload.transactions].reverse()
        .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
          transaction.commands[0]?.command.payload.source?.objects)
        .find((value: unknown) => Array.isArray(value)) ?? graph.checkpoint.source.objects;
      return objects.filter((object: { kind: string }) => object.kind === "point-series");
    });
    expect(graphLines).toHaveLength(2);
    expect(graphLines.map((object: { origin: { slice: unknown } }) => object.origin.slice)).toMatchObject([
      { varyingAxis: 0, fixedIndex: 1, fixedCoordinate: 2, fixedName: "distance", fixedUnit: "m" },
      { varyingAxis: 1, fixedIndex: 2, fixedCoordinate: 2, fixedName: "time", fixedUnit: "s" }]);
    for (const object of graphLines) expect(object.origin).toMatchObject({
      sceneFingerprint: hash(manifestBytes), resourceSha256: hash(original),
      locator: { kind: "directory", value: directory }, xUnit: expect.any(String), yUnit: "K" });
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-field-to-graph-"))
      throw new Error("Unsafe scientific field fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-13.4 imports distinct verified 3D plane lines with complete source coordinates", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-volume-to-graph-"));
  const directory = join(root, "scalar-volume.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  manifest.datasets[0].semanticType = "scalar-field";
  manifest.datasets[0].quantity = { name: "Potential", unit: "V" };
  manifest.datasets[0].real = "north";
  delete manifest.datasets[0].components;
  manifest.resources = manifest.resources.filter((resource: { id: string }) => resource.id === "north");
  await rm(join(directory, "east.f64"));
  await rm(join(directory, "up.f64"));
  const manifestJson = JSON.stringify(manifest);
  await writeFile(join(directory, "manifest.json"), manifestJson);
  const bundle = JSON.parse(await readFile(join(directory, "bundle.json"), "utf8"));
  bundle.manifest.bytes = Buffer.byteLength(manifestJson);
  bundle.manifest.sha256 = hash(manifestJson);
  await writeFile(join(directory, "bundle.json"), JSON.stringify(bundle));
  const resource = join(directory, "north.f64"), original = await readFile(resource);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false,
      filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importDialog.getByRole("button", { name: "View verified plane" }).click();
    await expect(importDialog.getByRole("figure", { name: /Verified field plane for Potential scalar/ })).toBeVisible();
    await importDialog.getByRole("button", { name: "Save field reference" }).click();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    await expect(page.getByTestId("project-explorer-panel").getByTestId("project-message"))
      .toContainText("Saved");
    const fieldId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.find((entry: { module: string }) => entry.module === "field")?.expected.id as string);
    expect(fieldId).toBeTruthy();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    const workspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    const line = workspace.getByTestId("scientific-field-line");
    await expect(line).toContainText("Graph x: x (m); y: Potential (V)");
    await line.getByLabel("Line plane normal axis").selectOption("2");
    await line.getByLabel("Plane coordinate z").selectOption("4");
    await line.getByLabel("Fixed y").selectOption("3");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("21 samples");
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("z = -1.5 m");
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(workspace.getByRole("alert")).toContainText("resource integrity failed");
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toHaveCount(0);
    await writeFile(resource, original);
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toBeVisible();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await line.getByLabel("Plane coordinate z").selectOption("5");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await line.getByLabel("Fixed y").selectOption("4");
    await rm(resource);
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(workspace.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toHaveCount(0);
    await writeFile(resource, original);
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await expect(page.getByTestId("graphs-workspace")).toContainText("Graph objects (3)");
    await workspace.getByRole("button", { name: "Close" }).click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    await expect.poll(() => page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((entry: { module: string }) => entry.module === "graph2d");
      const objects = [...graph.replay.payload.transactions].reverse()
        .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
          transaction.commands[0]?.command.payload.source?.objects)
        .find((value: unknown) => Array.isArray(value)) ?? graph.checkpoint.source.objects;
      return objects.filter((object: { kind: string }) => object.kind === "point-series").length;
    })).toBe(3);
    const graphLines = await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((entry: { module: string }) => entry.module === "graph2d");
      const objects = [...graph.replay.payload.transactions].reverse()
        .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
          transaction.commands[0]?.command.payload.source?.objects)
        .find((value: unknown) => Array.isArray(value)) ?? graph.checkpoint.source.objects;
      return objects.filter((object: { kind: string }) => object.kind === "point-series");
    });
    expect(graphLines).toHaveLength(3);
    expect(graphLines.map((object: { origin: { slice: unknown } }) => object.origin.slice)).toMatchObject([
      { varyingAxis: 0, fixedAxis: 1, fixedIndex: 3, fixedCoordinate: -2.8,
        plane: { normalAxis: 2, fixedIndex: 4, fixedCoordinate: -1.5 } },
      { varyingAxis: 0, fixedAxis: 1, fixedIndex: 3,
        plane: { normalAxis: 2, fixedIndex: 5, fixedCoordinate: -1.125 } },
      { varyingAxis: 0, fixedAxis: 1, fixedIndex: 4, fixedCoordinate: -2.4,
        plane: { normalAxis: 2, fixedIndex: 5 } },
    ]);
    for (const object of graphLines) expect(object.origin).toMatchObject({
      sceneFingerprint: hash(manifestJson), resourceSha256: hash(original),
      locator: { kind: "directory", value: directory }, xName: "x", xUnit: "m", yUnit: "V" });
    await projectPanel.getByTestId("project-detail-tab-documents").click();
    await projectPanel.getByTestId(`project-view-${fieldId}`).click();
    let derivedWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await derivedWorkspace.getByLabel("Scalar calculation").selectOption("laplacian");
    await derivedWorkspace.getByRole("button", { name: "Preview and save derived field" }).click();
    derivedWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(derivedWorkspace.getByRole("figure", { name: /Verified volume for Laplacian Potential/ }))
      .toBeVisible();
    await expect(derivedWorkspace.getByTestId("scientific-derived-provenance"))
      .toContainText("bounded displayed sample lattice");
    const changedSource = Buffer.from(original); changedSource[0] ^= 1;
    await writeFile(resource, changedSource);
    await derivedWorkspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(derivedWorkspace.getByRole("alert")).toContainText("resource integrity failed");
    await expect(derivedWorkspace.getByRole("figure", { name: /Verified volume for Laplacian Potential/ }))
      .toHaveCount(0);
    await writeFile(resource, original);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-volume-to-graph-"))
      throw new Error("Unsafe scientific volume fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-13.3 reviews changed and missing sources, then relinks only a matching verified bundle", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-field-relink-"));
  const fixture = resolve("tests/fixtures/scientific-scene/vortex-flow.sscene");
  const original = join(root, "original.sscene");
  const altered = join(root, "altered.sscene");
  const matching = join(root, "matching.sscene");
  await cp(fixture, original, { recursive: true });
  await cp(fixture, altered, { recursive: true });
  await cp(fixture, matching, { recursive: true });
  const alteredManifest = JSON.parse(await readFile(join(altered, "manifest.json"), "utf8"));
  alteredManifest.coordinates[0].axes[0].unit = "cm";
  const alteredJson = JSON.stringify(alteredManifest);
  await writeFile(join(altered, "manifest.json"), alteredJson);
  const alteredBundle = JSON.parse(await readFile(join(altered, "bundle.json"), "utf8"));
  alteredBundle.manifest.bytes = Buffer.byteLength(alteredJson);
  alteredBundle.manifest.sha256 = hash(alteredJson);
  await writeFile(join(altered, "bundle.json"), JSON.stringify(alteredBundle));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, original);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importDialog.getByLabel("Dataset component").selectOption("field:north");
    await importDialog.getByRole("button", { name: "View verified field" }).click();
    await importDialog.getByRole("button", { name: "Save field reference" }).click();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
    const saved = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields");
    await expect(saved).toContainText("original.sscene");
    if (!original.startsWith(root + sep)) throw new Error("Unsafe field fixture cleanup path");
    await rm(original, { recursive: true, force: true });
    await saved.getByRole("button", { name: "Open field workspace" }).click();
    await expect(saved).toContainText("Missing source — values unavailable");
    const unavailable = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(unavailable.getByRole("figure", { name: /Verified field plane/ })).toHaveCount(0);
    await unavailable.getByRole("button", { name: "Close" }).click();

    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, altered);
    await saved.getByRole("button", { name: "Find replacement" }).click();
    const review = page.getByRole("dialog", { name: "Review replacement scientific field" });
    await expect(review).toContainText("original.sscene");
    await expect(review).toContainText("altered.sscene");
    await expect(review.locator('tr[data-required="yes"][data-match="no"]')).toContainText("Axes");
    await expect(review.getByRole("button", { name: "Accept verified relink" })).toBeDisabled();
    await review.getByLabel("Replacement component").selectOption("field:east");
    await expect(review.locator('tr[data-required="yes"][data-match="no"]').filter({ hasText: "Component" })).toHaveCount(1);
    await review.getByRole("button", { name: "Cancel" }).click();
    await expect(saved).toContainText("original.sscene");

    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, matching);
    await saved.getByRole("button", { name: "Find replacement" }).click();
    await expect(review).toContainText("matching.sscene");
    await expect(review.locator('tr[data-required="yes"][data-match="no"]')).toHaveCount(0);
    const matchingManifest = await readFile(join(matching, "manifest.json"));
    const matchingBundle = await readFile(join(matching, "bundle.json"));
    const intervening = { ...JSON.parse(matchingManifest.toString("utf8")), title: "Changed after relink review" };
    const interveningJson = JSON.stringify(intervening);
    await writeFile(join(matching, "manifest.json"), interveningJson);
    const interveningBundle = JSON.parse(matchingBundle.toString("utf8"));
    interveningBundle.manifest.bytes = Buffer.byteLength(interveningJson);
    interveningBundle.manifest.sha256 = hash(interveningJson);
    await writeFile(join(matching, "bundle.json"), JSON.stringify(interveningBundle));
    await review.getByRole("button", { name: "Accept verified relink" }).click();
    await expect(review.getByRole("alert")).toContainText("Replacement changed");
    await expect(saved).toContainText("original.sscene");
    await writeFile(join(matching, "manifest.json"), matchingManifest);
    await writeFile(join(matching, "bundle.json"), matchingBundle);
    await review.getByRole("button", { name: "Accept verified relink" }).click();
    await expect(review).toBeHidden();
    await expect(saved).toContainText("matching.sscene");
    await saved.getByRole("button", { name: "Open field workspace" }).click();
    const fieldWorkspace = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(fieldWorkspace.getByRole("figure", { name: /Verified field plane for Velocity north/ })).toBeVisible();
    const northBytes = Buffer.from(await readFile(join(matching, "north.f64")));
    const changedNorth = Buffer.from(northBytes);
    changedNorth[0] ^= 1;
    await writeFile(join(matching, "north.f64"), changedNorth);
    await fieldWorkspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(fieldWorkspace.getByRole("figure", { name: /Verified field plane/ })).toHaveCount(0);
    await expect(fieldWorkspace.getByRole("alert")).toContainText("resource integrity failed");
    await fieldWorkspace.getByRole("button", { name: "Close" }).click();
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-field-relink-"))
      throw new Error("Unsafe field fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-13.3 relinks both saved vector components only after matching and fresh verification", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-relink-"));
  const fixture = resolve("tests/fixtures/scientific-scene/vortex-flow.sscene");
  const original = join(root, "original.sscene");
  const changed = join(root, "changed.sscene");
  const matching = join(root, "matching.sscene");
  await cp(fixture, original, { recursive: true });
  await cp(fixture, changed, { recursive: true });
  await cp(fixture, matching, { recursive: true });
  const alteredNorth = Buffer.from(await readFile(join(changed, "north.f64")));
  alteredNorth[0] ^= 1;
  await writeFile(join(changed, "north.f64"), alteredNorth);
  const changedManifest = JSON.parse(await readFile(join(changed, "manifest.json"), "utf8"));
  changedManifest.resources.find((part: { id: string }) => part.id === "north").sha256 = hash(alteredNorth);
  const changedJson = JSON.stringify(changedManifest);
  await writeFile(join(changed, "manifest.json"), changedJson);
  const changedBundle = JSON.parse(await readFile(join(changed, "bundle.json"), "utf8"));
  changedBundle.manifest.bytes = Buffer.byteLength(changedJson);
  changedBundle.manifest.sha256 = hash(changedJson);
  await writeFile(join(changed, "bundle.json"), JSON.stringify(changedBundle));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, original);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importDialog.getByRole("button", { name: "View verified vector field" }).click();
    await importDialog.getByRole("button", { name: "Save 2D vector field reference" }).click();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
    const saved = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-vector-field");
    await expect(saved).toContainText("original.sscene");
    if (!original.startsWith(root + sep)) throw new Error("Unsafe vector fixture cleanup path");
    await rm(original, { recursive: true, force: true });
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    await expect(saved).toContainText("Missing source — arrows unavailable");

    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, changed);
    await saved.getByRole("button", { name: "Find vector replacement" }).click();
    const review = page.getByRole("dialog", { name: "Review replacement 2D vector field" });
    await expect(review).toContainText("changed.sscene");
    await expect(review.locator('tr[data-required="yes"][data-match="no"]')).toContainText("Component 2 resource SHA-256");
    await expect(review.getByRole("button", { name: "Accept verified vector relink" })).toBeDisabled();
    await review.getByRole("button", { name: "Cancel" }).click();
    await expect(saved).toContainText("original.sscene");

    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, matching);
    await saved.getByRole("button", { name: "Find vector replacement" }).click();
    await expect(review).toContainText("matching.sscene");
    await expect(review.locator('tr[data-required="yes"][data-match="no"]')).toHaveCount(0);
    const east = await readFile(join(matching, "east.f64"));
    await rm(join(matching, "east.f64"));
    await review.getByRole("button", { name: "Accept verified vector relink" }).click();
    await expect(review.getByRole("alert")).toContainText("Replacement missing");
    await expect(saved).toContainText("original.sscene");
    await writeFile(join(matching, "east.f64"), east);
    const north = await readFile(join(matching, "north.f64"));
    const changedAfterReview = Buffer.from(north);
    changedAfterReview[0] ^= 1;
    await writeFile(join(matching, "north.f64"), changedAfterReview);
    await review.getByRole("button", { name: "Accept verified vector relink" }).click();
    await expect(review.getByRole("alert")).toContainText("Replacement changed");
    await expect(saved).toContainText("original.sscene");
    await writeFile(join(matching, "north.f64"), north);
    await review.getByRole("button", { name: "Accept verified vector relink" }).click();
    await expect(review).toBeHidden();
    await expect(saved).toContainText("matching.sscene");
    await saved.getByRole("button", { name: "Reverify and view vector field" }).click();
    await expect(importDialog.getByRole("figure", { name: "Verified 2D vector field for Velocity" })).toBeVisible();
    await importDialog.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector-relink-"))
      throw new Error("Unsafe vector fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
