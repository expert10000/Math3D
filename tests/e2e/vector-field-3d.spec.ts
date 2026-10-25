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
      sliceCoordinates: [0, -2, 0] });
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor).toContainText("seed-1: (2, 0, 0)");
    await expect(editor.getByLabel("Trajectory max steps")).toHaveValue("57");
    await expect(editor.getByLabel("Absolute tolerance")).toHaveValue("0.00001");
    await expect(editor).toHaveAttribute("data-layout", "viewer-focus");
    await expect(editor).toContainText("Selected layer: XZ slice");
    await expect(editor.getByLabel("Slice physical coordinate")).toHaveValue("-2");
    await expect(editor.getByRole("figure", { name: "XZ field slice" })).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
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
