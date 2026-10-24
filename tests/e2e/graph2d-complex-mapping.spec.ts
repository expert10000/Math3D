import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { editGraph, graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";
const core = require(resolve("packages/core/src/index.ts"));

test("GRA-17 desktop reviews and downloads a source-linked Complex contour", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Parametric");
    const editor = graphEditor(page);
    await editor.getByLabel("Parametric name").fill("Complex circle");
    await editor.getByLabel("Parametric x expression").fill("cos(t)");
    await editor.getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await panel.getByLabel("Complex contour samples").fill("129");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("129 points · closed contour");
    await expect(panel.getByRole("img", { name: "Complex contour preview" })).toBeVisible();
    const path = resolve("output/graph2d-complex-mapping-e2e.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), path);
    await panel.getByRole("button", { name: "Download Complex Analysis document" }).click();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
    }).toMatchObject({ format: "math3d.complex-analysis-document", provenance: { origin: "graph2d-promotion" } });
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 desktop pairs two independent Graph functions as a Complex contour", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    for (const [name, expression] of [["Real wave", "cos(x)"], ["Imaginary wave", "sin(x)"]] as const) {
      await openGraphType(page, "Function");
      const editor = graphEditor(page);
      await editor.getByLabel("Function name").fill(name);
      await editor.getByLabel("Function expression").fill(expression);
      await editor.getByLabel("Domain minimum").fill("0");
      await editor.getByLabel("Domain maximum").fill(String(2 * Math.PI));
      await saveGraphEditor(page);
    }
    const list = page.getByLabel("Graph functions", { exact: true });
    await list.getByRole("button", { name: "Select Real wave" }).click();
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await expect(panel.getByLabel("Complex imaginary source")).toHaveValue(/.+/);
    await panel.getByLabel("Complex contour samples").fill("129");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("129 points · closed contour");
    await expect(panel).toContainText("Real Graph object");
    await panel.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(link.getByRole("status")).toContainText("imaginary object");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 maps the checked real and imaginary lines of one complex field", async () => {
  test.setTimeout(120_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Complex wave packet" }).click();
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    for (const component of ["real", "imaginary"] as const) {
      await dialog.getByLabel("Dataset component").selectOption(`field:${component}`);
      await dialog.getByLabel("Fixed index").selectOption("24");
      await dialog.getByRole("button", { name: "Preview line" }).click();
      await expect(dialog).toContainText("41 checked samples");
      await dialog.getByRole("button", { name: "Import as point series" }).click();
    }
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph functions", { exact: true })
      .getByRole("button", { name: /Select Wave amplitude real/ }).click();
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await expect(panel.getByLabel("Complex imaginary source")).toHaveValue(/.+/);
    await expect(panel.getByLabel("Complex contour samples")).toHaveValue("41");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("41 points");
    await expect(panel).toContainText("Verified complex grid");
    await expect(panel).toContainText("varying axis 0");
    await panel.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(link).toContainText("component checksums");
    await expect(link).toContainText("Original bundle: not checked in this session");
    await link.getByRole("button", { name: "Verify original bundle" }).click();
    await expect(link).toContainText("Original bundle: verified in this session");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 maps a freshly verified real/imaginary line pair from one 3D complex plane", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-complex-volume-"));
  const directory = join(root, "complex-volume.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/complex-wave.sscene"), directory, { recursive: true });
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  manifest.sceneId = "complex-volume";
  manifest.title = "Complex wave volume";
  manifest.coordinates[0].axes.push({ name: "z", unit: "m" });
  manifest.coordinates[0].origin.push(-1);
  manifest.coordinates[0].spacing.push(.5);
  manifest.coordinates[0].periodic.push(false);
  manifest.datasets[0].shape.push(3);
  for (const [index, component] of ["real", "imaginary"].entries()) {
    const file = join(directory, `${component}.f64`), base = await readFile(file);
    const expanded = Buffer.alloc(base.length * 3);
    for (let cell = 0; cell < base.length / 8; cell++) for (let z = 0; z < 3; z++)
      expanded.writeDoubleLE(base.readDoubleLE(cell * 8) + (index === 0 ? 1 : -1) * z * .05,
        (cell * 3 + z) * 8);
    await writeFile(file, expanded);
    manifest.resources[index].count = expanded.length / 8;
    manifest.resources[index].bytes = expanded.length;
    manifest.resources[index].sha256 = createHash("sha256").update(expanded).digest("hex");
  }
  const manifestJson = JSON.stringify(manifest);
  await writeFile(join(directory, "manifest.json"), manifestJson);
  const bundle = JSON.parse(await readFile(join(directory, "bundle.json"), "utf8"));
  bundle.manifest.bytes = Buffer.byteLength(manifestJson);
  bundle.manifest.sha256 = createHash("sha256").update(manifestJson).digest("hex");
  await writeFile(join(directory, "bundle.json"), JSON.stringify(bundle));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    const pair = importer.getByRole("region", { name: "3D complex field lines" });
    await pair.getByLabel("Complex plane coordinate z").selectOption("1");
    await pair.getByLabel("Complex fixed y").selectOption("20");
    await pair.getByRole("button", { name: "Preview real/imaginary lines" }).click();
    await expect(pair.getByRole("figure", { name: "Verified 3D complex line pair" })).toContainText("41 aligned samples");
    const imaginaryFile = join(directory, "imaginary.f64"), original = await readFile(imaginaryFile);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(imaginaryFile, changed);
    await pair.getByRole("button", { name: "Import real/imaginary pair" }).click();
    await expect(pair.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await writeFile(imaginaryFile, original);
    await pair.getByRole("button", { name: "Preview real/imaginary lines" }).click();
    await expect(pair.getByRole("figure", { name: "Verified 3D complex line pair" })).toContainText("41 aligned samples");
    await pair.getByRole("button", { name: "Import real/imaginary pair" }).click();
    await expect(pair).toContainText("already in Graphs");
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph functions", { exact: true })
      .getByRole("button", { name: /Select Wave amplitude · real/ }).click();
    const mapping = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await expect(mapping.getByLabel("Complex imaginary source")).toHaveValue(/.+/);
    await writeFile(imaginaryFile, changed);
    await mapping.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(mapping.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await writeFile(imaginaryFile, original);
    await mapping.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(mapping.getByRole("status")).toContainText("41 points");
    await expect(mapping).toContainText("plane z = -0.5 m");
    await mapping.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link).toContainText("plane z = -0.5 m");
    await link.getByRole("button", { name: "Verify original bundle" }).click();
    await expect(link).toContainText("Original bundle: verified in this session");
    await rm(join(directory, "real.f64"));
    await link.getByRole("button", { name: "Verify original bundle" }).click();
    await expect(link.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-complex-volume-"))
      throw new Error("Unsafe complex volume fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-17 bundled 3D complex preset imports and maps without a folder picker", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => {
      throw new Error("A pinned preset must not open a folder picker"); }; });
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    const chooser = page.getByRole("dialog", { name: "Scientific field presets" });
    await chooser.getByRole("button", { name: "Complex wave volume", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    const pair = importer.getByRole("region", { name: "3D complex field lines" });
    await expect(importer).toContainText("shape [41, 41, 17]");
    await pair.getByRole("button", { name: "Preview real/imaginary lines" }).click();
    await expect(pair.getByRole("figure", { name: "Verified 3D complex line pair" })).toContainText("41 aligned samples");
    await pair.getByRole("button", { name: "Import real/imaginary pair" }).click();
    await expect(pair).toContainText("already in Graphs");
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph functions", { exact: true })
      .getByRole("button", { name: /Select Wave amplitude · real/ }).click();
    const mapping = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await mapping.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(mapping.getByRole("status")).toContainText("41 points");
    await mapping.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await link.getByRole("button", { name: "Verify original bundle" }).click();
    await expect(link).toContainText("Original bundle: verified in this session");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 saved 3D complex field reopens and imports distinct verified pairs", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-complex-field-project-"));
  const directory = join(root, "complex-field.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/complex-wave-volume.sscene"), directory,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    const pair = importer.getByRole("region", { name: "3D complex field lines" });
    await pair.getByLabel("Complex plane coordinate z").selectOption("4");
    await pair.getByLabel("Complex fixed y").selectOption("10");
    await pair.getByRole("button", { name: "Save paired field to Project" }).click();
    await expect(pair.getByRole("status")).toContainText("saved to Project");
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const fieldId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.find((entry: { module: string }) => entry.module === "field")?.expected.id as string);
    expect(fieldId).toBeTruthy();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    let workspace = page.getByRole("dialog", { name: "3D complex field workspace" });
    await expect(workspace).toContainText("Both source components verified on this opening");
    let savedPair = workspace.getByRole("region", { name: "3D complex field lines" });
    await expect(savedPair.getByLabel("Complex plane coordinate z")).toHaveValue("4");
    await expect(savedPair.getByLabel("Complex fixed y")).toHaveValue("10");
    await savedPair.getByRole("button", { name: "Preview real/imaginary lines" }).click();
    await expect(savedPair.getByRole("figure", { name: "Verified 3D complex line pair" })).toContainText("41 aligned samples");
    await savedPair.getByRole("button", { name: "Import real/imaginary pair" }).click();
    await expect(savedPair).toContainText("already in Graphs");
    await expect(savedPair.getByRole("button", { name: "Import real/imaginary pair" })).toBeDisabled();
    await savedPair.getByLabel("Complex fixed y").selectOption("11");
    await savedPair.getByRole("button", { name: "Preview real/imaginary lines" }).click();
    await savedPair.getByRole("button", { name: "Import real/imaginary pair" }).click();
    await expect(savedPair).toContainText("already in Graphs");
    await savedPair.getByRole("button", { name: "Save paired field to Project" }).click();
    await expect(savedPair.getByRole("status")).toContainText("saved to Project");
    await workspace.getByRole("button", { name: "Close" }).click();
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    workspace = page.getByRole("dialog", { name: "3D complex field workspace" });
    await expect(workspace).toContainText("Both source components verified on this opening");
    savedPair = workspace.getByRole("region", { name: "3D complex field lines" });
    await expect(savedPair.getByLabel("Complex fixed y")).toHaveValue("11");
    const imaginaryFile = join(directory, "imaginary.f64"), original = await readFile(imaginaryFile);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(imaginaryFile, changed);
    await workspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(workspace.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(workspace.getByRole("region", { name: "3D complex field lines" })).toHaveCount(0);
    await writeFile(imaginaryFile, original);
    await workspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(workspace).toContainText("Both source components verified on this opening");
    await rm(join(directory, "real.f64"));
    await workspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(workspace.getByRole("alert")).toContainText(/missing|ENOENT|not found/i);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-complex-field-project-"))
      throw new Error("Unsafe complex field Project fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("GRA-17 places a linked contour and reviews a changed Graph before refresh", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Parametric");
    await graphEditor(page).getByLabel("Parametric name").fill("Linked circle");
    await graphEditor(page).getByLabel("Parametric x expression").fill("cos(t)");
    await graphEditor(page).getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    const mapping = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await mapping.getByRole("button", { name: "Preview Complex contour" }).click();
    await mapping.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(page.getByTestId("project-scientific-editor")).toContainText("Saved Complex");

    await page.getByTestId("workspace-nav-graphs").click();
    await editGraph(page, "Linked circle");
    await graphEditor(page).getByLabel("Parametric x expression").fill("2*cos(t)");
    await saveGraphEditor(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await expect(link.getByRole("status")).toContainText("Source changed");
    await link.getByRole("button", { name: "Review contour refresh" }).click();
    await expect(link.getByTestId("graph2d-complex-refresh-review")).toContainText("Complex revision");
    await link.getByRole("button", { name: "Apply reviewed contour refresh" }).click();
    await expect(link.getByRole("status")).toContainText("Source current");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    const graph = workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const complex = workspace.entries.find((entry: { module: string }) => entry.module === "complex");
    expect(complex.expected.revision).toBe(2);
    expect(complex.checkpoint.provenance.graphSource.revision).toBe(graph.expected.revision);
    expect(complex.checkpoint.contours[0].points).toHaveLength(257);
    const projects = page.getByTestId("project-explorer-panel");
    if (!await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("math3d.project.v1"))).toBe(true);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.workspace.entries.some((entry: { expected: { id: string } }) =>
      entry.expected.id === complex.expected.id)).toBe(true);
    const linkedEntries = project.workspace.entries.filter((entry: { module: string }) =>
      entry.module === "graph2d" || entry.module === "complex");
    const leanWorkspace = core.createMixedWorkspaceDocument({ entries: linkedEntries,
      activeDocumentIds: linkedEntries.map((entry: { expected: { id: string } }) => entry.expected.id),
      results: [], relations: [], artifacts: [], constructions: [], committedSelection: null });
    const portable = core.createMath3DProject(leanWorkspace,
      { stableKey: "gra17-linked-project", title: "Linked Complex contour" });
    await projects.getByTestId("project-import-file").setInputFiles({ name: "linked-complex.json",
      mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(portable)) });
    await expect(projects.getByTestId("project-import-open")).toBeEnabled();
    await projects.getByTestId("project-import-open").click();
    await expect(link.getByRole("status")).toContainText("Source current");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await projects.isVisible()) await projects.getByRole("button", { name: "Close project explorer" }).click();
    await openGraphType(page, "Parametric");
    await graphEditor(page).getByLabel("Parametric name").fill("Second linked path");
    await graphEditor(page).getByLabel("Parametric x expression").fill("cos(t)");
    await graphEditor(page).getByLabel("Parametric y expression").fill("2*sin(t)");
    await saveGraphEditor(page);
    const second = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await second.getByRole("button", { name: "Preview Complex contour" }).click();
    await second.getByRole("button", { name: "Open in Complex Analysis" }).click();
    await expect(link.getByRole("status")).toContainText("Source current");
    const restoredProjects = page.getByTestId("project-explorer-panel");
    if (!await restoredProjects.isVisible()) await page.getByTestId("projects-toggle").click();
    await restoredProjects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("math3d.project.v1");
      return raw ? JSON.parse(raw).workspace.entries.filter((entry: { module: string }) => entry.module === "complex").length : 0;
    })).toBe(2);
  } finally { await closeSurfaceApp(app); }
});
