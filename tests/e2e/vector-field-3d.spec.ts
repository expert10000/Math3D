import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow } from "./helpers/surfaceAppHarness";

test("SCI-02 opens a docked field explorer with bounded narrow-window layout", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const controls = explorer.getByLabel("Field controls");
    const viewer = explorer.getByLabel("3D field viewer");
    const inspector = explorer.getByLabel("Field status and actions");
    await expect(explorer).toBeVisible();
    await expect(viewer.getByRole("figure", { name: "3D vector arrow renderer" }))
      .toContainText("125 of 125 bounded samples");
    await expect(page.getByTestId("main-viewer")).toBeHidden();
    const [left, middle, right] = await Promise.all([
      controls.boundingBox(), viewer.boundingBox(), inspector.boundingBox()]);
    expect(left && middle && right).toBeTruthy();
    expect(middle!.x).toBeGreaterThan(left!.x + left!.width - 2);
    expect(middle!.width).toBeGreaterThan(400);
    expect(right!.x).toBeGreaterThan(middle!.x + middle!.width - 2);
    await page.setViewportSize({ width: 760, height: 700 });
    await expect(explorer).toBeVisible();
    const narrow = await explorer.evaluate(element => ({ width: element.clientWidth,
      scroll: element.scrollWidth }));
    expect(narrow.scroll).toBeLessThanOrEqual(narrow.width + 2);
    await explorer.getByLabel("Seed x").fill("1");
    await explorer.getByRole("button", { name: "Add seed" }).click();
    await expect(explorer).toContainText("seed-1: (1");
    await page.getByTestId("workspace-nav-surfaces").click();
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(page.getByRole("region", { name: "Scientific Field Explorer" }))
      .toContainText("seed-1: (1");
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await expect(page.getByTestId("main-viewer")).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

test("field preview errors stay visible in the viewer", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "XZ slice" }).click();
    await expect(editor.getByLabel("3D field viewer")).toContainText("preview this slice");
    await editor.getByLabel("P(x,y,z)").fill("sin(");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toBeVisible();
    await editor.getByLabel("P(x,y,z)").fill("-y");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: /field slice/ })).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

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
    await importer.getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor).toContainText("east");
    await expect(editor).toContainText("north");
    await expect(editor).toContainText("up");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("125 of 125 bounded samples");
    for (const [name, coordinate, samples] of [
      ["XY slice", "-1.5", "21 × 21"], ["XZ slice", "-2", "21 × 17"],
      ["YZ slice", "-2", "21 × 17"],
    ] as const) {
      await editor.getByRole("button", { name }).click();
      await editor.getByLabel("Slice physical coordinate").selectOption(coordinate);
      await editor.getByRole("button", { name: "Preview slice" }).click();
      await expect(editor.getByRole("figure", { name: /field slice/ })).toContainText(samples);
      await expect(editor.getByRole("figure", { name: /field slice/ })).toContainText("m/s");
      await expect(editor.getByRole("img", { name: /Color legend/ })).toBeVisible();
    }
    await editor.getByLabel("Slice displayed field").selectOption("curl-magnitude");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: /field slice/ }))
      .toContainText("Approximate · bounded-finite-difference");
    await editor.getByLabel("Slice displayed field").selectOption("component");
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("Domain box:");

    await editor.getByLabel("Seed x").fill("2");
    await editor.getByRole("button", { name: "Add seed" }).click();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("Trajectory overlay: 1 seed");
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

    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const projectId = project.identity.id as string;
    const fieldId = project.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d")?.expected.id as string;
    expect(fieldId).toBeTruthy();
    await panel.getByTestId(`project-open-saved-${projectId}`).click();
    await expect(panel.getByTestId("project-viewer-document")).toBeVisible();
    await panel.getByTestId("project-viewer-document").selectOption(fieldId);
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor).toContainText("seed-1: (2");
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
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toHaveCount(0);

    await rm(resource);
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector3d-"))
      throw new Error("Unsafe vector-field fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-07 links one verified physical probe across slices, 3D and a Graph line", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-linked-probe-"));
  const directory = join(root, "flow.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  const sourceValues = await Promise.all(["east", "north", "up"].map(async component =>
    readFile(join(directory, `${component}.f64`))));
  const pointValues = sourceValues.map(bytes => bytes.readDoubleLE(((10 * 21 + 5) * 17 + 4) * 8));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByLabel("Slice physical coordinate").selectOption("-1.5");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await editor.getByRole("figure", { name: "XY field slice" })
      .locator('[data-probe-cell="10-5"]').click();
    const profile = editor.getByRole("figure", { name: "XY field slice" })
      .getByRole("region", { name: "Line profile through probe" });
    await editor.getByRole("button", { name: "Show line profile through point" }).click();
    await expect(profile).toBeVisible();
    await expect(profile).toContainText("magnitude along x");
    await profile.getByLabel("Line profile direction").selectOption("1");
    await expect(profile).toContainText("magnitude along y");
    const values = editor.getByTestId("vector-field3d-probe-values");
    await expect(values).toContainText("x = 0 m · y = -2 m · z = -1.5 m");
    await expect(values).toContainText(`east = ${pointValues[0]!.toPrecision(5)} m/s`);
    await expect(values).toContainText(`north = ${pointValues[1]!.toPrecision(5)} m/s`);
    await expect(values).toContainText(`up = ${pointValues[2]!.toPrecision(5)} m/s`);
    await expect(values).toContainText(/Source sha256:[a-f0-9]{64}; view sha256:[a-f0-9]{64}/);
    await editor.getByRole("button", { name: "Analyze divergence & curl" }).click();
    const differential = editor.getByTestId("vector-field3d-differential");
    await expect(differential).toContainText("Approximate · bounded-finite-difference");
    await expect(differential).toContainText(/Divergence .* 1\/s/);
    await expect(differential).toContainText(/Curl .* 1\/s/);
    await expect(differential).toContainText(/source sha256:[a-f0-9]{64}/);
    await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toBeVisible();
    for (const name of ["XZ", "YZ"] as const) {
      await editor.getByRole("button", { name: `${name} slice` }).click();
      await editor.getByRole("button", { name: "Preview slice" }).click();
      await expect(editor.getByRole("figure", { name: `${name} field slice` })).toBeVisible();
      await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toBeVisible();
      await expect(values).toContainText("x = 0 m · y = -2 m · z = -1.5 m");
    }
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-3d-probe")).toBeVisible();
    const line = editor.getByTestId("vector-field3d-graph-line");
    await line.getByRole("button", { name: "Preview line through probe" }).click();
    const preview = line.getByRole("figure", { name: /Preview Graph vector line/ });
    await expect(preview).toContainText("plane z = -1.5 m; fixed y = -2 m");
    await expect(preview).toContainText(/Source revision [a-f0-9]{64}/);
    await editor.getByLabel("Probe y").selectOption("-4");
    await expect(preview).toHaveCount(0);
    await expect(line.getByRole("button", { name: "Add line to Graphs" })).toBeDisabled();
    await editor.getByLabel("Probe y").selectOption("-2");
    await line.getByRole("button", { name: "Preview line through probe" }).click();
    await expect(preview).toContainText("fixed y = -2 m");
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Open saved document" }).click();
    await expect(editor.getByLabel("Probe x")).toHaveValue("0");
    await expect(editor.getByLabel("Probe y")).toHaveValue("-2");
    await expect(editor.getByLabel("Probe z")).toHaveValue("-1.5");
    await expect(values).toHaveCount(0);
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(values).toContainText(`east = ${pointValues[0]!.toPrecision(5)} m/s`);
    await editor.getByRole("button", { name: "Quad views" }).click();
    await editor.getByRole("button", { name: "Preview all views" }).first().click();
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toBeVisible();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toBeVisible();
    const resource = join(directory, "north.f64"), original = await readFile(resource);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    await editor.getByRole("button", { name: "Analyze divergence & curl" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(differential).toHaveCount(0);
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(values).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await rm(resource);
    await editor.getByRole("button", { name: "Analyze divergence & curl" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(editor.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await expect(values).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-linked-probe-"))
      throw new Error("Unsafe linked-probe fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-06 analyzes an authored vortex and reports its boundary stencil", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await editor.getByRole("button", { name: "Analyze divergence & curl" }).click();
    const differential = editor.getByTestId("vector-field3d-differential");
    await expect(differential).toContainText("Divergence 0.00000 1/s");
    await expect(differential).toContainText("Curl (0.00000, 0.00000, 2.00000) 1/s");
    await editor.getByLabel("Probe x").fill("4");
    await expect(differential).toHaveCount(0);
    await editor.getByRole("button", { name: "Analyze divergence & curl" }).click();
    await expect(differential).toContainText("x one-sided-three-point");
    await expect(differential).toContainText(/boundary; accuracy is reduced/);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-05 RK45 and SCI-06 derived slices persist their controls", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByLabel("Trajectory solver method").selectOption("rk45");
    await editor.getByLabel("Seed x").fill("1");
    await editor.getByRole("button", { name: "Add seed" }).click();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText("adaptive-rk45");
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText("Largest estimated local error");
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByLabel("Slice displayed field").selectOption("divergence");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("boundary stencils have reduced accuracy");
    await editor.getByLabel("Slice displayed field").selectOption("curl-magnitude");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("curl-magnitude");
    await editor.getByLabel("Slice displayed field").selectOption("curl-z");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("curl-z");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Open saved document" }).click();
    await expect(editor.getByLabel("Trajectory solver method")).toHaveValue("rk45");
    await expect(editor.getByLabel("Slice displayed field")).toHaveValue("curl-z");
  } finally { await closeSurfaceApp(app); }
});

test("SCI-04/07 clip and camera settings persist while split and quad views share one probe", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    const originalValue = await editor.getByTestId("vector-field3d-probe-values").innerText();
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-clip-status"))
      .toContainText("125 of 125 accepted sample positions visible");
    await editor.getByLabel("Clip x min").fill("-2");
    await expect(editor.getByTestId("vector-field3d-clip-status"))
      .toContainText("100 of 125 accepted sample positions visible");
    expect(await editor.getByTestId("vector-field3d-probe-values").innerText()).toBe(originalValue);
    await editor.getByLabel("Clip x max").fill("7");
    await expect(editor.getByRole("alert")).toContainText(/clip bounds/i);
    await expect(editor.getByLabel("Clip x max")).toHaveValue("4");
    await editor.getByLabel("3D camera preset").selectOption("xy");
    await expect(editor.getByTestId("vector-field3d-clip-status")).toContainText("Camera preset xy");
    await expect(editor.getByTestId("vector-field3d-camera-status")).toContainText("Preset xy.");
    await editor.getByRole("group", { name: "3D camera viewport" }).focus();
    await editor.getByRole("group", { name: "3D camera viewport" }).press("ArrowRight");
    await editor.getByRole("group", { name: "3D camera viewport" }).press("Home");
    await expect(editor.getByTestId("vector-field3d-camera-status")).toContainText("distance 4.00");
    await editor.getByRole("button", { name: "Split views" }).click();
    await editor.getByRole("button", { name: "Preview all views" }).first().click();
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toBeVisible();
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toBeVisible();
    await editor.getByRole("button", { name: "Quad views" }).click();
    await editor.getByRole("button", { name: "Preview all views" }).first().click();
    for (const name of ["XY", "XZ", "YZ"] as const)
      await expect(editor.getByRole("figure", { name: `${name} field slice` })).toBeVisible();
    await editor.getByRole("figure", { name: "XY field slice" })
      .locator('[data-probe-cell="15-10"]').click();
    await expect(editor.getByRole("figure", { name: "XY field slice" })
      .getByRole("region", { name: "Line profile through probe" }))
      .toContainText("magnitude along x");
    await expect(editor.getByTestId("vector-field3d-probe-values"))
      .toContainText("x = 1 m · y = -0.6666666666666665 m · z = 0 m");
    await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toHaveCount(3);
    await expect(editor.getByTestId("vector-field3d-3d-probe")).toContainText("x = 1 m");
    await editor.getByLabel("Link slice planes to probe").uncheck();
    await editor.getByRole("button", { name: "Zoom xy in" }).click();
    await editor.getByRole("button", { name: "Zoom xz in" }).click();
    await editor.getByRole("button", { name: "Zoom xz in" }).click();
    await editor.getByRole("button", { name: "Pan xz right" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" })
      .getByRole("status").first()).toContainText("1.5×");
    await editor.getByRole("figure", { name: "XY field slice" })
      .locator('[data-probe-cell="18-12"]').click();
    await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toHaveCount(1);
    await expect(editor.getByRole("figure", { name: "XZ field slice" }))
      .toContainText(/y = -0.6666666666666665 m/);
    await editor.getByRole("button", { name: "Orbit right" }).click();
    await testInfo.attach("scientific-field-explorer-quad.png", {
      body: await editor.screenshot(), contentType: "image/png" });
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry.checkpoint.workspace).toMatchObject({ layout: "quad", cameraPreset: "xy",
      clipBounds: [[-2, 4], [-4, 4], [-4, 4]], viewsLinked: false,
      viewZoom: { xy: 1.5, xz: 2.25, yz: 1 } });
    expect(entry.checkpoint.workspace.viewCenter.xy).toEqual([0.5, 0.5]);
    expect(entry.checkpoint.workspace.viewCenter.xz[0]).toBeCloseTo(0.5666666667, 8);
    expect(entry.checkpoint.workspace.cameraState.position).not.toEqual([0, 0, 4]);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor).toHaveAttribute("data-layout", "quad");
    await expect(editor.getByLabel("Clip x min")).toHaveValue("-2");
    await expect(editor.getByLabel("3D camera preset")).toHaveValue("xy");
    await expect(editor.getByLabel("Link slice planes to probe")).not.toBeChecked();
    await expect(editor.getByTestId("vector-field3d-probe-values")).toHaveCount(0);
    await editor.getByRole("button", { name: "Preview all views" }).first().click();
    await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toHaveCount(1);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-07 sends an authored field line profile to Graphs with fixed-coordinate provenance", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    const profile = editor.getByRole("region", { name: "Line profile through probe" });
    await expect(profile).toContainText("magnitude along x");
    await profile.getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("Sent 129 finite analytic line samples");
    await profile.getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await expect(editor.getByRole("alert")).toContainText("already in Graphs");
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const project = page.getByTestId("project-explorer-panel");
    await project.getByTestId("project-save").click();
    await expect(project.getByTestId("project-message")).toContainText("Saved");
    const origin = await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((entry: { module: string }) => entry.module === "graph2d");
      const objects = [...(graph.replay?.payload?.transactions ?? [])].reverse()
        .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
          transaction.commands[0]?.command.payload.source?.objects)
        .find((value: unknown) => Array.isArray(value)) ?? graph.checkpoint.source.objects;
      return objects.find((item: { analyticOrigin?: unknown }) => item.analyticOrigin)?.analyticOrigin;
    });
    expect(origin).toMatchObject({ kind: "vector-field3d-expression-line", component: "speed",
      varyingAxis: 0, fixedCoordinates: [null, 0, 0], expressions: ["-y", "x", "0"],
      xName: "x", xUnit: "m", yUnit: "m/s" });
  } finally { await closeSurfaceApp(app); }
});

