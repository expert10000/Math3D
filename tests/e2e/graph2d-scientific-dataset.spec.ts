import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
    await dialog.getByRole("button", { name: "View verified volume" }).click();
    await expect(dialog.getByRole("figure", { name: /Verified volume for Wind north/ }))
      .toContainText("2 × 3 × 4 displayed samples");
    await expect(dialog.locator(".graph2d-scientific-volume canvas")).toHaveCount(1);
    const changed = Buffer.from(parts[1]!.bytes);
    changed[0] ^= 1;
    await writeFile(join(directory, "north.f64"), changed);
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
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const savedSources = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!)
      .entries.filter((entry: { module: string }) => entry.module === "graph2d")
      .map((entry: { checkpoint: { source: { fieldReferences?: unknown[] } } }) => entry.checkpoint.source.fieldReferences));
    expect(savedSources).toContainEqual(expect.arrayContaining([expect.objectContaining({ datasetId: "field", component: "north" })]));
    await page.reload();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-reopen").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Reopened and replay-verified");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const reopened = page.getByLabel("Graph inspector").getByTestId("graph2d-saved-fields");
    await expect(reopened).toContainText("Not reverified on this opening");
    await reopened.getByRole("button", { name: "Reverify and view" }).click();
    await expect(reopened).toContainText("Source verified on last opening");
    await expect(page.getByRole("dialog", { name: "Import verified scientific dataset" }).getByLabel("Dataset component"))
      .toHaveValue("field:north");
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
    await saved.getByRole("button", { name: "Reverify and view" }).click();
    await expect(saved).toContainText("Missing source — values unavailable");

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
    await saved.getByRole("button", { name: "Reverify and view" }).click();
    await expect(importDialog.getByLabel("Dataset component")).toHaveValue("field:north");
    await importDialog.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-field-relink-"))
      throw new Error("Unsafe field fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