test("GRA-13.5 imports distinct verified 3D vector plane lines from a saved Project field", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-lines-"));
  const directory = join(root, "flow.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  const sourceValues: Record<string, Buffer> = Object.fromEntries(await Promise.all(
    ["east", "north", "up"].map(async component => [component,
      await readFile(join(directory, `${component}.f64`))])));
  const sample = (component: string, i: number, j: number, k: number) =>
    sourceValues[component]!.readDoubleLE(((i * 21 + j) * 17 + k) * 8);
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
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const fieldId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.find((entry: { module: string }) => entry.module === "vector3d")?.expected.id as string);
    expect(fieldId).toBeTruthy();
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    await projectPanel.getByTestId(`project-open-saved-${projectId}`).click();
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    const line = editor.getByTestId("vector-field3d-graph-line");
    await expect(line).toContainText("Graph x: x (m); y: east (m/s)");
    await line.getByLabel("Plane coordinate z").selectOption("4");
    await line.getByLabel("Fixed y").selectOption("3");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ })).toContainText("21 samples");
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`first (-4, ${sample("east", 0, 3, 4)})`);
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`last (4, ${sample("east", 20, 3, 4)})`);
    const other = join(directory, "up.f64"), originalOther = await readFile(other);
    const changed = Buffer.from(originalOther); changed[0] ^= 1;
    await writeFile(other, changed);
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line.getByRole("alert")).toContainText("up");
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ })).toHaveCount(0);
    await writeFile(other, originalOther);
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("button", { name: "Add line to Graphs" })).toBeEnabled();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await line.getByLabel("Graph component").selectOption("north");
    await line.getByLabel("Line plane normal axis").selectOption("0");
    await line.getByLabel("Plane coordinate x").selectOption("3");
    await line.getByLabel("Fixed z").selectOption("5");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`first (-4, ${sample("north", 3, 0, 5)})`);
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`last (4, ${sample("north", 3, 20, 5)})`);
    await expect(line.getByRole("button", { name: "Add line to Graphs" })).toBeEnabled();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await line.getByLabel("Graph component").selectOption("up");
    await line.getByLabel("Line plane normal axis").selectOption("1");
    await line.getByLabel("Plane coordinate y").selectOption("3");
    await line.getByLabel("Line direction").selectOption("2");
    await line.getByLabel("Fixed x").selectOption("5");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`first (-3, ${sample("up", 5, 3, 0)})`);
    await expect(line.getByRole("figure", { name: /Preview Graph vector line/ }))
      .toContainText(`last (3, ${sample("up", 5, 3, 16)})`);
    await expect(line.getByRole("button", { name: "Add line to Graphs" })).toBeEnabled();
    await rm(join(directory, "east.f64"));
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
    await writeFile(join(directory, "east.f64"), await readFile(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene/east.f64")));
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("button", { name: "Add line to Graphs" })).toBeEnabled();
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await editor.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Enter");
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
    expect(graphLines).toHaveLength(3);
    expect(graphLines.map((object: { origin: { component: string; slice: unknown } }) =>
      ({ component: object.origin.component, slice: object.origin.slice }))).toMatchObject([
      { component: "east", slice: { varyingAxis: 0, fixedAxis: 1, fixedIndex: 3,
        plane: { normalAxis: 2, fixedIndex: 4 } } },
      { component: "north", slice: { varyingAxis: 1, fixedAxis: 2, fixedIndex: 5,
        plane: { normalAxis: 0, fixedIndex: 3 } } },
      { component: "up", slice: { varyingAxis: 2, fixedAxis: 0, fixedIndex: 5,
        plane: { normalAxis: 1, fixedIndex: 3 } } },
    ]);
    for (const object of graphLines) expect(object.origin).toMatchObject({
      locator: { kind: "directory", value: directory }, sceneFingerprint: expect.any(String),
      resourceSha256: expect.any(String), xUnit: "m", yUnit: "m/s" });
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector-lines-"))
      throw new Error("Unsafe vector-line fixture cleanup path");
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
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
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

test("GRA-14 trajectory editor reports stationary, boundary, undefined and step-limit results", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Add seed" }).click();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("stationary");
    await editor.getByLabel("P(x,y,z)").fill("1");
    await editor.getByLabel("Q(x,y,z)").fill("0");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("boundary");
    await editor.getByLabel("P(x,y,z)").fill("1/x");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("undefined");
    await editor.getByLabel("P(x,y,z)").fill("1");
    await editor.getByLabel("Trajectory max steps").fill("1");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("step-limit");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("Trajectory overlay: 1 seed");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-14 Project save and reopen retains 3D seeds and solver policy without stale results", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByLabel("Seed x").fill("2");
    await editor.getByRole("button", { name: "Add seed" }).click();
    await editor.getByLabel("Trajectory max steps").fill("57");
    await editor.getByLabel("Absolute tolerance").fill("0.00001");
    await editor.getByRole("button", { name: "XZ slice" }).click();
    await editor.getByLabel("Slice physical coordinate").fill("-2");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XZ field slice" })).toContainText("25 × 25 bounded samples");
    await editor.getByLabel("P(x,y,z)").fill("-y+1");
    await expect(editor.getByRole("figure", { name: "XZ field slice" })).toHaveCount(0);
    await editor.getByLabel("P(x,y,z)").fill("-y");
    await editor.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await expect(editor.getByTestId("vector-field3d-probe-values"))
      .toContainText("x = 0 m · y = -2 m · z = 0 m");
    await editor.getByRole("button", { name: "Focus viewer" }).click();
    await expect(editor).toHaveAttribute("data-layout", "viewer-focus");
    await editor.getByRole("button", { name: "Show three panes" }).click();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
    await editor.getByRole("button", { name: "XZ slice" }).click();
    await editor.getByRole("button", { name: "Focus viewer" }).click();
    await editor.getByRole("button", { name: "Save document" }).click();
    await expect(editor.getByTestId("vector-field3d-save-status")).toContainText("Project workspace");
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toEqual([{ id: "seed-1", position: [2, 0, 0] }]);
    expect(entry?.checkpoint.source.solver).toMatchObject({ maxSteps: 57, absoluteTolerance: 0.00001 });
    expect(entry?.checkpoint.workspace).toMatchObject({ selectedLayer: "xz", layout: "viewer-focus",
      sliceCoordinates: [0, -2, 0], probe: [0, -2, 0] });
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor).toContainText("seed-1: (2, 0, 0)");
    await expect(editor.getByLabel("Trajectory max steps")).toHaveValue("57");
    await expect(editor.getByLabel("Absolute tolerance")).toHaveValue("0.00001");
    await expect(editor).toHaveAttribute("data-layout", "viewer-focus");
    await expect(editor).toContainText("Selected layer: XZ slice");
    await expect(editor.getByLabel("Slice physical coordinate")).toHaveValue("-2");
    await expect(editor.getByLabel("Probe y")).toHaveValue("-2");
    await expect(editor.getByTestId("vector-field3d-probe-values")).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "XZ field slice" })).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
    await expect(editor.getByTestId("vector-field3d-probe-values"))
      .toContainText("x = 0 m · y = -2 m · z = 0 m");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-14 trajectory Cancel terminates a pending worker and publishes no partial result", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByLabel("Trajectory solver method").selectOption("rk45");
    await editor.getByLabel("Seed x").fill("2");
    await editor.getByRole("button", { name: "Add seed" }).click();
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message) {
        window.setTimeout(() => original.call(this, message), 1200);
      };
    });
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status")).toContainText("Integrating trajectories");
    await editor.getByRole("button", { name: "Cancel run" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status")).toContainText("cancelled; no partial result");
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await expect(editor.getByRole("button", { name: "Run trajectories" })).toBeEnabled();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-14 512-glyph renderer remains responsive, resizes, and exposes keyboard camera controls", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await resizeSurfaceAppWindow(app, 1440, 900);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    for (const axis of ["x", "y", "z"]) await editor.getByLabel(`Density ${axis}`).fill("8");
    const renderTimes: number[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const started = Date.now();
      await editor.getByRole("button", { name: "Verify & render arrows" }).click();
      await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("512 of 512 bounded samples");
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      renderTimes.push(Date.now() - started);
    }
    const medianMilliseconds = [...renderTimes].sort((a, b) => a - b)[1]!;
    const graphics = await editor.locator("canvas").first().evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const debug = gl?.getExtension("WEBGL_debug_renderer_info");
      return { renderer: gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable",
        vendor: gl && debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : "unavailable" };
    });
    console.log(`GRA-14 512-glyph first stable frame: median ${medianMilliseconds} ms; runs ${renderTimes.join(", ")} ms; GPU ${graphics.renderer}`);
    await testInfo.attach("vector-field3d-512-performance.json", { body: JSON.stringify({ glyphs: 512,
      renderTimes, medianMilliseconds, viewport: [1440, 900], graphics }), contentType: "application/json" });
    expect(Math.max(...renderTimes)).toBeLessThan(5000);
    await expect(editor.getByTestId("vector-field3d-render-status"))
      .toContainText("Rendered 512 of 512 3D samples");
    await expect(editor.getByTestId("vector-field3d-render-status")).toContainText("vector units m/s, m/s, m/s");
    await expect(editor.getByTestId("vector-field3d-render-status")).toHaveAttribute("role", "status");
    const accessible = await editor.ariaSnapshot();
    expect(accessible).toContain("Scientific Field Explorer");
    expect(accessible).toContain("Verify & render arrows");
    expect(accessible).toContain("Camera ready. Use arrow keys to orbit");
    const viewport = editor.getByRole("group", { name: "3D camera viewport" });
    const before = await viewport.boundingBox();
    if (!before) throw new Error("3D camera viewport did not mount");
    await resizeSurfaceAppWindow(app, 760, 700);
    const after = await viewport.boundingBox();
    if (!after) throw new Error("3D camera viewport did not survive resize");
    expect(after.width).toBeGreaterThan(300);
    const explorerWidth = await editor.evaluate(element => element.clientWidth);
    expect(after.width).toBeLessThanOrEqual(explorerWidth + 2);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("512 of 512 bounded samples");
    await testInfo.attach("vector-field3d-760px.png", { body: await editor.screenshot(), contentType: "image/png" });
    await viewport.focus();
    await viewport.press("ArrowRight");
    await expect(editor.getByTestId("vector-field3d-camera-status")).toContainText("Camera azimuth");
    const rotated = await editor.getByTestId("vector-field3d-camera-status").innerText();
    await editor.getByRole("button", { name: "Orbit left" }).click();
    await expect(editor.getByTestId("vector-field3d-camera-status")).not.toHaveText(rotated);
    await viewport.focus(); await viewport.press("+");
    await expect(editor.getByTestId("vector-field3d-camera-status")).toContainText("distance");
    await viewport.press("Home");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toContainText("512 of 512 bounded samples");
    await viewport.press("Escape");
    await expect(editor).toBeHidden();
    await expect(page.locator(".graph2d-toolbar-menu > summary")).toBeFocused();
  } finally { await closeSurfaceApp(app); }
});
