import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
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

test("SCI-02 keeps slice preview and probe controls in the contextual Inspector", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const inspector = explorer.getByLabel("Field status and actions");
    const controls = explorer.getByLabel("Field controls");
    const viewer = explorer.getByLabel("3D field viewer");
    await explorer.getByRole("region", { name: "Built-in scientific scenes" })
      .getByRole("button", { name: /Swirling flow/ }).click();
    await expect(explorer.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 60_000 });
    const xy = inspector.getByRole("button", { name: "XY slice", exact: true });
    const xz = inspector.getByRole("button", { name: "XZ slice", exact: true });
    await expect(xy).toBeEnabled({ timeout: 60_000 });
    await xy.focus();
    await page.keyboard.press("Tab");
    await expect(xz).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(xz).toHaveAttribute("aria-pressed", "true");
    const coordinate = inspector.getByLabel("Slice physical coordinate");
    await coordinate.selectOption({ index: 2 });
    const preview = inspector.getByRole("button", { name: "Preview slice" });
    await preview.focus();
    await page.keyboard.press("Enter");
    await expect(viewer.getByRole("figure", { name: "XZ field slice" }))
      .toBeVisible({ timeout: 60_000 });
    await expect(inspector.getByLabel("Link slice planes to probe")).toBeVisible();
    await page.setViewportSize({ width: 760, height: 700 });
    const [right, middle, left, action] = await Promise.all([
      inspector.boundingBox(), viewer.boundingBox(), controls.boundingBox(), preview.boundingBox()]);
    expect(right && middle && left && action).toBeTruthy();
    expect(right!.y).toBeLessThan(middle!.y);
    expect(middle!.y).toBeLessThan(left!.y);
    expect(action!.y).toBeGreaterThanOrEqual(right!.y);
    expect(action!.y + action!.height).toBeLessThanOrEqual(right!.y + right!.height + 2);
    const width = await explorer.evaluate(element => ({ width: element.clientWidth,
      scroll: element.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.width + 2);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 opens built-in vector, scalar and complex scenes without a folder picker", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await expect(examples.getByRole("button")).toHaveCount(5);
    await examples.getByRole("button", { name: /Swirling flow/ }).click();
    await expect(explorer.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples");
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await expect(explorer.getByTestId("scientific-explorer-field-layer")
      .getByRole("figure", { name: /Verified volume for Potential scalar/ })).toBeVisible();
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    const complex = explorer.getByTestId("scientific-explorer-field-layer");
    await expect(complex.getByRole("figure", { name: /Verified volume for .* real/ })).toBeVisible();
    await expect(complex.getByRole("figure", { name: /Verified volume for .* imaginary/ })).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 linked physical probe follows vector, scalar, complex and 80³ layers", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    const probe = explorer.getByTestId("scientific-explorer-cross-layer-probe");
    await examples.getByRole("button", { name: /Swirling flow/ }).click();
    await probe.getByRole("button", { name: "Place at this field center" }).click();
    await expect(probe).toContainText("Physical point: 0 m · 0 m · 0 m");
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point");
    await probe.locator('input[aria-label="Linked probe x"]').fill("1");
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point");
    await probe.locator('input[aria-label="Linked probe y"]').fill("-0.5");
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point");
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    const scalar = explorer.getByTestId("scientific-explorer-linked-probe");
    await expect(scalar).toContainText("scalar = 1.250000");
    await expect(scalar).toContainText("verified samples");
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    const complex = explorer.getByTestId("scientific-explorer-linked-probe");
    await expect(complex).toContainText("real =");
    await expect(complex).toContainText("imaginary =");
    await probe.locator('input[aria-label="Linked probe z"]').fill("3");
    await expect(complex).toContainText("outside this field domain");
    await expect(complex).not.toContainText("real =");
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await expect(explorer.getByTestId("scientific-explorer-linked-probe"))
      .toContainText("scalar = 10.25000");
    await examples.getByRole("button", { name: /Generated vortex/ }).click();
    await expect(probe).toContainText("Physical point: 1 m · -0.5 m · 3 m");
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point", { timeout: 30000 });
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("verified samples");
    const readComponent = async (name: string) => {
      const text = await explorer.getByTestId("scientific-explorer-linked-vector-probe").innerText();
      return Number(text.match(new RegExp(`${name} = ([0-9.eE+-]+)`))?.[1]);
    };
    const scale = 16 / (16 + 1 + 0.25);
    expect(await readComponent("east")).toBeCloseTo(0.5 * scale, 2);
    expect(await readComponent("north")).toBeCloseTo(scale, 2);
    expect(await readComponent("up")).toBeCloseTo(Math.sin(3) / 4, 2);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 overlays a verified scalar heatmap with physical vector glyphs on all planes and 80³", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await examples.getByRole("button", { name: /Swirling flow/ }).click();
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await explorer.getByRole("button", { name: "Show this scalar as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-scalar-overlay-status"))
      .toContainText("Verified scalar samples", { timeout: 60_000 });
    for (const plane of ["XY", "XZ", "YZ"] as const) {
      await explorer.getByRole("button", { name: `${plane} slice`, exact: true }).click();
      await explorer.getByRole("button", { name: "Preview slice" }).click();
      await expect(explorer.getByTestId("scientific-scalar-overlay-status"))
        .toContainText("Verified scalar samples");
      const figure = explorer.getByRole("figure", { name: `${plane} field slice` });
      await expect(figure.getByTestId("scientific-slice-overlay-arrows")).toBeVisible();
      await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
        .toContainText("verified sample SHA-256");
      await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
        .toContainText("Potential");
      const region = figure.getByTestId("scientific-overlay-region");
      await region.getByRole("button", { name: "Select rectangular region" }).click();
      await figure.locator('[data-probe-cell="8-8"]').click();
      await figure.locator('[data-probe-cell="14-14"]').click();
      await expect(region.getByTestId("scientific-overlay-region-summary"))
        .toContainText("Aligned physical samples: 289/289");
      await expect(figure.getByTestId("scientific-overlay-region-marker")).toBeVisible();
      if (plane === "XY") {
        await figure.locator('[data-probe-cell="10-10"]').click();
        await expect(explorer.getByTestId("scientific-explorer-cross-layer-probe"))
          .toContainText("Physical point: 0 m · 0 m · 0 m");
      }
      await expect(figure.getByTestId("vector-field3d-slice-crosshair")).toBeVisible();
      const linkedLine = figure.getByTestId("scientific-linked-overlay-profile");
      await linkedLine.getByRole("button", { name: "Link line through shared probe" }).click();
      await expect(linkedLine).toContainText(/vector samples;.*scalar samples/);
      if (plane === "XY") {
        await linkedLine.getByRole("combobox", { name: "Linked vector quantity" }).selectOption("q");
        await linkedLine.getByText("Aligned sample values and gaps").click();
        const row = linkedLine.locator("tbody tr").nth(15);
        const x = Number(await row.locator("td").nth(0).innerText());
        expect(Number(await row.locator("td").nth(1).innerText()))
          .toBeCloseTo(x * Math.exp(-x * x / 18), 4);
        expect(Number(await row.locator("td").nth(2).innerText())).toBeCloseTo(x * x, 4);
        const shared = explorer.getByTestId("scientific-explorer-cross-layer-probe");
        await shared.locator('input[aria-label="Linked probe y"]').fill("0.5");
        await expect(linkedLine).toContainText("y = 0.5 m");
        expect(Number(await row.locator("td").nth(2).innerText())).toBeCloseTo(x * x + 0.25, 4);
        await shared.locator('input[aria-label="Linked probe y"]').fill("9");
        await expect(linkedLine.getByRole("alert")).toContainText("outside the vector field domain");
        await expect(linkedLine.locator("tbody")).toHaveCount(0);
        await shared.locator('input[aria-label="Linked probe y"]').fill("0");
        await linkedLine.getByTestId("send-linked-overlay-line-to-graphs").click();
        await expect(explorer.getByTestId("vector-field3d-run-status"))
          .toContainText("aligned vector and scalar samples", { timeout: 60_000 });
      }
    }
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    const complexRegion = explorer.getByTestId("scientific-explorer-linked-region-summary");
    await expect(complexRegion).toContainText("real (1)", { timeout: 60_000 });
    await expect(complexRegion).toContainText("imaginary (1)");
    await expect(complexRegion).toContainText("complex-wave-volume / field");
    await explorer.getByRole("button", { name: "Back to vector layer" }).click();
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    const scalarRegion = explorer.getByTestId("scientific-explorer-linked-region-summary");
    await expect(scalarRegion).toContainText("scalar (V)", { timeout: 60_000 });
    await expect(scalarRegion).toContainText("quadratic-volume / field");
    await explorer.getByRole("button", { name: "Back to vector layer" }).click();
    await examples.getByRole("button", { name: /Generated vortex/ }).click();
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await explorer.getByRole("button", { name: "Show this scalar as overlay on vector slices" }).click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    const large = explorer.getByRole("figure", { name: "XY field slice" });
    await expect(large.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("1024/1024 cells", { timeout: 60_000 });
    await expect(large.getByTestId("scientific-slice-overlay-arrows")).toBeVisible();
    const largeRegion = large.getByTestId("scientific-overlay-region");
    await largeRegion.getByRole("button", { name: "Select rectangular region" }).click();
    await large.locator('[data-probe-cell="12-12"]').click();
    await large.locator('[data-probe-cell="20-20"]').click();
    await expect(largeRegion.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Aligned physical samples: 289/289");
    await expect(largeRegion).toContainText("Physical rectangle: x");
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await expect(explorer.getByTestId("scientific-explorer-linked-region-summary"))
      .toContainText("289/289 physical positions covered", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to vector layer" }).click();
    await large.locator('[data-probe-cell="16-16"]').click();
    const largeLine = large.getByTestId("scientific-linked-overlay-profile");
    await largeLine.getByRole("button", { name: "Link line through shared probe" }).click();
    await expect(largeLine).toContainText("32/32 vector samples; 32/32 scalar samples");
    await largeLine.getByText("Aligned sample values and gaps").click();
    const physicalLine = await largeLine.getByText(/Physical line: vary/).innerText();
    const y = Number(physicalLine.match(/y = ([0-9.eE+-]+)/)?.[1]);
    const z = Number(physicalLine.match(/z = ([0-9.eE+-]+)/)?.[1]);
    const row = largeLine.locator("tbody tr").nth(20);
    const x = Number(await row.locator("td").nth(0).innerText());
    const t = x * x + y * y, a = 16 / (16 + t);
    const expectedSpeed = Math.sqrt(t * a * a + Math.sin(z) ** 2 / 16);
    expect(Number(await row.locator("td").nth(1).innerText())).toBeCloseTo(expectedSpeed, 4);
    await largeLine.getByTestId("send-linked-overlay-line-to-graphs").click();
    await expect(explorer.getByTestId("vector-field3d-run-status"))
      .toContainText("32 aligned vector and scalar samples", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(page.getByRole("complementary", { name: "Graph functions" })
      .getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("complementary", { name: "Graph inspector" }).getByLabel("Source and sampling details"))
      .toContainText("Verified both sources.", { timeout: 60_000 });
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 Burgers overlay reopens with source links and rejects a changed vector tile", async () => {
  test.setTimeout(300_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-scalar-overlay-"));
  const directory = join(root, "burgers.sscene");
  const scalarDirectory = join(root, "potential.sscene");
  const complexDirectory = join(root, "complex.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), directory,
    { recursive: true });
  await cp(resolve("examples/scientific-scenes/quadratic-volume.sscene"), scalarDirectory,
    { recursive: true });
  await cp(resolve("examples/scientific-scenes/complex-wave-volume.sscene"), complexDirectory,
    { recursive: true });
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
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await explorer.getByLabel("Slice physical coordinate").selectOption({ index: 0 });
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, scalarDirectory);
    const library = explorer.getByRole("region", { name: "Dataset library" });
    await library.getByRole("button", { name: "Browse scientific scene" }).click();
    await library.getByRole("button", { name: "Open Potential from dataset library" }).click();
    await explorer.getByRole("button", { name: "Show this scalar as overlay on vector slices" }).click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    await expect(explorer.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential", { timeout: 60_000 });
    const region = explorer.getByTestId("scientific-overlay-region");
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    await region.getByRole("button", { name: "Select rectangular region" }).click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await figure.locator('[data-probe-cell="20-20"]').click();
    await expect(region.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Scalar field outside selected area:");
    const boundsEditor = explorer.getByTestId("scientific-explorer-cross-layer-region");
    await boundsEditor.getByRole("spinbutton", { name: "Region x min" }).fill("-0.02");
    await boundsEditor.getByRole("spinbutton", { name: "Region x max" }).fill("0.02");
    await boundsEditor.getByRole("spinbutton", { name: "Region y min" }).fill("-0.03");
    await boundsEditor.getByRole("spinbutton", { name: "Region y max" }).fill("0.03");
    await boundsEditor.getByRole("spinbutton", { name: "Region y max" }).blur();
    await expect(region.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Vector field outside selected area:");
    await region.getByTestId("scientific-region-publish").click();
    await expect(region.getByTestId("scientific-region-saved-status"))
      .toContainText("numerical summary reverified");
    await region.getByTestId("send-linked-region-to-graphs").click();
    await expect(explorer.getByTestId("vector-field3d-run-status"))
      .toContainText("17 aligned region mean samples", { timeout: 60_000 });
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, complexDirectory);
    await library.getByRole("button", { name: "Browse scientific scene" }).click();
    await library.getByRole("button", { name: "Open Wave amplitude from dataset library" }).click();
    const complexRegion = explorer.getByTestId("scientific-explorer-linked-region-summary");
    await expect(complexRegion).toContainText("real (1)", { timeout: 60_000 });
    await expect(complexRegion).toContainText("imaginary (1)");
    await expect(complexRegion).toContainText("verified samples");
    await explorer.getByRole("button", { name: "Back to vector layer" }).click();
    const linkedLine = explorer.getByTestId("scientific-linked-overlay-profile");
    await explorer.getByRole("figure", { name: "XY field slice" })
      .locator('[data-probe-cell="16-16"]').click();
    await linkedLine.getByRole("button", { name: "Link line through shared probe" }).click();
    await expect(linkedLine).toContainText(/vector samples;.*scalar samples/);
    await linkedLine.getByTestId("send-linked-overlay-line-to-graphs").click();
    await expect(explorer.getByTestId("vector-field3d-run-status"))
      .toContainText("aligned vector and scalar samples", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" }).getByLabel("Source and sampling details"))
      .toContainText("Verified both sources.", { timeout: 60_000 });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-view-mode"))
      .toContainText("Saved in Your saved projects", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1"))).not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const savedRegionResult = stored.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.linked-region");
    expect(savedRegionResult).toBeTruthy();
    expect(savedRegionResult.provenance.operation.parameters.region.bounds)
      .toEqual([[-0.02, 0.02], [-0.03, 0.03]]);
    expect(savedRegionResult.provenance.operation.parameters.vectorReferences).toHaveLength(3);
    expect(savedRegionResult.provenance.operation.parameters.overlayReferences).toHaveLength(1);
    expect(JSON.stringify(savedRegionResult)).not.toContain('"values"');
    expect(stored.workspace.relations).toContainEqual(expect.objectContaining({
      kind: "analysis-of", target: { type: "result", resultId: savedRegionResult.resultId,
        resultType: "vector3d.linked-region" } }));
    const graphEntry = stored.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const graphObjects = [...(graphEntry.replay?.payload?.transactions ?? [])].reverse()
      .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
        transaction.commands[0]?.command.payload.source?.objects)
      .find((value: unknown) => Array.isArray(value)) ?? graphEntry.checkpoint.source.objects;
    const linkedGraphObjects = graphObjects.filter((item: { linkedOrigin?: unknown }) => item.linkedOrigin);
    expect(linkedGraphObjects).toHaveLength(4);
    const regionGraphObjects = linkedGraphObjects.filter((item: { linkedOrigin: { kind: string } }) =>
      item.linkedOrigin.kind === "vector-scalar-linked-region/v1");
    expect(regionGraphObjects).toHaveLength(2);
    expect(regionGraphObjects.map((item: { linkedOrigin: { series: string } }) => item.linkedOrigin.series))
      .toEqual(["vector", "scalar"]);
    expect(regionGraphObjects[0].linkedOrigin.region.bounds)
      .toEqual([[-0.02, 0.02], [-0.03, 0.03]]);
    expect(regionGraphObjects[0].linkedOrigin.vectorSamples).toHaveLength(3);
    expect(regionGraphObjects[0].linkedOrigin.rowsSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    const lineGraphObjects = linkedGraphObjects.filter((item: { linkedOrigin: { kind: string } }) =>
      item.linkedOrigin.kind === "vector-scalar-linked-line/v1");
    expect(lineGraphObjects).toHaveLength(2);
    const linkedVectorRefs = JSON.parse(lineGraphObjects[0].linkedOrigin.vectorDocumentJson)
      .source.field.references;
    expect(linkedVectorRefs).toHaveLength(3);
    expect(linkedVectorRefs[0].sceneFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(lineGraphObjects[0].linkedOrigin.scalarReference.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(lineGraphObjects[0].linkedOrigin.profile.point).toHaveLength(3);
    expect(lineGraphObjects[0].linkedOrigin.rowsSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    const vectorCheckpoint = stored.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d")?.checkpoint;
    const recipe = vectorCheckpoint.workspace.scalarOverlay;
    expect(recipe.reference.sceneId).toBe("quadratic-volume");
    expect(recipe.reference.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(recipe)).not.toContain("values");
    const savedLine = vectorCheckpoint.workspace.linkedLineProfile;
    expect(savedLine.normalAxis).toBe(2);
    expect(savedLine.varyingAxis).toBe(0);
    expect(savedLine.vectorChannel).toBe("speed");
    expect(savedLine.point).toEqual(vectorCheckpoint.workspace.probe);
    const savedRegion = vectorCheckpoint.workspace.overlayRegion;
    expect(savedRegion.normalAxis).toBe(2);
    expect(savedRegion.fixedCoordinate).toBe(vectorCheckpoint.workspace.sliceCoordinates[2]);
    expect(savedRegion.bounds).toHaveLength(2);
    expect(savedRegion.bounds).toEqual([[-0.02, 0.02], [-0.03, 0.03]]);
    expect(savedRegion.vectorChannel).toBe("speed");
    expect(JSON.stringify(savedRegion)).not.toContain("values");
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    if (!await projects.getByTestId("project-dashboard").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await expect(projects.getByTestId(`project-result-freshness-${savedRegionResult.resultId}`))
      .toContainText("Source verified", { timeout: 60_000 });
    await projects.getByTestId("project-detail-tab-results").click();
    const currentOutput = projects.getByTestId("project-results-browser");
    await currentOutput.getByTestId(`project-result-select-${savedRegionResult.resultId}`).click();
    await expect(currentOutput.getByTestId("project-region-result-gated")).toHaveCount(0);
    await expect(currentOutput.getByTestId("project-result-detail"))
      .toContainText("alignedCount");
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" }).getByLabel("Source and sampling details"))
      .toContainText("Verified both sources.", { timeout: 60_000 });
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    const graphRegion = page.getByRole("complementary", { name: "Graph inspector" })
      .getByTestId("graph2d-linked-region-selection");
    await expect(graphRegion).toContainText("17 physical columns");
    await graphRegion.getByRole("spinbutton", { name: "Linked region interval from" }).fill("-0.01");
    await graphRegion.getByRole("spinbutton", { name: "Linked region interval to" }).fill("0.01");
    await graphRegion.getByTestId("graph2d-open-region-interval").click();
    const graphOpenedRegion = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(graphOpenedRegion.getByTestId("scientific-region-graph-focus-marker"))
      .toBeVisible({ timeout: 60_000 });
    await expect(graphOpenedRegion.getByTestId("scientific-region-graph-focus"))
      .toContainText("gaps), V", { timeout: 60_000 });
    await graphOpenedRegion.getByRole("button", { name: "Back to Graphs" }).click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const reopened = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-scalar-overlay-status"))
      .toContainText("Verified scalar samples");
    await expect(reopened.getByTestId("scientific-linked-overlay-profile"))
      .toContainText(/vector samples;.*scalar samples/);
    await expect(reopened.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Scalar field outside selected area:");
    await expect(reopened.getByTestId("scientific-region-saved-status"))
      .toContainText("numerical summary reverified", { timeout: 60_000 });
    const reopenedLibrary = reopened.getByRole("region", { name: "Dataset library" });
    await reopenedLibrary.getByRole("button", { name: "Open Wave amplitude from dataset library" }).click();
    await expect(reopened.getByTestId("scientific-explorer-linked-region-summary"))
      .toContainText("imaginary (1)", { timeout: 60_000 });
    await reopened.getByRole("button", { name: "Back to vector layer" }).click();
    const scalarFile = join(scalarDirectory, "scalar.f64");
    const originalScalar = await readFile(scalarFile), changedScalar = Buffer.from(originalScalar);
    changedScalar[0] ^= 1;
    await writeFile(scalarFile, changedScalar);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-scalar-overlay-status"))
      .toContainText(/withheld.*integrity|withheld.*checksum|withheld.*changed/i,
        { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance")).toHaveCount(0);
    await expect(reopened.getByTestId("scientific-linked-overlay-profile")).not
      .toContainText(/vector samples;.*scalar samples/);
    await expect(reopened.getByTestId("scientific-overlay-region-summary")).toHaveCount(0);
    await writeFile(scalarFile, originalScalar);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Scalar field outside selected area:");
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    const realFile = join(complexDirectory, "real.f64");
    const originalReal = await readFile(realFile), changedReal = Buffer.from(originalReal);
    changedReal[0] ^= 1;
    await writeFile(realFile, changedReal);
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenExplorer = page.getByRole("button", { name: "Scientific Field Explorer" });
    if (!await reopenExplorer.isVisible())
      await page.locator(".graph2d-toolbar-menu > summary").click();
    await reopenExplorer.click();
    const changedComplex = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(changedComplex.getByRole("region", { name: "Dataset library" })
      .getByRole("button", { name: "Open Wave amplitude from dataset library" }))
      .toBeDisabled({ timeout: 60_000 });
    await expect(changedComplex.getByRole("region", { name: "Dataset library" }))
      .toContainText("Source changed");
    await expect(changedComplex.getByTestId("scientific-explorer-linked-region-summary"))
      .toHaveCount(0);
    await changedComplex.getByRole("button", { name: "Back to Graphs" }).click();
    await writeFile(realFile, originalReal);
    const tile = join(directory, "vx.f64"), original = await readFile(tile);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(tile, changed);
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    if (!await projects.getByTestId("project-dashboard").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await expect(projects.getByTestId(`project-result-freshness-${savedRegionResult.resultId}`))
      .toContainText("Changed source", { timeout: 60_000 });
    await projects.getByTestId("project-detail-tab-results").click();
    const savedOutput = projects.getByTestId("project-results-browser");
    await savedOutput.getByTestId(`project-result-select-${savedRegionResult.resultId}`).click();
    await expect(savedOutput.getByTestId("project-region-result-gated"))
      .toContainText("A source has changed");
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" })
      .getByLabel("Source and sampling details"))
      .toContainText(/integrity|checksum|changed/i, { timeout: 60_000 });
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" })
      .getByTestId("graph2d-linked-region-selection"))
      .toContainText("withheld until both sources");
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 4 && paths.every(path => !path.getAttribute("d"))))
      .toBe(true);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const changedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(changedExplorer.getByRole("alert"))
      .toContainText(/integrity|checksum|changed/i, { timeout: 60_000 });
    await expect(changedExplorer.getByTestId("scientific-slice-overlay-provenance"))
      .toHaveCount(0);
    await expect(changedExplorer.getByTestId("scientific-linked-overlay-profile"))
      .toHaveCount(0);
    await expect(changedExplorer.getByTestId("scientific-overlay-region-summary"))
      .toHaveCount(0);
    await changedExplorer.getByRole("region", { name: "Dataset library" })
      .getByRole("button", { name: "Open Wave amplitude from dataset library" }).click();
    await expect(changedExplorer.getByTestId("scientific-explorer-linked-region"))
      .toContainText("Region withheld: Vector source withheld", { timeout: 60_000 });
    await expect(changedExplorer.getByTestId("scientific-explorer-linked-region-summary"))
      .toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-scalar-overlay-"))
      throw new Error("Unsafe scalar-overlay fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 scalar heatmap and complex contours reopen with independent source checks", async () => {
  test.setTimeout(480_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-contour-overlay-"));
  const complex = join(root, "complex.sscene");
  await cp(resolve("examples/scientific-scenes/complex-wave-volume.sscene"), complex,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await examples.getByRole("button", { name: /Swirling flow/ }).click();
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await explorer.getByRole("button", { name: "Show this scalar as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-scalar-overlay-status"))
      .toContainText("Verified scalar samples", { timeout: 60_000 });
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, complex);
    const library = explorer.getByRole("region", { name: "Dataset library" });
    await library.getByRole("button", { name: "Browse scientific scene" }).click();
    await library.getByRole("button", { name: "Open Wave amplitude from dataset library" }).click();
    await explorer.getByRole("button", { name: "Show this complex field as overlay on vector slices" }).click();
    await expect(explorer.getByRole("combobox", { name: "Complex overlay mode" }))
      .toHaveValue("phase-contours");
    await expect(explorer.getByTestId("scientific-complex-overlay-status"))
      .toContainText("Verified real", { timeout: 60_000 });
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential");
    await expect(figure.getByTestId("scientific-slice-contour-provenance"))
      .toContainText("rad");
    await expect(figure.getByTestId("scientific-slice-phase-contours").locator("line").first())
      .toBeVisible();
    await figure.locator('[data-probe-cell="10-10"]').click();
    await expect(explorer.getByTestId("scientific-combined-field-probe"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(explorer.getByTestId("scientific-combined-complex-point"))
      .toContainText("phase", { timeout: 60_000 });
    const region = figure.getByTestId("scientific-overlay-region");
    await region.getByRole("button", { name: "Select rectangular region" }).click();
    await figure.locator('[data-probe-cell="8-8"]').click();
    await figure.locator('[data-probe-cell="13-13"]').click();
    const combined = figure.getByTestId("scientific-combined-region-summary");
    await expect(combined.getByTestId("scientific-combined-vector-region"))
      .toContainText("289/289 samples", { timeout: 60_000 });
    await expect(combined.getByTestId("scientific-combined-scalar-region"))
      .toContainText("Potential");
    await expect(combined.getByTestId("scientific-combined-complex-region"))
      .toContainText("phase");
    await expect(combined.getByTestId("scientific-combined-divergence-region"))
      .toContainText(/289\/289 samples \(0 gaps\).*1\/s/, { timeout: 60_000 });
    await expect(combined.getByTestId("scientific-combined-curl-region"))
      .toContainText(/289\/289 samples \(0 gaps\).*1\/s/);
    await region.getByTestId("scientific-region-publish").click();
    await expect(region.getByTestId("scientific-region-saved-status"))
      .toContainText("vector source-current, scalar source-current, complex source-current, divergence source-current, curl magnitude source-current");
    await region.getByTestId("send-linked-region-to-graphs").click();
    await expect(explorer).toContainText("Sent vector speed, scalar Q, complex magnitude, phase, divergence and curl magnitude profiles",
      { timeout: 60_000 });
    await region.getByTestId("send-linked-region-rows-to-graphs").click();
    await expect(explorer).toContainText("Sent vector speed, scalar Q, complex magnitude, phase, divergence and curl magnitude row profiles",
      { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await region.getByRole("button", { name: "Select Graphs column" }).click();
    await figure.locator('[data-probe-cell="0-0"]').click();
    await expect(region.getByTestId("scientific-region-to-graphs-error"))
      .toContainText("inside the saved physical rectangle");
    await figure.locator('[data-probe-cell="10-10"]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-dock-reset-recommended").click();
    const inspector = page.getByRole("complementary", { name: "Graph inspector" });
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText(/columns (7–7|8–8)/, { timeout: 60_000 });
    await expect(page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]"))
      .toHaveCount(6);
    await inspector.getByTestId("graph2d-open-region-point").click();
    await expect(explorer.getByTestId("scientific-region-graph-focus-marker"))
      .toBeVisible({ timeout: 60_000 });
    const reopenedFigure = explorer.getByRole("figure", { name: "XY field slice" });
    await reopenedFigure.getByRole("button", { name: "Select Graphs strip" }).click();
    await reopenedFigure.locator('[data-probe-cell="9-10"]').click();
    await reopenedFigure.locator('[data-probe-cell="12-10"]').click();
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("columns available", { timeout: 60_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(5);
    await inspector.getByTestId("graph2d-open-region-point").click();
    const subFigure = explorer.getByRole("figure", { name: "XY field slice" });
    await subFigure.getByTestId("scientific-select-graphs-subrectangle").click();
    await subFigure.locator('[data-probe-cell="9-9"]').click();
    await subFigure.locator('[data-probe-cell="12-12"]').click();
    await expect(subFigure.getByTestId("scientific-subrectangle-preview"))
      .toContainText("Proposed physical bounds");
    await expect(subFigure.getByTestId("scientific-subrectangle-proposal-marker"))
      .toBeVisible();
    await subFigure.getByTestId("scientific-confirm-graphs-subrectangle").click();
    await expect(inspector.getByTestId("graph2d-combined-intersection"))
      .toContainText("curl-magnitude", { timeout: 60_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(11);
    for (const axis of ["column", "row"]) for (const series of ["vector", "scalar",
      "complex-magnitude", "complex-phase", "divergence", "curl-magnitude"])
      await expect(page.getByTestId("graph2d-linked-region-highlight")
        .locator(`circle[data-graph2d-linked-region-series="${axis}:${series}"]`).first())
        .toBeVisible();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const savedIntersection = stored.workspace.entries.find((entry: { checkpoint: {
      format: string } }) => entry.checkpoint.format === "math3d.graph2d-document")
      ?.checkpoint.selection.linkedRegionIntersection;
    expect(savedIntersection.kind).toBe("combined-region-intersection/v1");
    expect(savedIntersection.bounds).toHaveLength(2);
    const saved = stored.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d")?.checkpoint.workspace;
    expect(saved.scalarOverlay.reference.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.complexOverlay.mode).toBe("phase-contours");
    expect(saved.complexOverlay.imaginary.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.linkedProbe.point).toHaveLength(3);
    expect(saved.overlayRegion.bounds).toHaveLength(2);
    expect(JSON.stringify(saved)).not.toContain('"values"');
    const combinedResult = stored.workspace.results.find((item: { provenance: {
      operation: { type: string } } }) => item.provenance.operation.type ===
      "vector3d.linked-region-combined");
    expect(combinedResult.provenance.operation.parameters.region.bounds).toHaveLength(2);
    expect(combinedResult.provenance.operation.algorithmVersion).toBe("17x17-v4");
    expect(combinedResult.summary.divergenceUnit).toBe("1/s");
    expect(combinedResult.summary.divergence.count).toBe(289);
    expect(combinedResult.summary.divergence.gaps).toBe(0);
    expect(combinedResult.summary.curlMagnitudeUnit).toBe("1/s");
    expect(combinedResult.summary.curlMagnitude.count).toBe(289);
    expect(combinedResult.summary.curlMagnitude.gaps).toBe(0);
    expect(combinedResult.provenance.operation.parameters.divergenceSamples).toHaveLength(3);
    expect(combinedResult.provenance.operation.parameters.scalarReference.resourceSha256)
      .toMatch(/^[a-f0-9]{64}$/);
    expect(combinedResult.provenance.operation.parameters.imaginaryReference.resourceSha256)
      .toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(combinedResult)).not.toContain('"values"');
    const linkedSeries = stored.workspace.entries.flatMap((entry: { checkpoint: {
      source?: { objects?: { linkedOrigin?: { kind: string; series: string;
        profileAxis?: number } }[] } } }) =>
      entry.checkpoint.source?.objects?.filter(object =>
        ["vector-scalar-complex-curl-row-linked-region/v5",
          "vector-scalar-complex-curl-linked-region/v4"].includes(
          object.linkedOrigin?.kind ?? "")).map(object =>
          ({ kind: object.linkedOrigin?.kind, series: object.linkedOrigin?.series,
            profileAxis: object.linkedOrigin?.profileAxis ?? 0 })) ?? []);
    expect(linkedSeries.filter((item: { kind: string }) => item.kind ===
      "vector-scalar-complex-curl-linked-region/v4").map((item: { series: string }) =>
      item.series)).toEqual([
      "vector", "scalar", "complex-magnitude", "complex-phase", "divergence",
      "curl-magnitude"]);
    expect(linkedSeries.filter((item: { profileAxis: number }) => item.profileAxis === 1)
      .map((item: { series: string }) => item.series)).toEqual([
      "vector", "scalar", "complex-magnitude", "complex-phase", "divergence",
      "curl-magnitude"]);
    const savedGraph = stored.workspace.entries.find((entry: { checkpoint: { format: string } }) =>
      entry.checkpoint.format === "math3d.graph2d-document")?.checkpoint;
    expect(savedGraph?.selection.linkedRegion.physical.kind).toBe("interval");
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    const reopened = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await reopened.isVisible()) {
      const reopenCombinedExplorer = page.getByRole("button", { name: "Scientific Field Explorer" });
      if (!await reopenCombinedExplorer.isVisible())
        await page.locator(".graph2d-toolbar-menu > summary").click();
      await reopenCombinedExplorer.click();
    }
    const reopenedInspector = reopened.getByLabel("Field status and actions");
    await expect(reopenedInspector.getByRole("button", { name: "XY slice", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(reopenedInspector.getByRole("combobox", { name: "Complex overlay mode" }))
      .toHaveValue("phase-contours");
    await expect(reopenedInspector.getByLabel("Slice physical coordinate"))
      .toHaveValue(String(saved.sliceCoordinates[2]));
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-contour-provenance"))
      .toContainText("imaginary:", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-field-probe"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-region-summary"))
      .toContainText("magnitude", { timeout: 60_000 });
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    if (await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-dock-reset-recommended").click();
    const graphInspector = page.getByRole("complementary", { name: "Graph inspector" });
    await expect(graphInspector.getByTestId("graph2d-combined-intersection"))
      .toContainText("row curl-magnitude", { timeout: 60_000 });
    await graphInspector.getByTestId("graph2d-open-intersection").click();
    await expect(reopened.getByTestId("scientific-region-graph-focus-intersection"))
      .toBeVisible({ timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-intersection-summary"))
      .toContainText("curl-magnitude", { timeout: 60_000 });
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    await expect(graphInspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("complex-phase", { timeout: 60_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(5);
    for (const label of [/Select Vector speed region mean/, /Select .*Potential.* region mean/,
      /Select .*Wave amplitude.* magnitude region mean/,
      /Select .*Wave amplitude.* phase region mean/, /Select Vector divergence region mean/,
      /Select Vector curl magnitude region mean/]) {
      await page.getByRole("button", { name: label }).click();
      const selection = graphInspector.getByTestId("graph2d-combined-region-selection");
      await expect(selection).toContainText("complex-phase", { timeout: 60_000 });
      await expect(selection).toContainText("rad");
      await graphInspector.getByRole("combobox", { name: "Linked region column" })
        .selectOption("8");
      await expect(selection).toContainText("columns 9–9");
      await expect(page.getByTestId("graph2d-linked-region-highlight")
        .locator("circle[data-graph2d-linked-region-series]"))
        .not.toHaveCount(0);
    }
    await graphInspector.getByRole("spinbutton", { name: "Linked region interval from" })
      .fill("-0.5");
    await graphInspector.getByRole("spinbutton", { name: "Linked region interval to" })
      .fill("0.5");
    await expect(graphInspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("8/8 columns available");
    await expect(page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]"))
      .not.toHaveCount(0);
    await expect(page.getByTestId("graph2d-linked-region-band")).toHaveCount(2);
    await graphInspector.getByTestId("graph2d-open-region-interval").click();
    await expect(reopened.getByTestId("scientific-region-graph-focus-marker"))
      .toBeVisible({ timeout: 60_000 });
    const sharedFocus = reopened.getByTestId("scientific-combined-region-graph-focus");
    await expect(sharedFocus).toContainText("vector", { timeout: 60_000 });
    await expect(sharedFocus).toContainText("scalar");
    await expect(sharedFocus).toContainText("complex-magnitude");
    await expect(sharedFocus).toContainText("complex-phase");
    await expect(sharedFocus).toContainText("divergence");
    await expect(sharedFocus).toContainText("curl-magnitude");
    await reopenedFigure.getByRole("button", { name: "Select Graphs row strip" }).click();
    await reopenedFigure.locator('[data-probe-cell="10-9"]').click();
    await reopenedFigure.locator('[data-probe-cell="10-12"]').click();
    await expect(graphInspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("rows available", { timeout: 60_000 });
    await expect(graphInspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("curl-magnitude");
    await expect(page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").first()).toBeVisible();
    await graphInspector.getByTestId("graph2d-open-region-interval").click();
    await expect(reopened.getByTestId("scientific-region-graph-focus-row-marker"))
      .toBeVisible({ timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-region-graph-focus"))
      .toContainText("Selected rows");
    await expect(reopened.getByTestId("scientific-combined-region-graph-focus"))
      .toContainText("curl-magnitude");
    const imaginaryFile = join(complex, "imaginary.f64");
    const changed = Buffer.from(await readFile(imaginaryFile));
    changed[0] ^= 1;
    await writeFile(imaginaryFile, changed);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-complex-overlay-status"))
      .toContainText(/withheld.*integrity|withheld.*checksum|withheld.*changed/i,
        { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-phase-contours")).toHaveCount(0);
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-complex-point"))
      .toContainText("withheld", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-scalar-region"))
      .toContainText("Potential", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-combined-complex-region"))
      .toContainText("withheld", { timeout: 60_000 });
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    if (!await projects.isVisible()) await page.getByTestId("projects-toggle")
      .click({ noWaitAfter: true });
    if (!await projects.isVisible()) await page.getByRole("button", { name: "Quick panel" })
      .click();
    await expect(projects).toBeVisible();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    if (!await projects.getByTestId("project-dashboard").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-results").click();
    const outputs = projects.getByTestId("project-results-browser");
    await outputs.getByTestId(`project-result-select-${combinedResult.resultId}`).click();
    await expect(outputs.getByTestId("project-combined-vector"))
      .toContainText("count", { timeout: 60_000 });
    await expect(outputs.getByTestId("project-combined-scalar"))
      .toContainText("count");
    await expect(outputs.getByTestId("project-combined-divergence"))
      .toContainText("count");
    await expect(outputs.getByTestId("project-combined-curlMagnitude"))
      .toContainText("count");
    await expect(outputs.getByTestId("project-combined-complexMagnitude"))
      .toContainText("values withheld (changed)");
    await expect(outputs.getByTestId("project-combined-complexPhase"))
      .toContainText("values withheld (changed)");
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(page.getByTestId("graph2d-plot").locator("path[data-graph2d-path][d^='M']"))
      .toHaveCount(8, { timeout: 60_000 });
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" })
      .getByTestId("graph2d-shared-region-withheld"))
      .toContainText("complex-phase", { timeout: 60_000 });
    await expect(page.getByTestId("graph2d-linked-region-highlight")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-contour-overlay-"))
      throw new Error("Unsafe contour-overlay fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 Burgers six-profile selection withholds a changed source after Project reopen", async () => {
  test.setTimeout(480_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-burgers-four-region-"));
  const burgers = join(root, "burgers.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), burgers,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, burgers);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await explorer.getByRole("button", { name: "XY slice", exact: true }).click();
    await explorer.getByLabel("Slice physical coordinate").selectOption({ index: 0 });
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await explorer.getByRole("button", { name: "Show this scalar as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-scalar-overlay-status"))
      .toContainText("Verified scalar samples", { timeout: 60_000 });
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    await explorer.getByRole("button", { name: "Show this complex field as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-complex-overlay-status"))
      .toContainText("Verified real", { timeout: 60_000 });
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    const region = figure.getByTestId("scientific-overlay-region");
    await region.getByRole("button", { name: "Select rectangular region" }).click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await figure.locator('[data-probe-cell="20-20"]').click();
    await expect(figure.getByTestId("scientific-combined-region-summary"))
      .toContainText("magnitude 289/289", { timeout: 60_000 });
    await expect(figure.getByTestId("scientific-combined-divergence-region"))
      .toContainText(/289\/289 samples \(0 gaps\).*1\/s/, { timeout: 60_000 });
    await expect(figure.getByTestId("scientific-combined-curl-region"))
      .toContainText(/289\/289 samples \(0 gaps\).*1\/s/);
    await region.getByTestId("scientific-region-publish").click();
    await expect(region.getByTestId("scientific-region-saved-status"))
      .toContainText("divergence source-current, curl magnitude source-current",
        { timeout: 60_000 });
    await region.getByTestId("send-linked-region-to-graphs").click();
    await expect(explorer).toContainText("Sent vector speed, scalar Q, complex magnitude, phase, divergence and curl magnitude profiles",
      { timeout: 60_000 });
    await region.getByTestId("send-linked-region-rows-to-graphs").click();
    await expect(explorer).toContainText("Sent vector speed, scalar Q, complex magnitude, phase, divergence and curl magnitude row profiles",
      { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await region.getByRole("button", { name: "Select Graphs row strip" })
      .click({ force: true });
    await figure.locator('[data-probe-cell="16-14"]').click();
    await figure.locator('[data-probe-cell="16-18"]').click();
    const inspector = page.getByRole("complementary", { name: "Graph inspector" });
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("rows available", { timeout: 60_000 });
    await inspector.getByTestId("graph2d-open-region-point").click();
    const subFigure = explorer.getByRole("figure", { name: "XY field slice" });
    await subFigure.getByTestId("scientific-select-graphs-subrectangle")
      .click({ force: true, timeout: 120_000 });
    await expect(subFigure.getByTestId("scientific-select-graphs-subrectangle"))
      .toHaveAttribute("aria-pressed", "true", { timeout: 120_000 });
    await subFigure.locator('[data-probe-cell="14-14"]').click();
    await subFigure.locator('[data-probe-cell="18-18"]').click();
    await expect(subFigure.getByTestId("scientific-subrectangle-preview"))
      .toContainText("Proposed physical bounds");
    await subFigure.getByTestId("scientific-confirm-graphs-subrectangle").click();
    await expect(inspector.getByTestId("graph2d-combined-intersection"))
      .toContainText("row curl-magnitude", { timeout: 60_000 });
    await inspector.getByTestId("graph2d-open-intersection").click();
    await expect(explorer.getByTestId("scientific-combined-intersection-summary"))
      .toBeVisible({ timeout: 60_000 });
    await explorer.getByTestId("scientific-publish-combined-subrectangle").click();
    await expect(explorer.getByTestId("scientific-combined-subrectangle-saved-status"))
      .toContainText("curl magnitude source-current", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const savedIntersection = stored.workspace.entries.find((entry: { checkpoint: {
      format: string } }) => entry.checkpoint.format === "math3d.graph2d-document")
      ?.checkpoint.selection.linkedRegionIntersection;
    expect(savedIntersection.kind).toBe("combined-region-intersection/v1");
    expect(savedIntersection.bounds).toHaveLength(2);
    const published = stored.workspace.results.find((item: { provenance: {
      operation: { type: string } } }) => item.provenance.operation.type ===
      "vector3d.linked-region-combined");
    const subrectangleResult = stored.workspace.results.find((item: { provenance: {
      operation: { type: string } } }) => item.provenance.operation.type ===
      "vector3d.combined-subrectangle");
    expect(subrectangleResult.summary.sampleCount).toBeGreaterThan(0);
    expect(subrectangleResult.provenance.operation.parameters.profiles.columnRowsSha256)
      .toHaveLength(6);
    expect(subrectangleResult.provenance.operation.parameters.profiles.rowRowsSha256)
      .toHaveLength(6);
    expect(JSON.stringify(subrectangleResult)).not.toContain('"cells"');
    const savedRows = stored.workspace.entries.flatMap((entry: { checkpoint: {
      source?: { objects?: { linkedOrigin?: { kind: string; series: string;
        profileAxis?: number; vectorSamples?: unknown[]; derivedSamples?: unknown[];
        rowsSha256?: string } }[] } } }) =>
      entry.checkpoint.source?.objects?.filter(object => object.linkedOrigin?.kind ===
        "vector-scalar-complex-curl-row-linked-region/v5") ?? []);
    expect(savedRows).toHaveLength(6);
    expect(savedRows.map((item: { linkedOrigin: { series: string } }) =>
      item.linkedOrigin.series)).toEqual(["vector", "scalar", "complex-magnitude",
      "complex-phase", "divergence", "curl-magnitude"]);
    expect(savedRows.every((item: { linkedOrigin: { profileAxis: number;
      vectorSamples: unknown[]; derivedSamples: unknown[]; rowsSha256: string } }) =>
      item.linkedOrigin.profileAxis === 1 && item.linkedOrigin.vectorSamples.length === 3 &&
      item.linkedOrigin.derivedSamples.length === 3 &&
      /^sha256:[a-f0-9]{64}$/.test(item.linkedOrigin.rowsSha256))).toBe(true);
    expect(published.provenance.operation.algorithmVersion).toBe("17x17-v4");
    expect(published.summary.divergenceUnit).toBe("1/s");
    expect(published.summary.curlMagnitudeUnit).toBe("1/s");
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await explorer.isVisible()) {
      await expect(explorer.getByTestId("scientific-combined-divergence-region"))
        .toContainText("1/s", { timeout: 90_000 });
      await expect(explorer.getByTestId("scientific-combined-curl-region"))
        .toContainText("1/s");
      await explorer.getByRole("button", { name: "Back to Graphs" })
        .click({ timeout: 60_000 });
    }
    if (await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("m/s", { timeout: 60_000 });
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("complex-phase");
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("columns available");
    await expect(inspector.getByTestId("graph2d-combined-region-selection"))
      .toContainText("curl-magnitude");
    await expect(inspector.getByTestId("graph2d-combined-intersection"))
      .toContainText("column divergence", { timeout: 60_000 });
    await expect(inspector.getByTestId("graph2d-combined-intersection"))
      .toContainText("row curl-magnitude");
    await inspector.getByTestId("graph2d-open-intersection").click();
    await expect(explorer.getByTestId("scientific-region-graph-focus-intersection"))
      .toBeVisible({ timeout: 60_000 });
    await expect(explorer.getByTestId("scientific-combined-intersection-summary"))
      .toContainText("curl-magnitude", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(5);
    const tile = join(burgers, "vx.f64");
    const changed = Buffer.from(await readFile(tile));
    changed[0] ^= 1;
    await writeFile(tile, changed);
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await explorer.isVisible()) {
      await expect(explorer.getByTestId("scientific-region-saved-status"))
        .toContainText("divergence changed, curl magnitude changed", { timeout: 60_000 });
      await expect(explorer.getByTestId("scientific-combined-divergence-region"))
        .toContainText("withheld", { timeout: 60_000 });
      await expect(explorer.getByTestId("scientific-combined-curl-region"))
        .toContainText("withheld");
      await expect(explorer.getByTestId("scientific-combined-scalar-region"))
        .toContainText("289/289 samples");
      await expect(explorer.getByTestId("scientific-combined-complex-region"))
        .toContainText("magnitude 289/289 samples");
      await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    }
    if (await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect(inspector.getByTestId("graph2d-shared-region-withheld"))
      .toContainText("vector", { timeout: 60_000 });
    await expect(inspector.getByTestId("graph2d-shared-region-withheld"))
      .toContainText("all 6 sources and point tables");
    await expect(inspector.getByTestId("graph2d-intersection-withheld"))
      .toContainText("twelve", { timeout: 60_000 });
    await expect(page.getByTestId("graph2d-linked-region-highlight")).toHaveCount(0);
    await page.getByRole("button", { name: "Select Vector speed region mean", exact: true }).click();
    await expect(inspector.getByTestId("graph2d-shared-region-withheld"))
      .toContainText("divergence");
    await expect(inspector.getByTestId("graph2d-shared-region-withheld"))
      .toContainText("curl-magnitude");
    await expect(inspector.getByTestId("graph2d-shared-region-withheld"))
      .toContainText(/changed|integrity|checksum/i);
    await expect(page.getByTestId("graph2d-linked-region-highlight")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-burgers-four-region-"))
      throw new Error("Unsafe Burgers four-region fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-06 vector-only rectangle publishes and withholds a changed source", async () => {
  test.setTimeout(600_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-derived-region-"));
  const burgers = join(root, "burgers.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), burgers,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, burgers);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.getByRole("button", { name: "XY slice", exact: true }).click();
    await explorer.getByLabel("Slice physical coordinate").selectOption({ index: 0 });
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    const region = figure.getByTestId("vector-derived-region");
    await region.getByRole("button", { name: "Select vector rectangle" }).click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await figure.locator('[data-probe-cell="20-20"]').click();
    await expect(region.getByTestId("vector-derived-region-summary"))
      .toContainText("Curl magnitude: 289/289 samples (0 gaps)", { timeout: 90_000 });
    await expect(region.getByTestId("vector-derived-region-summary"))
      .toContainText("Divergence: 289/289 samples (0 gaps)");
    await region.getByRole("button", { name: "Publish vector region to Project" }).click();
    await expect(explorer).toContainText("Published vector speed, divergence and curl magnitude region statistics",
      { timeout: 90_000 });
    await region.getByRole("button", { name: "Send three vector profiles to Graphs" }).click();
    await expect(explorer).toContainText("Sent 17 aligned vector speed, divergence and curl magnitude column means",
      { timeout: 90_000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    const graphInspector = page.getByRole("complementary", { name: "Graph inspector" });
    for (const label of ["Vector speed region mean", "Vector divergence region mean",
      "Vector curl magnitude region mean"]) {
      await page.getByRole("button", { name: `Select ${label}` }).click();
      await expect(graphInspector.getByTestId("graph2d-vector-region-columns"))
        .toContainText("1/s", { timeout: 90_000 });
    }
    await graphInspector.getByRole("combobox", { name: "Vector region column" })
      .selectOption("8");
    await graphInspector.getByTestId("graph2d-open-vector-region-point").click();
    await expect(explorer.getByRole("figure", { name: "XY field slice" }))
      .toBeVisible({ timeout: 90_000 });
    await expect(explorer.getByTestId("scientific-vector-region-graph-focus"))
      .toContainText("columns 9–9", { timeout: 90_000 });
    await expect(explorer.getByTestId("scientific-vector-region-graph-focus"))
      .toContainText("curl-magnitude: 1/1 columns available", { timeout: 90_000 });
    await expect(explorer.getByTestId("scientific-region-graph-focus-marker"))
      .toBeVisible();
    const returnRegion = figure.getByTestId("vector-derived-region");
    await returnRegion.getByRole("button", { name: "Select Graphs vector column" }).click();
    await figure.locator('[data-probe-cell="16-16"]').click();
    await expect(graphInspector.getByTestId("graph2d-vector-region-columns"))
      .toContainText("1/s", { timeout: 90_000 });
    await expect(page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]"))
      .toHaveCount(3, { timeout: 90_000 });
    await graphInspector.getByTestId("graph2d-open-vector-region-point").click();
    await expect(explorer.getByTestId("scientific-vector-region-graph-focus"))
      .toContainText("columns", { timeout: 90_000 });
    await returnRegion.getByRole("button", { name: "Select Graphs vector strip" }).click();
    await figure.locator('[data-probe-cell="14-16"]').click();
    await figure.locator('[data-probe-cell="18-16"]').click();
    await expect(graphInspector.getByTestId("graph2d-vector-region-columns"))
      .toContainText("Physical columns", { timeout: 90_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(3);
    await page.getByRole("button", { name: "Select Vector divergence region mean" }).click();
    await graphInspector.getByRole("spinbutton", { name: "Vector region interval from" })
      .fill(String(Number(await graphInspector.getByRole("spinbutton",
        { name: "Vector region interval from" }).inputValue()) + 0.001));
    await graphInspector.getByTestId("graph2d-open-vector-region-interval").click();
    await expect(explorer.getByTestId("scientific-vector-region-graph-focus"))
      .toContainText("divergence:", { timeout: 90_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("projects-toggle").click({ noWaitAfter: true });
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const result = stored.workspace.results.find((item: { provenance: { operation: {
      type: string } } }) => item.provenance.operation.type === "vector3d.derived-region");
    expect(result.summary.vectorUnit).toBe("m/s");
    expect(result.summary.divergenceUnit).toBe("1/s");
    expect(result.summary.curlMagnitudeUnit).toBe("1/s");
    expect(result.provenance.operation.parameters.vectorSamples).toHaveLength(3);
    expect(result.provenance.operation.parameters.derivedSamples).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('"values"');
    const tile = join(burgers, "vx.f64");
    const changed = Buffer.from(await readFile(tile));
    changed[0] ^= 1;
    await writeFile(tile, changed);
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    if (!await projects.getByTestId("project-dashboard").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-results").click();
    const outputs = projects.getByTestId("project-results-browser");
    await outputs.getByTestId(`project-result-select-${result.resultId}`).click();
    for (const field of ["vector", "divergence", "curlMagnitude"])
      await expect(outputs.getByTestId(`project-vector-derived-${field}`))
        .toContainText("values withheld (changed)", { timeout: 90_000 });
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await explorer.isVisible())
      await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    if (await projects.isVisible())
      await page.getByTestId("projects-toggle").click({ noWaitAfter: true });
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    await expect(page.getByRole("complementary", { name: "Graph inspector" })
      .getByLabel("Source and sampling details"))
      .toContainText(/integrity|checksum|changed/i, { timeout: 90_000 });
    await expect(graphInspector.getByTestId("graph2d-vector-region-withheld"))
      .toContainText(/changed|integrity|checksum/i, { timeout: 90_000 });
    await expect(page.getByTestId("graph2d-plot")
      .locator("path[data-graph2d-path][d^='M']")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("m3d-vector-derived-region-"))
      throw new Error("Unsafe vector-derived fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 vector-only rows and subrectangle reverify a changed source", async () => {
  test.setTimeout(480_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-row-region-"));
  const scene = join(root, "vortex.sscene");
  await cp(resolve("examples/scientific-scenes/vortex-volume.sscene"), scene,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, scene);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.getByRole("button", { name: "XY slice", exact: true }).click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    const region = figure.getByTestId("vector-derived-region");
    await region.getByRole("button", { name: "Select vector rectangle" }).click();
    await figure.locator('[data-probe-cell="7-7"]').click();
    await figure.locator('[data-probe-cell="13-13"]').click();
    await expect(region.getByTestId("vector-derived-region-summary"))
      .toContainText("Divergence:", { timeout: 60_000 });
    await region.getByRole("button", { name: "Send three vector row profiles to Graphs" }).click();
    await expect(explorer).toContainText("Sent 17 aligned vector speed, divergence and curl magnitude row means",
      { timeout: 60_000 });
    await region.getByRole("button", { name: "Send three vector profiles to Graphs" }).click();
    await expect(explorer).toContainText("Sent 17 aligned vector speed, divergence and curl magnitude column means",
      { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" })
      .click({ noWaitAfter: true });
    await page.getByTestId("workspace-dock-reset-recommended").click();
    const inspector = page.getByRole("complementary", { name: "Graph inspector" });
    await page.getByRole("button", { name: "Select Vector speed region row mean" }).click();
    await expect(inspector.getByTestId("graph2d-vector-region-selection"))
      .toContainText("17 physical rows", { timeout: 60_000 });
    await inspector.getByRole("combobox", { name: "Vector region row" })
      .selectOption("8");
    await inspector.getByTestId("graph2d-open-vector-region-point").click();
    await expect(explorer.getByTestId("scientific-vector-region-graph-focus"))
      .toContainText("rows 9–9", { timeout: 60_000 });
    await expect(figure.getByTestId("scientific-region-graph-focus-row-marker"))
      .toBeVisible();
    await region.getByRole("button", { name: "Select Graphs vector row strip" }).click();
    await figure.locator('[data-probe-cell="10-8"]').click();
    await figure.locator('[data-probe-cell="10-12"]').click();
    await expect(inspector.getByTestId("graph2d-vector-region-columns"))
      .toContainText("Physical rows", { timeout: 60_000 });
    await expect(inspector.getByTestId("graph2d-vector-region-columns"))
      .toContainText("m/s");
    await expect(inspector.getByTestId("graph2d-vector-region-columns"))
      .toContainText("1/s");
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]").count())
      .toBeGreaterThan(3);
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    const intersectionForm = inspector.getByTestId("graph2d-vector-intersection-controls");
    await expect(intersectionForm).toBeVisible({ timeout: 60_000 });
    for (const axis of [1, 2]) {
      const from = intersectionForm.getByLabel(`Vector subrectangle axis ${axis} from`);
      const to = intersectionForm.getByLabel(`Vector subrectangle axis ${axis} to`);
      const lower = Number(await from.inputValue()), upper = Number(await to.inputValue());
      await from.fill(String(lower + (upper - lower) * 0.25));
      await to.fill(String(lower + (upper - lower) * 0.75));
    }
    await intersectionForm.getByRole("button", { name: "Link vector subrectangle" }).click();
    await expect(inspector.getByTestId("graph2d-vector-intersection"))
      .toContainText("Linked vector subrectangle", { timeout: 60_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("rect").count()).toBe(2);
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]")
      .evaluateAll(nodes => new Set(nodes.map(node =>
        node.getAttribute("data-graph2d-linked-region-series"))).size)).toBe(6);
    await inspector.getByTestId("graph2d-open-vector-intersection").click();
    await expect(figure.getByTestId("scientific-region-graph-focus-intersection"))
      .toBeVisible({ timeout: 60_000 });
    await expect(region.getByTestId("scientific-vector-intersection-summary"))
      .toContainText("curl-magnitude", { timeout: 60_000 });
    await expect(region.getByTestId("scientific-vector-intersection-summary"))
      .toContainText("1/s");
    await figure.getByTestId("scientific-select-vector-subrectangle").click();
    await figure.locator('[data-probe-cell="0-0"]').click();
    await expect(region.getByTestId("scientific-vector-subrectangle-error"))
      .toContainText("inside the saved physical rectangle");
    await figure.locator('[data-probe-cell="9-9"]').click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await expect(region.getByTestId("scientific-vector-subrectangle-preview"))
      .toContainText("Proposed physical bounds");
    await expect(region.getByTestId("scientific-vector-subrectangle-cells"))
      .toContainText("Selected profile cells:");
    await expect(figure.getByTestId("scientific-subrectangle-proposal-marker"))
      .toBeVisible();
    await region.getByTestId("scientific-confirm-vector-subrectangle").click();
    await expect(inspector.getByTestId("graph2d-vector-intersection"))
      .toContainText("Linked vector subrectangle", { timeout: 60_000 });
    await expect.poll(() => page.getByTestId("graph2d-linked-region-highlight")
      .locator("circle[data-graph2d-linked-region-series]")
      .evaluateAll(nodes => new Set(nodes.map(node =>
        node.getAttribute("data-graph2d-linked-region-series"))).size)).toBe(6);
    await inspector.getByTestId("graph2d-open-vector-intersection").click();
    await expect(region.getByTestId("scientific-vector-intersection-summary"))
      .toBeVisible({ timeout: 60_000 });
    await region.getByTestId("scientific-publish-vector-subrectangle").click();
    await expect(region.getByTestId("scientific-vector-subrectangle-saved-status"))
      .toContainText("statistics reverified", { timeout: 60_000 });
    await page.getByTestId("projects-toggle").click({ noWaitAfter: true });
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(JSON.stringify(stored)).not.toContain("columnProfiles");
    const savedSubrectangle = stored.workspace.results.find((result: {
      provenance: { operation: { type: string } } }) =>
      result.provenance.operation.type === "vector3d.derived-subrectangle");
    expect(savedSubrectangle.summary.sampleCount).toBeGreaterThan(0);
    expect(savedSubrectangle.provenance.operation.parameters.profiles.columnRowsSha256)
      .toHaveLength(3);
    expect(savedSubrectangle.provenance.operation.parameters.profiles.rowRowsSha256)
      .toHaveLength(3);
    expect(JSON.stringify(savedSubrectangle)).not.toContain('"cells"');
    const savedIntersection = stored.workspace.entries.find((entry: {
      checkpoint: { format: string } }) => entry.checkpoint.format ===
      "math3d.graph2d-document")?.checkpoint.selection.linkedRegionIntersection;
    expect(savedIntersection.kind).toBe("vector-region-intersection/v1");
    expect(savedIntersection.bounds).toHaveLength(2);
    const tile = join(scene, "east.f64");
    const changed = Buffer.from(await readFile(tile));
    changed[0] ^= 1;
    await writeFile(tile, changed);
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    if (!await projects.getByTestId("project-dashboard").isVisible()) {
      await expect(projects.getByTestId("project-gallery-layout-toggle"))
        .toHaveAttribute("title", "Project details", { timeout: 60_000 });
      await projects.getByTestId("project-gallery-layout-toggle")
        .click({ force: true, noWaitAfter: true });
    }
    await expect(projects.getByTestId("project-dashboard"))
      .toBeVisible({ timeout: 60_000 });
    await projects.getByTestId("project-detail-tab-results").click();
    const outputs = projects.getByTestId("project-results-browser");
    await outputs.getByTestId(`project-result-select-${savedSubrectangle.resultId}`).click();
    for (const field of ["vector", "divergence", "curlMagnitude"])
      await expect(outputs.getByTestId(`project-vector-derived-${field}`))
        .toContainText("values withheld (changed)", { timeout: 90_000 });
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await explorer.isVisible())
      await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    if (await projects.isVisible())
      await page.getByTestId("projects-toggle").click({ noWaitAfter: true });
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: "Select Vector speed region mean" }).click();
    await expect(inspector.getByTestId("graph2d-vector-intersection-withheld"))
      .toContainText("Subrectangle withheld", { timeout: 60_000 });
    await expect(inspector.getByTestId("graph2d-vector-region-withheld"))
      .toContainText(/changed|integrity|checksum/i);
    await expect(page.getByTestId("graph2d-linked-region-highlight")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("m3d-vector-row-region-"))
      throw new Error("Unsafe vector row fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 complex heatmaps align with vector slices, probe and rectangle", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await examples.getByRole("button", { name: /Swirling flow/ }).click();
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    await explorer.getByRole("button", { name: "Show this complex field as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-complex-overlay-status"))
      .toContainText("Verified real", { timeout: 60_000 });
    let figure = explorer.getByRole("figure", { name: "XY field slice" });
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("real:");
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("imaginary:");
    await figure.locator('[data-probe-cell="12-12"]').click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("imaginary:", { timeout: 60_000 });
    let linked = figure.getByTestId("scientific-linked-overlay-profile");
    await linked.getByRole("button", { name: "Link line through shared probe" }).click();
    await expect(linked).toContainText("complex samples", { timeout: 60_000 });
    await expect(linked).toContainText("Real ");
    await expect(linked).toContainText("imaginary ");
    await expect(linked.getByTestId("send-linked-overlay-line-to-graphs")).toBeVisible();
    const region = figure.getByTestId("scientific-overlay-region");
    await region.getByRole("button", { name: "Select rectangular region" }).click();
    await figure.locator('[data-probe-cell="9-9"]').click();
    await figure.locator('[data-probe-cell="15-15"]').click();
    await expect(region.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Complex field outside selected area:");
    await expect(figure.getByTestId("vector-field3d-slice-crosshair")).toBeVisible();
    await expect(figure.getByTestId("scientific-overlay-region-marker")).toBeVisible();
    await explorer.getByRole("combobox", { name: "Complex overlay mode" }).selectOption("phase");
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("rad");
    await expect(region.getByTestId("scientific-overlay-region-summary"))
      .toContainText("(rad)");
    await expect(linked).toContainText("(rad)");
    for (const plane of ["XZ", "YZ"] as const) {
      await explorer.getByRole("button", { name: `${plane} slice` }).click();
      await explorer.getByRole("button", { name: "Preview slice" }).click();
      figure = explorer.getByRole("figure", { name: `${plane} field slice` });
      await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
        .toContainText("Complex", { timeout: 60_000 });
      await expect(figure.getByTestId("scientific-slice-overlay-status"))
        .toContainText("Partial complex domain overlap");
      linked = figure.getByTestId("scientific-linked-overlay-profile");
      await linked.getByRole("button", { name: "Link line through shared probe" }).click();
      await linked.getByRole("combobox", { name: "Linked line direction" }).selectOption("2");
      await expect(linked).toContainText("Gaps mark positions outside a field", { timeout: 60_000 });
      await expect(linked).toContainText("(rad)");
    }
    await examples.getByRole("button", { name: /Generated vortex/ }).click();
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    await explorer.getByRole("button", { name: "Show this complex field as overlay on vector slices" }).click();
    await expect(explorer.getByRole("figure", { name: "XY field slice" })
      .getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("1024/1024 cells", { timeout: 60_000 });
    figure = explorer.getByRole("figure", { name: "XY field slice" });
    await figure.locator('[data-probe-cell="16-16"]').click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    linked = figure.getByTestId("scientific-linked-overlay-profile");
    await linked.getByRole("button", { name: "Link line through shared probe" }).click();
    await linked.getByTestId("send-linked-overlay-line-to-graphs").click();
    await expect(explorer.getByTestId("vector-field3d-run-status"))
      .toContainText("aligned vector and complex samples", { timeout: 60_000 });
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 2 && paths.every(path => !!path.getAttribute("d"))))
      .toBe(true);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 Burgers and complex heatmap reverify after Project reopen and reject tampering", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-complex-overlay-"));
  const burgers = join(root, "burgers.sscene"), complex = join(root, "complex.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), burgers,
    { recursive: true });
  await cp(resolve("examples/scientific-scenes/complex-wave-volume.sscene"), complex,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, burgers);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.getByRole("button", { name: "XY slice" }).click();
    await explorer.getByLabel("Slice physical coordinate").selectOption({ index: 0 });
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, complex);
    const library = explorer.getByRole("region", { name: "Dataset library" });
    await library.getByRole("button", { name: "Browse scientific scene" }).click();
    await library.getByRole("button", { name: "Open Wave amplitude from dataset library" }).click();
    await explorer.getByRole("button", { name: "Show this complex field as overlay on vector slices" }).click();
    await expect(explorer.getByTestId("scientific-complex-overlay-status"))
      .toContainText("Verified real", { timeout: 60_000 });
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    await expect(figure.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("imaginary:");
    await explorer.getByRole("combobox", { name: "Complex overlay mode" }).selectOption("phase");
    await figure.locator('[data-probe-cell="12-12"]').click();
    await explorer.getByRole("button", { name: "Preview slice" }).click();
    const linked = figure.getByTestId("scientific-linked-overlay-profile");
    await linked.getByRole("button", { name: "Link line through shared probe" }).click();
    await expect(linked).toContainText("complex samples", { timeout: 60_000 });
    await linked.getByTestId("send-linked-overlay-line-to-graphs").click();
    await expect(explorer.getByTestId("vector-field3d-run-status"))
      .toContainText("aligned vector and complex samples", { timeout: 60_000 });
    const region = figure.getByTestId("scientific-overlay-region");
    await region.getByRole("button", { name: "Select rectangular region" }).click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await figure.locator('[data-probe-cell="20-20"]').click();
    await expect(region.getByTestId("scientific-overlay-region-summary"))
      .toContainText("Complex field outside selected area:");
    await explorer.getByRole("button", { name: "Save document" }).click();
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 2 && paths.every(path => !!path.getAttribute("d"))))
      .toBe(true);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const graphEntry = stored.workspace.entries.find((entry: { module: string }) =>
      entry.module === "graph2d");
    const graphObjects = [...(graphEntry.replay?.payload?.transactions ?? [])].reverse()
      .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
        transaction.commands[0]?.command.payload.source?.objects)
      .find((value: unknown) => Array.isArray(value)) ?? graphEntry.checkpoint.source.objects;
    const linkedGraphObjects = graphObjects.filter((item: { linkedOrigin?: unknown }) => item.linkedOrigin);
    expect(linkedGraphObjects).toHaveLength(2);
    expect(linkedGraphObjects.map((item: { linkedOrigin: { series: string } }) => item.linkedOrigin.series))
      .toEqual(["vector", "complex"]);
    expect(linkedGraphObjects[0].linkedOrigin.vectorSamples).toHaveLength(3);
    expect(JSON.parse(linkedGraphObjects[0].linkedOrigin.vectorDocumentJson).source.field.references)
      .toHaveLength(3);
    expect(linkedGraphObjects[0].linkedOrigin.realReference.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(linkedGraphObjects[0].linkedOrigin.imaginaryReference.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(linkedGraphObjects[0].linkedOrigin.realSampleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(linkedGraphObjects[0].linkedOrigin.imaginarySampleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(linkedGraphObjects[0].linkedOrigin.mode).toBe("phase");
    const saved = stored.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d")?.checkpoint.workspace;
    expect(saved.complexOverlay.mode).toBe("phase");
    expect(saved.complexOverlay.real.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.complexOverlay.imaginary.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.linkedLineProfile.point).toHaveLength(3);
    expect(saved.linkedLineProfile.normalAxis).toBe(2);
    expect(saved.overlayRegion.bounds).toHaveLength(2);
    expect(JSON.stringify(saved.complexOverlay)).not.toContain("values");
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 2 && paths.every(path => !!path.getAttribute("d"))))
      .toBe(true);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const reopened = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(reopened.getByTestId("scientific-complex-overlay-status"))
      .toContainText("Verified real", { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("imaginary:");
    await expect(reopened.getByTestId("scientific-overlay-region-summary"))
      .toContainText("(rad)");
    await expect(reopened.getByTestId("scientific-linked-overlay-profile"))
      .toContainText("complex samples");
    const imaginaryFile = join(complex, "imaginary.f64");
    const originalImaginary = await readFile(imaginaryFile), changedImaginary = Buffer.from(originalImaginary);
    changedImaginary[0] ^= 1;
    await writeFile(imaginaryFile, changedImaginary);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-complex-overlay-status"))
      .toContainText(/withheld.*integrity|withheld.*checksum|withheld.*changed/i,
        { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance")).toHaveCount(0);
    await expect(reopened.getByTestId("scientific-overlay-region-summary")).toHaveCount(0);
    await expect(reopened.getByTestId("scientific-linked-overlay-profile"))
      .not.toContainText("complex samples");
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 2 && paths.every(path => !path.getAttribute("d"))))
      .toBe(true);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    await expect(reopened.getByTestId("scientific-complex-overlay-status"))
      .toContainText(/withheld.*integrity|withheld.*checksum|withheld.*changed/i,
        { timeout: 60_000 });
    await writeFile(imaginaryFile, originalImaginary);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance"))
      .toContainText("imaginary:", { timeout: 60_000 });
    const realFile = join(complex, "real.f64");
    const originalReal = await readFile(realFile), changedReal = Buffer.from(originalReal);
    changedReal[0] ^= 1;
    await writeFile(realFile, changedReal);
    await reopened.getByRole("button", { name: "Open saved document" }).click();
    await expect(reopened.getByTestId("scientific-complex-overlay-status"))
      .toContainText(/withheld.*integrity|withheld.*checksum|withheld.*changed/i,
        { timeout: 60_000 });
    await expect(reopened.getByTestId("scientific-slice-overlay-provenance")).toHaveCount(0);
    await expect(reopened.getByTestId("scientific-linked-overlay-profile"))
      .not.toContainText("complex samples");
    await writeFile(realFile, originalReal);
    await reopened.getByRole("button", { name: "Back to Graphs" }).click();
    const tile = join(burgers, "vx.f64"), originalTile = await readFile(tile);
    const changedTile = Buffer.from(originalTile); changedTile[0] ^= 1;
    await writeFile(tile, changedTile);
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await expect.poll(() => page.locator("[data-graph2d-path]").evaluateAll(paths =>
      paths.length === 2 && paths.every(path => !path.getAttribute("d"))))
      .toBe(true);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const changed = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(changed.getByRole("alert"))
      .toContainText(/integrity|checksum|changed/i, { timeout: 60_000 });
    await expect(changed.getByTestId("scientific-slice-overlay-provenance")).toHaveCount(0);
    await expect(changed.getByTestId("scientific-overlay-region-summary")).toHaveCount(0);
    await expect(changed.getByTestId("scientific-linked-overlay-profile"))
      .toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-complex-overlay-"))
      throw new Error("Unsafe complex-overlay fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 Burgers linked probe survives Project reopen with verified source", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.getByRole("region", { name: "Built-in scientific scenes" })
      .getByRole("button", { name: /Measured Burgers vortex/ }).click();
    const probe = explorer.getByTestId("scientific-explorer-cross-layer-probe");
    await probe.getByRole("button", { name: "Place at this field center" }).click();
    const point = await probe.getByText(/Physical point:/).textContent();
    await expect(explorer.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point", { timeout: 30000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(stored.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d")?.checkpoint.workspace.linkedProbe).toBeTruthy();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const reopened = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(reopened.getByTestId("scientific-explorer-cross-layer-probe"))
      .toContainText(point!);
    await expect(reopened.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("Verified linked point", { timeout: 30000 });
    await expect(reopened.getByTestId("scientific-explorer-linked-vector-probe"))
      .toContainText("burgers");
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 Project library rechecks multiple scene sources after reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "m3d-explorer-library-"));
  const scalar = join(root, "scalar.sscene"), complex = join(root, "complex.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/quadratic-volume.sscene"), scalar, { recursive: true });
  await cp(resolve("tests/fixtures/scientific-scene/complex-wave-volume.sscene"), complex, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const library = explorer.getByRole("region", { name: "Dataset library" });
    for (const folder of [scalar, complex]) {
      await app.app.evaluate(({ dialog }, selected) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
      }, folder);
      await library.getByRole("button", { name: "Browse scientific scene" }).click();
    }
    await expect(library).toContainText("Potential scalar");
    await expect(library).toContainText("Complex wave");
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(stored.workspace.scientificScenes).toHaveLength(2);
    expect(JSON.stringify(stored.workspace.scientificScenes)).not.toContain("values");
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const current = page.getByRole("region", { name: "Dataset library" });
    await expect(current).toContainText("Reference current");
    await current.getByRole("button", { name: "Open Potential from dataset library" }).click();
    await expect(page.getByTestId("scientific-explorer-field-layer")
      .getByRole("figure", { name: /Verified volume for Potential scalar/ })).toBeVisible();
    await page.getByRole("region", { name: "Scientific Field Explorer" })
      .getByRole("button", { name: "Back to Graphs" }).click();
    await rm(scalar, { recursive: true });
    const manifestPath = join(complex, "manifest.json");
    const changed = JSON.parse(await readFile(manifestPath, "utf8"));
    changed.title += " updated";
    const changedBytes = Buffer.from(JSON.stringify(changed));
    await writeFile(manifestPath, changedBytes);
    const bundlePath = join(complex, "bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.manifest.bytes = changedBytes.byteLength;
    bundle.manifest.sha256 = createHash("sha256").update(changedBytes).digest("hex");
    await writeFile(bundlePath, JSON.stringify(bundle));
    if (!await projects.getByTestId(`project-open-saved-${stored.identity.id}`).isVisible())
      await page.getByTestId("projects-toggle").click();
    await projects.getByTestId(`project-open-saved-${stored.identity.id}`).click();
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const reopened = page.getByRole("region", { name: "Dataset library" });
    await expect(reopened).toContainText("Source missing");
    await expect(reopened).toContainText("Source changed");
    await reopened.getByRole("searchbox", { name: "Search dataset library" }).fill("potential");
    await expect(reopened).toContainText("1 of 2 datasets");
    await expect(reopened).not.toContainText("Complex wave · Project scene");
    await expect(reopened.getByRole("button", { name: "Open Potential from dataset library" }))
      .toBeDisabled();
  } finally {
    await closeSurfaceApp(app);
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-02 reopens a saved scalar layer from the Explorer dataset library", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Quadratic potential volume" }).click();
    let importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importer.getByRole("button", { name: "View verified volume" }).click();
    await expect(importer.getByRole("figure", { name: /Verified volume for Potential scalar/ }))
      .toBeVisible();
    await importer.getByRole("button", { name: "Save field reference" }).click();
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Swirling flow volume" }).click();
    importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importer.getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const library = explorer.getByRole("region", { name: "Dataset library" });
    await expect(library).toContainText("Potential · scalar");
    await expect(library).toContainText("Velocity vector · Project scene");
    await expect(library.getByRole("button", { name: "Open Velocity from dataset library" }))
      .toBeDisabled();
    await library.getByRole("button", { name: /Open Potential · scalar from dataset library/ }).click();
    const layer = explorer.getByTestId("scientific-explorer-field-layer");
    await expect(layer.getByRole("figure", { name: /Verified volume for Potential scalar/ }))
      .toBeVisible();
    await layer.getByRole("button", { name: "Open field controls" }).click();
    const scalar = page.getByRole("dialog", { name: "Scientific field workspace" });
    await expect(scalar.getByRole("figure", { name: /Verified volume for Potential scalar/ }))
      .toBeVisible();
    await scalar.getByRole("button", { name: "Close" }).click();
    await expect(explorer).toBeVisible();
    await page.getByTestId("workspace-nav-surfaces").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const restoredLibrary = page.getByRole("region", { name: "Dataset library" });
    await expect(restoredLibrary).toContainText("Velocity vector · Project scene");
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [folder] }); },
    resolve("tests/fixtures/scientific-scene/quadratic-volume.sscene"));
    await restoredLibrary.getByRole("button", { name: "Browse scientific scene" }).click();
    await expect(restoredLibrary).toContainText("Potential scalar · Project scene");
    await restoredLibrary.getByRole("button", { name: "Open Potential from dataset library" }).click();
    await expect(page.getByTestId("scientific-explorer-field-layer")
      .getByRole("figure", { name: /Verified volume for Potential scalar/ })).toBeVisible();
    await restoredLibrary.getByRole("button", { name: "Back to vector layer" }).click();
    await expect(page.getByTestId("scientific-explorer-field-layer")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-02 reopens a saved complex layer from the Explorer dataset library", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Complex wave volume" }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importer.getByRole("region", { name: "3D complex field lines" })
      .getByRole("button", { name: "Save paired field to Project" }).click();
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Swirling flow volume" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const library = explorer.getByRole("region", { name: "Dataset library" });
    await expect(library).toContainText("3D complex field");
    await library.getByRole("button", { name: /Open .*3D complex field from dataset library/ }).click();
    const layer = explorer.getByTestId("scientific-explorer-field-layer");
    await expect(layer.getByRole("figure", { name: /Verified volume for .* real/ })).toBeVisible();
    await expect(layer.getByRole("figure", { name: /Verified volume for .* imaginary/ })).toBeVisible();
    await layer.getByRole("button", { name: "Open field controls" }).click();
    await expect(page.getByRole("dialog", { name: "3D complex field workspace" }))
      .toContainText("Both source components verified on this opening");
    await page.getByRole("dialog", { name: "3D complex field workspace" })
      .getByRole("button", { name: "Close" }).click();
    await expect(explorer).toBeVisible();
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

test("SCI-08 searches, classifies and saves a linked equilibrium in the desktop Explorer", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Equilibria", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Find equilibria" })).toBeFocused();
    await expect(editor.getByRole("button", { name: "Find equilibria" })).toBeInViewport();
    await editor.getByLabel("P(x,y,z)").fill("x");
    await editor.getByLabel("Q(x,y,z)").fill("2*y");
    await editor.getByLabel("R(x,y,z)").fill("3*z");
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    const results = editor.getByTestId("vector-field3d-equilibria");
    await expect(results).toContainText("Bounded scan · coverage incomplete");
    await results.getByRole("button", { name: /source at/ }).first().click();
    await expect(results).toContainText("Jacobian condition estimate");
    await results.getByRole("button", { name: "Save construction" }).first().click();
    await expect(editor.getByText(/Saved linked equilibria \(1\/32\)/)).toBeVisible();
    await editor.getByLabel("P(x,y,z)").fill("x-2*y");
    await editor.getByLabel("Q(x,y,z)").fill("2*x+y");
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    await results.getByRole("button", { name: /spiral-source at/ }).first().click();
    await expect(results).toContainText(/λ2 = .*i/);
    await expect(results).toContainText(/λ3 = .*i/);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-09 analytic sphere isosurface appears in the 3D Field Explorer", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByLabel("P(x,y,z)").fill("x");
    await editor.getByLabel("Q(x,y,z)").fill("y");
    await editor.getByLabel("R(x,y,z)").fill("z");
    await editor.getByLabel("Isosurface speed level").fill("1");
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    const surface = editor.getByTestId("vector-field3d-isosurface");
    await expect(surface).toContainText("complete within budget");
    await expect(surface).toContainText("no open boundary at the clipping box");
    await expect(surface).toContainText("0 boundary edges");
    await expect(surface).toContainText("0 nonmanifold edges");
    await expect(surface).toContainText("watertight");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toBeVisible();
    await app.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      (globalThis as typeof globalThis & { scientificIsosurfaceDownload?: string }).scientificIsosurfaceDownload = "";
      window.webContents.session.once("will-download", (_event, item) => {
        (globalThis as typeof globalThis & { scientificIsosurfaceDownload?: string }).scientificIsosurfaceDownload =
          item.getFilename();
        item.cancel();
      });
    });
    await surface.getByRole("button", { name: "Export mesh with provenance (.gltf)" }).click();
    await expect.poll(() => app.app.evaluate(() =>
      (globalThis as typeof globalThis & { scientificIsosurfaceDownload?: string })
        .scientificIsosurfaceDownload)).toBe("math3d-speed-isosurface.gltf");
  } finally { await closeSurfaceApp(app); }
});

test("SCI-09 measured Burgers speed isosurface exports verified tiles and rebuilds its Project Mesh", async () => {
  test.setTimeout(480_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-burgers-isosurface-"));
  const directory = join(root, "burgers.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), directory, { recursive: true });
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
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByLabel("Isosurface speed level").fill("0.0011");
    await editor.getByLabel("Clip x min").fill("-0.002");
    await editor.getByLabel("Clip x max").fill("0.002");
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    const surface = editor.getByTestId("vector-field3d-isosurface");
    await expect(surface).toContainText("Verified source tiles:", { timeout: 120_000 });
    await expect(surface).toContainText(/source sha256:[a-f0-9]{64}/);
    await expect(surface).toContainText(/\d[\d,]* triangles/);
    await expect(surface).toContainText("opened by the physical clipping box");
    await expect(surface).toContainText("boundary edges");
    expect(Number((await surface.innerText()).match(/vx (\d+)\/72/)?.[1])).toBeLessThan(72);
    await expect(surface.getByRole("button", { name: "Export mesh with provenance (.gltf)" })).toBeEnabled();
    await page.evaluate(() => {
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        if (this.download.endsWith(".gltf")) {
          (window as unknown as { capturedIsosurfaceUrl: string }).capturedIsosurfaceUrl = this.href;
          return;
        }
        originalClick.call(this);
      };
    });
    await surface.getByRole("button", { name: "Export mesh with provenance (.gltf)" }).click();
    await expect(editor.getByRole("alert")).toHaveCount(0);
    const gltf = await page.evaluate(async () => JSON.parse(await fetch(
      (window as unknown as { capturedIsosurfaceUrl: string }).capturedIsosurfaceUrl).then(response =>
        response.text())));
    expect(gltf.meshes[0].extras).toMatchObject({ level: 0.0011, unit: "m/s",
      clipped: true, complete: true, clipBounds: [[-0.002, 0.002], expect.any(Array),
        expect.any(Array)],
      sourceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      verifiedTiles: expect.arrayContaining([
        expect.objectContaining({ name: "vx", tileSha256: expect.arrayContaining([
          expect.stringMatching(/^[a-f0-9]{64}$/)]) })]) });
    expect(gltf.meshes[0].primitives[0].indices).toBe(2);
    expect(gltf.meshes[0].extras.topology.boundaryEdgeCount).toBeGreaterThan(0);
    expect(gltf.meshes[0].extras.topology.clipBoundaryEdgeCount).toBeGreaterThan(0);
    expect(gltf.meshes[0].extras.topology.watertight).toBe(false);
    expect(gltf.meshes[0].extras.vertexCount).toBeLessThan(gltf.accessors[2].count);
    await expect(surface).toContainText(
      String(gltf.meshes[0].extras.topology.connectedComponents) + " connected component(s)");
    await expect(surface).toContainText(
      String(gltf.meshes[0].extras.topology.boundaryEdgeCount) + " boundary edges");
    await expect(surface).toContainText(
      String(gltf.meshes[0].extras.topology.nonManifoldEdgeCount) + " nonmanifold edges");
    expect(gltf.accessors[0].count).toBeGreaterThan(0);
    const resource = join(directory, "vx.f64"), original = await readFile(resource);
    const outsideClip = Buffer.from(original); outsideClip[0] ^= 1;
    await writeFile(resource, outsideClip);
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText("vx 48/72", { timeout: 120_000 });
    await writeFile(resource, original);
    const changed = Buffer.from(original); changed[16 * 85 * 55 * 8] ^= 1;
    await writeFile(resource, changed);
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /integrity|checksum/i })).toBeVisible();
    await expect(editor.getByTestId("vector-field3d-isosurface")).toHaveCount(0);
    await writeFile(resource, original);
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText("Verified source tiles:", { timeout: 120_000 });
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText(gltf.meshes[0].extras.sourceHash);
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const savedProject = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const fieldEntry = savedProject.workspace.entries.find((item: { module: string }) =>
      item.module === "vector3d");
    await projectPanel.getByTestId(`project-preview-${savedProject.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${fieldEntry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByLabel("Isosurface speed level")).toHaveValue("0.0011");
    await expect(editor.getByLabel("Clip x min")).toHaveValue("-0.002");
    await expect(editor.getByLabel("Clip x max")).toHaveValue("0.002");
    await expect(editor.getByTestId("vector-field3d-isosurface")).toHaveCount(0);
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText("Verified source tiles:", { timeout: 120_000 });
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText(gltf.meshes[0].extras.sourceHash);
    await page.evaluate(() => {
      const originalPost = Worker.prototype.postMessage;
      (window as unknown as { originalIsosurfacePost: typeof originalPost }).originalIsosurfacePost = originalPost;
      Worker.prototype.postMessage = function(message) {
        window.setTimeout(() => originalPost.call(this, message), 1200);
      };
    });
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await editor.getByRole("button", { name: "Cancel isosurface" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("Isosurface extraction cancelled; no partial mesh");
    await expect(editor.getByTestId("vector-field3d-isosurface")).toHaveCount(0);
    await editor.getByRole("button", { name: "Extract speed isosurface" }).click();
    await expect(editor.getByTestId("vector-field3d-isosurface"))
      .toContainText("Verified source tiles:", { timeout: 120_000 });
    await page.evaluate(() => {
      Worker.prototype.postMessage = (window as unknown as {
        originalIsosurfacePost: typeof Worker.prototype.postMessage
      }).originalIsosurfacePost;
    });
    await editor.getByRole("button", { name: "Add source-linked Mesh to Project" }).click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current", { timeout: 120_000 });
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("on clip planes");
    await page.evaluate(() => {
      const originalPost = Worker.prototype.postMessage;
      (window as unknown as { originalIsosurfacePost: typeof originalPost }).originalIsosurfacePost = originalPost;
      Worker.prototype.postMessage = function(message) {
        window.setTimeout(() => originalPost.call(this, message), 1200);
      };
    });
    await page.getByTestId("scientific-mesh-rebuild").click();
    await page.getByTestId("scientific-mesh-rebuild-cancel").click();
    await expect(page.getByTestId("scientific-mesh-rebuild-message"))
      .toContainText("previous Mesh revision is unchanged");
    await page.evaluate(() => {
      Worker.prototype.postMessage = (window as unknown as {
        originalIsosurfacePost: typeof Worker.prototype.postMessage
      }).originalIsosurfacePost;
    });
    if (!await projectPanel.isVisible()) await page.getByTestId("projects-toggle").click();
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const meshProject = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const meshEntry = meshProject.workspace.entries.find((item: { module: string;
      checkpoint: { source: { origin: { kind: string } } } }) =>
      item.module === "mesh" && item.checkpoint.source.origin.kind === "derivedVectorFieldIsosurface");
    expect(meshEntry).toBeDefined();
    expect(meshEntry.expected.revision).toBe(1);
    expect(meshEntry.checkpoint.source.origin).toMatchObject({ clipped: true,
      topology: { watertight: false, boundaryEdgeCount: gltf.meshes[0].extras.topology.boundaryEdgeCount,
        clipBoundaryEdgeCount: gltf.meshes[0].extras.topology.clipBoundaryEdgeCount },
      sourceHash: gltf.meshes[0].extras.sourceHash,
      verifiedTiles: expect.arrayContaining([expect.objectContaining({ name: "vx",
        tileSha256: expect.any(Array) })]) });
    expect(meshProject.workspace.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "vector3d.speed-isosurface-mesh",
        sources: [expect.objectContaining({ documentId: fieldEntry.expected.id })] })]));
    await projectPanel.getByTestId("project-detail-toggle").click();
    await projectPanel.getByTestId(`project-preview-${meshProject.identity.id}`).click();
    await projectPanel.getByTestId("project-restore-saved").click();
    await projectPanel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current", { timeout: 120_000 });
    const requiredChanged = Buffer.from(original);
    requiredChanged[16 * 85 * 55 * 8] ^= 1;
    await writeFile(resource, requiredChanged);
    if (!await projectPanel.getByTestId(`project-preview-${meshProject.identity.id}`).isVisible()) {
      if (!await projectPanel.getByTestId("project-detail-toggle").isVisible())
        await projectPanel.getByTestId("project-gallery-layout-toggle").click();
      if (!await projectPanel.getByTestId(`project-preview-${meshProject.identity.id}`).isVisible())
        await projectPanel.getByTestId("project-detail-toggle").click();
    }
    await projectPanel.getByTestId(`project-preview-${meshProject.identity.id}`).click();
    await projectPanel.getByTestId("project-restore-saved").click();
    await projectPanel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source stale", { timeout: 120_000 });
    await page.getByTestId("scientific-mesh-rebuild").click();
    await expect(page.getByTestId("scientific-mesh-rebuild-message"))
      .toContainText(/vx:|integrity|checksum/i, { timeout: 120_000 });
    await expect(page.getByTestId("scientific-mesh-rebuild-message"))
      .toContainText("Repair the source bundle or relink");
    await writeFile(resource, original);
    await page.getByTestId("scientific-mesh-rebuild").click();
    await expect(page.getByTestId("scientific-mesh-rebuild-message"))
      .toContainText("Verified Mesh revision", { timeout: 120_000 });
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current");
    if (!await projectPanel.isVisible()) await page.getByTestId("projects-toggle").click();
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const rebuiltProject = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const rebuiltEntry = rebuiltProject.workspace.entries.find((item: { expected: { id: string } }) =>
      item.expected.id === meshEntry.expected.id);
    expect(rebuiltEntry.expected.revision).toBe(meshEntry.expected.revision + 1);
    expect(rebuiltEntry.checkpoint.source.origin.topology.clipBoundaryEdgeCount)
      .toBe(meshEntry.checkpoint.source.origin.topology.clipBoundaryEdgeCount);
    expect(rebuiltEntry.checkpoint.source.origin.verifiedTiles)
      .toEqual(meshEntry.checkpoint.source.origin.verifiedTiles);
    expect(rebuiltProject.workspace.relations.filter((item: { operation: string }) =>
      item.operation === "vector3d.speed-isosurface-mesh").map((item: { status: string }) =>
      item.status)).toEqual(["stale", "current"]);
    if (!await projectPanel.getByTestId(`project-preview-${rebuiltProject.identity.id}`).isVisible()) {
      if (!await projectPanel.getByTestId("project-detail-toggle").isVisible())
        await projectPanel.getByTestId("project-gallery-layout-toggle").click();
      if (!await projectPanel.getByTestId(`project-preview-${rebuiltProject.identity.id}`).isVisible())
        await projectPanel.getByTestId("project-detail-toggle").click();
    }
    await projectPanel.getByTestId(`project-preview-${rebuiltProject.identity.id}`).click();
    await projectPanel.getByTestId("project-restore-saved").click();
    await projectPanel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current", { timeout: 120_000 });
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-burgers-isosurface-"))
      throw new Error("Unsafe Burgers isosurface fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
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
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 120_000 });
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Full verified transfer lattice: 21 × 21 × 17");
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
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 120_000 });
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
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 120_000 });
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

test("Field Explorer verifies a v3 source automatically and refuses a changed first-preview overview", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-auto-verify-"));
  const directory = join(root, "flow.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), directory,
    { recursive: true });
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
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await expect(importer).toContainText("Measured Burgers vortex");
    const overviewPath = join(directory, "vx.overview.f64");
    const original = await readFile(overviewPath);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(overviewPath, changed);
    await importer.getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verification failed", { timeout: 120_000 });
    await expect(editor.getByRole("alert")).toContainText(/integrity|checksum/i);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await writeFile(overviewPath, original);
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 120_000 });
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-vector-auto-verify-"))
      throw new Error("Unsafe automatic verifier fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-04 chunked source renders verified sparse data and rejects a changed sampled chunk", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-chunks-"));
  const directory = join(root, "flow.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
    schema: string; resources: { path: string; chunkBytes?: number; chunkSha256?: string[] }[] };
  manifest.schema = "scientific-scene/v2";
  for (const resource of manifest.resources) {
    const bytes = await readFile(join(directory, resource.path));
    resource.chunkBytes = 4096;
    resource.chunkSha256 = [];
    for (let offset = 0; offset < bytes.length; offset += 4096)
      resource.chunkSha256.push(createHash("sha256").update(bytes.subarray(offset, offset + 4096)).digest("hex"));
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(directory, "manifest.json"), manifestBytes);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "scientific-scene-bundle/v2",
    manifest: { path: "manifest.json", bytes: manifestBytes.length,
      sha256: createHash("sha256").update(manifestBytes).digest("hex") } }));
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
    await editor.getByRole("button", { name: "YZ slice" }).click();
    await editor.getByLabel("Slice physical coordinate").selectOption("-4");
    await editor.evaluate(element => {
      const button = [...element.querySelectorAll("button")].find(item => item.textContent?.trim() === "Preview slice");
      if (!button) throw new Error("Slice preview button is missing");
      const measure = { started: 0, firstView: 0 };
      (window as unknown as { __m3dFirstSlice?: typeof measure }).__m3dFirstSlice = measure;
      button.addEventListener("click", () => { measure.started = performance.now(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (element.querySelector('figure[aria-label="YZ field slice"]')) {
          measure.firstView = performance.now(); observer.disconnect();
        }
      });
      observer.observe(element, { childList: true, subtree: true });
    });
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "YZ field slice" })).toBeVisible();
    const firstSlice = await page.evaluate(() => (window as unknown as {
      __m3dFirstSlice: { started: number; firstView: number }
    }).__m3dFirstSlice);
    expect(firstSlice.firstView).toBeGreaterThan(firstSlice.started);
    await editor.evaluate(element => {
      const cell = element.querySelector('[data-probe-cell="0-0"]');
      if (!cell) throw new Error("Probe cell is missing");
      const measure = { started: 0, firstView: 0 };
      (window as unknown as { __m3dFirstProbe?: typeof measure }).__m3dFirstProbe = measure;
      cell.addEventListener("click", () => { measure.started = performance.now(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (element.querySelector('[data-testid="vector-field3d-probe-values"]')) {
          measure.firstView = performance.now(); observer.disconnect();
        }
      });
      observer.observe(element, { childList: true, subtree: true });
    });
    await editor.getByRole("figure", { name: "YZ field slice" })
      .locator('[data-probe-cell="0-0"]').click();
    await expect(editor.getByTestId("vector-field3d-probe-values")).toBeVisible();
    const firstProbe = await page.evaluate(() => (window as unknown as {
      __m3dFirstProbe: { started: number; firstView: number }
    }).__m3dFirstProbe);
    expect(firstProbe.firstView).toBeGreaterThan(firstProbe.started);
    await testInfo.attach("chunked-first-slice-probe.json", { body: JSON.stringify({
      clickToFirstSliceMs: Math.round((firstSlice.firstView - firstSlice.started) * 10) / 10,
      clickToFirstProbeMs: Math.round((firstProbe.firstView - firstProbe.started) * 10) / 10,
      sourceShape: [21, 21, 17],
    }), contentType: "application/json" });
    console.log(`SCI-04 chunked click-to-first-slice/probe: ` +
      `${(firstSlice.firstView - firstSlice.started).toFixed(1)} / ` +
      `${(firstProbe.firstView - firstProbe.started).toFixed(1)} ms`);
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    const chunkedCalculus = editor.getByTestId("vector-field3d-differential");
    await expect(chunkedCalculus).toContainText("Approximate · bounded-finite-difference");
    await expect(chunkedCalculus).not.toContainText("on the source grid");
    await editor.getByLabel("Field calculus sample provenance")
      .getByText("Verified calculus samples").click();
    await expect(editor.getByLabel("Field calculus sample provenance"))
      .toContainText("source chunks verified");
    await editor.getByLabel("Slice displayed field").selectOption("curl-magnitude");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "YZ field slice" }))
      .toContainText("Approximate · bounded-finite-difference");
    await editor.getByLabel("Slice displayed field").selectOption("component");
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await editor.evaluate(element => {
      const button = [...element.querySelectorAll("button")].find(item =>
        item.textContent?.includes("Verify & render arrows"));
      if (!button) throw new Error("Arrow preview button is missing");
      const heap = () => (performance as Performance & {
        memory?: { usedJSHeapSize: number }
      }).memory?.usedJSHeapSize ?? null;
      const measurement = { started: 0, firstView: 0, heapBefore: null as number | null,
        heapAtFirstView: null as number | null };
      (window as unknown as { __m3dFirstView?: typeof measurement }).__m3dFirstView = measurement;
      button.addEventListener("click", () => { measurement.started = performance.now();
        measurement.heapBefore = heap(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (element.querySelector('[data-testid="vector-field3d-transfer-status"]')
          ?.textContent?.includes("Initial verified transfer lattice")) {
          measurement.firstView = performance.now();
          measurement.heapAtFirstView = heap();
          observer.disconnect();
        }
      });
      observer.observe(element, { childList: true, subtree: true, characterData: true });
    });
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Initial verified transfer lattice: 8 × 8 × 8");
    const firstView = await page.evaluate(() => (window as unknown as {
      __m3dFirstView: { started: number; firstView: number;
        heapBefore: number | null; heapAtFirstView: number | null }
    }).__m3dFirstView);
    expect(firstView.started).toBeGreaterThan(0);
    expect(firstView.firstView).toBeGreaterThan(firstView.started);
    console.log(`SCI-04 chunked 21³ click-to-first-view: ${(firstView.firstView - firstView.started).toFixed(1)} ms; ` +
      `renderer heap delta ${firstView.heapBefore === null || firstView.heapAtFirstView === null ?
        "unavailable" : `${((firstView.heapAtFirstView - firstView.heapBefore) / 1048576).toFixed(1)} MiB`}`);
    await testInfo.attach("chunked-first-view.json", { body: JSON.stringify({
      clickToFirstViewMs: Math.round((firstView.firstView - firstView.started) * 10) / 10,
      rendererHeapDeltaMiB: firstView.heapBefore === null || firstView.heapAtFirstView === null ? null :
        Math.round((firstView.heapAtFirstView - firstView.heapBefore) / 1048576 * 10) / 10,
      transferShape: [8, 8, 8], sourceShape: [21, 21, 17],
    }), contentType: "application/json" });
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Full verified transfer lattice: 21 × 21 × 17");
    await editor.getByText("Preview sample provenance").click();
    await expect(editor.getByLabel("3D preview provenance"))
      .toContainText("source chunks verified");
    await editor.getByLabel("Seed x").fill("1");
    await editor.getByRole("button", { name: "Add seed" }).click();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toContainText("seed-1:");
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .not.toContainText("Verified source tiles:");
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    await expect(editor.getByLabel("Field equilibria")).toContainText("Source revision");
    await expect(editor.getByLabel("Field equilibria")).not.toContainText("Verified source tiles:");
    const file = await open(join(directory, "east.f64"), "r+");
    try {
      const byte = Buffer.alloc(1);
      await file.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await file.write(byte, 0, 1, 0);
    } finally { await file.close(); }
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("chunk integrity");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await editor.getByRole("button", { name: "YZ slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("chunk integrity");
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("chunk integrity");
  } finally {
    await closeSurfaceApp(app);
    if (resolve(root).startsWith(`${resolve(tmpdir())}${sep}`))
      await rm(root, { recursive: true, force: true });
  }
});

test("SCI-04 tiled source previews every orthogonal slice and rejects a changed tile", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-vector-tiles-"));
  const source = join(root, "source.sscene"), tiled = join(root, "tiled.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), source, { recursive: true });
  execFileSync(process.execPath, [resolve("scripts/tile-scientific-scene.mjs"), source, tiled,
    "8", "8", "8"]);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, tiled);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    for (const [name, coordinate] of [["XY", "-3"], ["XZ", "-4"], ["YZ", "-4"]] as const) {
      await editor.getByRole("button", { name: `${name} slice` }).click();
      await editor.getByLabel("Slice physical coordinate").selectOption(coordinate);
      await editor.getByRole("button", { name: "Preview slice" }).click();
      await expect(editor.getByRole("figure", { name: `${name} field slice` })).toBeVisible();
      await editor.getByLabel("Slice sample provenance").getByText("Verified slice samples").click();
      await expect(editor.getByLabel("Slice sample provenance")).toContainText("source tiles verified");
    }
    await editor.getByRole("figure", { name: "YZ field slice" })
      .locator('[data-probe-cell="0-0"]').click();
    await expect(editor.getByTestId("vector-field3d-probe-values")).toContainText("source tiles verified");
    await editor.getByLabel("Slice displayed field").selectOption("curl-magnitude");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "YZ field slice" }))
      .toContainText("Approximate · bounded-finite-difference");
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Full verified transfer lattice");
    await editor.getByText("Preview sample provenance").click();
    await expect(editor.getByLabel("3D preview provenance")).toContainText("source tiles verified");
    const overviewFile = await open(join(tiled, "east.overview.f64"), "r+");
    try {
      const byte = Buffer.alloc(1);
      await overviewFile.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await overviewFile.write(byte, 0, 1, 0);
    } finally { await overviewFile.close(); }
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("overview integrity");
    const restoredOverview = await open(join(tiled, "east.overview.f64"), "r+");
    try {
      const byte = Buffer.alloc(1);
      await restoredOverview.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await restoredOverview.write(byte, 0, 1, 0);
    } finally { await restoredOverview.close(); }
    const file = await open(join(tiled, "east.f64"), "r+");
    try {
      const byte = Buffer.alloc(1);
      await file.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await file.write(byte, 0, 1, 0);
    } finally { await file.close(); }
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByLabel("Slice physical coordinate").selectOption("-3");
    await editor.getByLabel("Slice displayed field").selectOption("component");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("tile integrity");
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(editor.getByTestId("vector-field3d-viewer-error")).toContainText("tile integrity");
  } finally {
    await closeSurfaceApp(app);
    if (resolve(root).startsWith(`${resolve(tmpdir())}${sep}`))
      await rm(root, { recursive: true, force: true });
  }
});

test("SCI-04 larger generated scientific field shows verified overview before refinement", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-large-vortex-ui-"));
  const directory = join(root, "large-vortex.sscene");
  execFileSync(process.execPath, [resolve("scripts/write-scientific-large-vortex.mjs"), directory]);
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
    await expect(editor).toContainText("shape 80 × 80 × 80");
    await expect(editor.getByTestId("vector-field3d-source-verification"))
      .toContainText("verified source samples", { timeout: 120_000 });
    await editor.evaluate(element => {
      const button = [...element.querySelectorAll("button")].find(item =>
        item.textContent?.includes("Verify & render arrows"));
      if (!button) throw new Error("Arrow preview button is missing");
      const measure = { started: 0, firstView: 0, overviewSeen: false };
      (window as unknown as { __m3dLargeOverview?: typeof measure }).__m3dLargeOverview = measure;
      button.addEventListener("click", () => { measure.started = performance.now(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (element.querySelector('[data-testid="vector-field3d-transfer-status"]')
          ?.textContent?.includes("Initial verified transfer lattice: 8 × 8 × 8")) {
          measure.firstView = performance.now(); measure.overviewSeen = true; observer.disconnect();
        }
      });
      observer.observe(element, { childList: true, subtree: true, characterData: true });
    });
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Full verified transfer lattice: 32 × 32 × 32");
    const measure = await page.evaluate(() => (window as unknown as {
      __m3dLargeOverview: { started: number; firstView: number; overviewSeen: boolean }
    }).__m3dLargeOverview);
    expect(measure.overviewSeen).toBe(true);
    expect(measure.firstView).toBeGreaterThan(measure.started);
    await testInfo.attach("large-scientific-overview.json", { body: JSON.stringify({
      shape: [80, 80, 80], clickToFirstOverviewMs: Math.round((measure.firstView - measure.started) * 10) / 10,
    }), contentType: "application/json" });
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toBeVisible();
    await editor.getByLabel("Slice sample provenance").getByText("Verified slice samples").click();
    await expect(editor.getByLabel("Slice sample provenance")).toContainText("source tiles verified");
    await editor.getByLabel("Slice displayed field").selectOption("curl-z");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    const figure = editor.getByRole("figure", { name: "XY field slice" });
    await expect(figure).toContainText("Approximate · bounded-finite-difference");
    await figure.locator('[data-probe-cell="15-15"]').click();
    await expect(editor.getByTestId("vector-field3d-probe-values"))
      .toContainText("source tiles verified");
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    const calculus = editor.getByLabel("Field calculus sample provenance");
    await calculus.getByText("Verified calculus samples").click();
    await expect(calculus).toContainText("source tiles verified");
    await editor.getByLabel("Trajectory tolerance preset").selectOption("precise");
    await expect(editor.getByLabel("Trajectory absolute tolerance")).toHaveValue("1e-8");
    await expect(editor.getByLabel("Trajectory relative tolerance")).toHaveValue("1e-8");
  } finally {
    await closeSurfaceApp(app);
    if (resolve(root).startsWith(`${resolve(tmpdir())}${sep}`))
      await rm(root, { recursive: true, force: true });
  }
});

test("SCI-12 measured Burgers vortex keeps source axes and values across Explorer views", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-burgers-derived-"));
  const directory = join(root, "burgers.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), directory, { recursive: true });
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
    await expect(editor).toContainText("shape 47 × 85 × 55");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(editor.getByTestId("vector-field3d-transfer-status"))
      .toContainText("Full verified transfer lattice: 32 × 32 × 32");
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByLabel("Slice physical coordinate").selectOption({ index: 15 });
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await editor.getByRole("figure", { name: "XY field slice" })
      .locator('[data-probe-cell="15-16"]').click();
    const probe = editor.getByTestId("vector-field3d-probe-values");
    for (const [name, value] of [["vx", 0.000005], ["vy", -0.000163],
      ["vz", -0.000459]] as const)
      await expect(probe).toContainText(`${name} = ${value.toPrecision(5)} m/s`);
    await expect(probe).toContainText("source tiles verified");
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    const calculusResult = editor.getByTestId("vector-field3d-differential");
    await expect(calculusResult).toContainText("bounded-finite-difference on the source grid");
    await expect(calculusResult).toContainText("Jacobian:");
    await expect(calculusResult).toContainText(/source sha256:[a-f0-9]{64}/);
    await expect(calculusResult).toContainText(/Project result vector3d-point:[a-f0-9]{64}/);
    const eigenPanel = editor.getByTestId("vector-field3d-eigen-panel");
    await expect(eigenPanel).not.toHaveAttribute("open", "");
    await eigenPanel.locator("summary").click();
    await expect(eigenPanel).toContainText("Derivative method: bounded-finite-difference on the source grid");
    await expect(eigenPanel.getByRole("table")).toBeVisible();
    await expect(eigenPanel.getByRole("list", { name: "Jacobian eigenvalues" })).toBeVisible();
    await expect(eigenPanel).toContainText("1/s");
    const calculusProvenance = editor.getByLabel("Field calculus sample provenance");
    await calculusProvenance.getByText("Verified calculus samples").click();
    for (const name of ["vx", "vy", "vz"])
      await expect(calculusProvenance).toContainText(new RegExp(`${name}:\\s*[a-f0-9]{64}`));
    await expect(calculusProvenance).toContainText("source tiles verified");
    const originalProvenance = await calculusProvenance.textContent();
    const originalSourceHash = (await calculusResult.textContent())!.match(/source (sha256:[a-f0-9]{64})/)?.[1];
    expect(originalSourceHash).toBeDefined();
    const calculusResource = join(directory, "vx.f64");
    const calculusOriginal = await readFile(calculusResource);
    const calculusChanged = Buffer.from(calculusOriginal);
    const sceneManifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    const tileShape = sceneManifest.resources.find((item: { id: string }) => item.id === "vx").tileShape as number[];
    const datasetShape = [47, 85, 55];
    const tileCounts = datasetShape.map((size, axis) => Math.ceil(size / tileShape[axis]!));
    let tileOffset = 0;
    for (let x = 0; x < tileCounts[0]!; x++)
      for (let y = 0; y < tileCounts[1]!; y++)
        for (let z = 0; z < tileCounts[2]!; z++) {
          if (x === 1 && y === 2 && z === 1) { calculusChanged[tileOffset] ^= 1; break; }
          tileOffset += Math.min(tileShape[0]!, datasetShape[0]! - x * tileShape[0]!) *
            Math.min(tileShape[1]!, datasetShape[1]! - y * tileShape[1]!) *
            Math.min(tileShape[2]!, datasetShape[2]! - z * tileShape[2]!) * 8;
        }
    await writeFile(calculusResource, calculusChanged);
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /changed|checksum|integrity/i }))
      .toBeVisible();
    await expect(editor.getByTestId("vector-field3d-differential")).toHaveCount(0);
    await writeFile(calculusResource, calculusOriginal);
    await editor.getByLabel("Slice displayed field").selectOption("curl-z");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("Approximate · bounded-finite-difference");
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("on the source grid");
    for (const plane of ["XZ", "YZ"] as const) {
      await editor.getByRole("button", { name: `${plane} slice` }).click();
      await editor.getByRole("button", { name: "Preview slice" }).click();
      await expect(editor.getByRole("figure", { name: `${plane} field slice` })).toBeVisible();
      await expect(editor.getByTestId("vector-field3d-slice-crosshair")).toBeVisible();
      await expect(probe).toContainText("vx = 0.0000050000 m/s");
    }
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await editor.getByRole("button", { name: "Show line profile through point" }).click();
    const profile = editor.getByRole("region", { name: "Line profile through probe" });
    await profile.getByTestId("vector-field3d-send-derived-line").click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("verified curl-z samples");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    await projectPanel.getByTestId(`project-open-saved-${projectId}`).click();
    await page.getByTestId("workspace-nav-graphs").click();
    const origin = await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((entry: { module: string }) => entry.module === "graph2d");
      const objects = [...(graph.replay?.payload?.transactions ?? [])].reverse()
        .map((transaction: { commands: { command: { payload: { source?: { objects?: unknown[] } } } }[] }) =>
          transaction.commands[0]?.command.payload.source?.objects)
        .find((value: unknown) => Array.isArray(value)) ?? graph.checkpoint.source.objects;
      return objects.find((item: { derivedOrigin?: unknown }) => item.derivedOrigin)?.derivedOrigin;
    });
    expect(origin).toMatchObject({ kind: "vector-field3d-derived-line", operation: "curl-z",
      stencilGrid: "source",
      normalAxis: 2, varyingAxis: 0, xUnit: "m", yUnit: "1/s",
      verifiedSamples: [{ name: "vx", sampleSha256: expect.any(String) },
        { name: "vy", sampleSha256: expect.any(String) },
        { name: "vz", sampleSha256: expect.any(String) }] });
    expect(origin.sourceDocumentJson).toContain(directory.replace(/\\/g, "\\\\"));
    const graphInspector = page.getByLabel("Graph inspector");
    const compactInspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (!await graphInspector.isVisible()) await compactInspector.locator(":scope > summary").click();
    const visibleInspector = await graphInspector.isVisible() ? graphInspector : compactInspector;
    await visibleInspector.getByTestId("graph2d-reverify-derived-line").click();
    await expect(visibleInspector.getByRole("status").filter({ hasText: "Verified against saved source." }))
      .toBeVisible();
    const resource = join(directory, "vx.f64"), original = await readFile(resource);
    const changed = Buffer.from(original); changed[16 * 16 * 16 * 8] ^= 1;
    await writeFile(resource, changed);
    await visibleInspector.getByTestId("graph2d-reverify-derived-line").click();
    await expect(visibleInspector.getByRole("status").filter({ hasText: /changed|checksum|integrity/i }))
      .toBeVisible();
    await writeFile(resource, original);
    const savedProject = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const fieldEntry = savedProject.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(fieldEntry).toBeDefined();
    const savedCalculus = savedProject.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.point-calculus");
    expect(savedCalculus).toBeDefined();
    expect(savedCalculus.provenance.source.documentId).toBe(fieldEntry.expected.id);
    expect(savedCalculus.provenance.operation.parameters).toMatchObject({
      position: expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number)]),
      coordinateUnits: ["m", "m", "m"], stencilGrid: "source",
      sourceHash: originalSourceHash,
      sourceReference: { kind: "scientific-bundle", components: [
        { datasetId: "field", component: "vx" },
        { datasetId: "field", component: "vy" },
        { datasetId: "field", component: "vz" }] },
    });
    expect(savedCalculus.summary).toMatchObject({ derivativeMethod: "bounded-finite-difference",
      eigenvalueUnit: "1/s", verifiedSamples: [
        { name: "vx", sampleSha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        { name: "vy", sampleSha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        { name: "vz", sampleSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    expect(savedCalculus.summary.jacobianRows).toHaveLength(3);
    expect(savedCalculus.summary.eigenvalues).toHaveLength(3);
    expect(savedProject.workspace.relations).toContainEqual(expect.objectContaining({
      kind: "analysis-of", target: { type: "result", resultId: savedCalculus.resultId,
        resultType: "vector3d.point-calculus" } }));
    if (!await projectPanel.isVisible()) await page.getByTestId("projects-toggle").click();
    await projectPanel.getByTestId(`project-preview-${savedProject.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${fieldEntry.expected.id}`).click();
    const reopened = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(reopened.getByTestId("vector-field3d-differential")).toHaveCount(0);
    await expect(reopened.getByLabel("Saved point calculus results"))
      .toContainText(savedCalculus.resultId);
    await writeFile(calculusResource, calculusChanged);
    await reopened.getByRole("button", { name: "Reverify saved Inspector result" }).click();
    await expect(reopened.getByRole("alert").filter({ hasText: /changed|checksum|integrity/i }))
      .toBeVisible();
    await expect(reopened.getByTestId("vector-field3d-differential")).toHaveCount(0);
    await writeFile(calculusResource, calculusOriginal);
    await reopened.getByRole("button", { name: "Reverify saved Inspector result" }).click();
    const reopenedResult = reopened.getByTestId("vector-field3d-differential");
    await expect(reopenedResult).toContainText(`source ${originalSourceHash}`);
    await expect(reopenedResult).toContainText(`Project result ${savedCalculus.resultId}`);
    const reopenedEigen = reopened.getByTestId("vector-field3d-eigen-panel");
    await expect(reopenedEigen).not.toHaveAttribute("open", "");
    await reopenedEigen.locator("summary").click();
    await expect(reopenedEigen.getByRole("table")).toBeVisible();
    const reopenedProvenance = reopened.getByLabel("Field calculus sample provenance");
    await reopenedProvenance.locator("summary").click();
    expect(await reopenedProvenance.textContent()).toBe(originalProvenance);
    await reopened.getByRole("button", { name: "Open Project result graph" }).click();
    await expect(projectPanel).toBeVisible();
    await expect(projectPanel.getByTestId("project-point-result-gated")).toBeVisible();
    await expect(projectPanel.getByTestId("project-result-detail"))
      .toContainText(savedCalculus.resultId);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-burgers-derived-"))
      throw new Error("Unsafe Burgers fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-12 measured Burgers trajectories and equilibria use verified v3 tiles", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-burgers-tile-solvers-"));
  const directory = join(root, "burgers.sscene");
  await cp(resolve("output/scientific-burgers-horizontal-level1.sscene"), directory, { recursive: true });
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
    for (const [axis, value] of [["x", "-0.0017678"], ["y", "-0.0011839"],
      ["z", "0.0096958"]] as const)
      await editor.getByLabel(`Seed ${axis}`).fill(value);
    await editor.getByRole("button", { name: "Add seed" }).click();
    const started = await page.evaluate(() => performance.now());
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const trajectory = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(trajectory).toContainText("Verified source tiles:");
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" }))
      .toContainText("Trajectory overlay: 1 seed");
    const firstTrajectoryMs = await page.evaluate(start => performance.now() - start, started);
    const trajectoryText = await trajectory.innerText();
    expect(trajectoryText).toMatch(/vx \d+\/72/);
    expect(trajectoryText).toMatch(/source sha256:[a-f0-9]{64}/);
    const residentTileBytes = Number(trajectoryText.match(/Resident cache (\d+) bytes/)?.[1]);
    expect(residentTileBytes).toBeGreaterThan(0);
    expect(residentTileBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    await testInfo.attach("burgers-first-tile-trajectory.json", { body: JSON.stringify({
      firstTrajectoryMs: Math.round(firstTrajectoryMs * 10) / 10, residentTileBytes,
      provenance: trajectoryText,
    }), contentType: "application/json" });
    const resource = join(directory, "vx.f64"), original = await readFile(resource);
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    const tileShape = manifest.resources.find((item: { id: string }) => item.id === "vx").tileShape as number[];
    const sourceShape = [47, 85, 55];
    let centerTileOffset = 0;
    tileScan: for (let x = 0; x < 3; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 4; z++) {
      if (x === 1 && y === 2 && z === 1) break tileScan;
      centerTileOffset += Math.min(tileShape[0]!, sourceShape[0]! - x * tileShape[0]!) *
        Math.min(tileShape[1]!, sourceShape[1]! - y * tileShape[1]!) *
        Math.min(tileShape[2]!, sourceShape[2]! - z * tileShape[2]!) * 8;
    }
    const changedCenter = Buffer.from(original); changedCenter[centerTileOffset] ^= 1;
    await writeFile(resource, changedCenter);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /integrity|checksum/i })).toBeVisible();
    await writeFile(resource, original);
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    await expect(editor.getByLabel("Field equilibria"))
      .toContainText("Verified source tiles:");
    await expect(editor.getByLabel("Field equilibria"))
      .toContainText(/vx \d+\/72/);
    await expect(editor.getByLabel("Field equilibria"))
      .toContainText(/hash sha256:[a-f0-9]{64}/);
    await expect(editor.getByLabel("Field equilibria")).toContainText("8 candidates");
    await expect(editor.getByLabel("Field equilibria")).toContainText("3411/40000 evaluations");
    await editor.getByLabel("Field equilibria").getByRole("button", { name: /at \(/ }).first().click();
    await expect(editor.getByLabel("Field equilibria")).toContainText("eigenvalues λ1 =");
    const equilibriumText = await editor.getByLabel("Field equilibria").innerText();
    const verifiedTileCount = Number(equilibriumText.match(/vx (\d+)\/72/)?.[1]);
    const tileBatchCount = Number(equilibriumText.match(/Batched tile reads: (\d+)/)?.[1]);
    const prefetchedTileCount = Number(equilibriumText.match(/prefetched tiles:\s*(\d+)/)?.[1]);
    const retainedSeedCount = Number(equilibriumText.match(/completed seeds kept:\s*(\d+)/)?.[1]);
    expect(tileBatchCount).toBeLessThan(verifiedTileCount);
    expect(prefetchedTileCount).toBe(verifiedTileCount);
    expect(retainedSeedCount).toBe(0);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /integrity|checksum/i })).toBeVisible();
    await writeFile(resource, original);
    await page.evaluate(() => {
      const originalPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message) {
        window.setTimeout(() => originalPost.call(this, message), 1200);
      };
    });
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await editor.getByRole("button", { name: "Cancel run" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("cancelled; no partial result");
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await editor.getByRole("button", { name: "Find equilibria" }).click();
    await editor.getByRole("button", { name: "Cancel search" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("Equilibrium search cancelled; no partial result");
    await expect(editor.getByLabel("Field equilibria"))
      .not.toContainText("Verified source tiles:");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-burgers-tile-solvers-"))
      throw new Error("Unsafe Burgers fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SCI-13 measured Burgers seed batches retain grouping, provenance and cancellation through Project reopen", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-burgers-horizontal-level1.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Add line (5)" }).click();
    await editor.getByRole("button", { name: "Add plane grid (9)" }).click();
    await expect(editor).toContainText("Trajectory seeds (14/32)");
    await editor.getByLabel("Show plane-1 seed group").uncheck();
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const status = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(status).toContainText("Showing 5/14 trajectory results");
    await expect(status.locator("[data-seed-outcome]")).toHaveCount(5);
    await expect(status).toContainText(/vx \d+\/72/);
    await expect(status).toContainText(/source sha256:[a-f0-9]{64}/);
    const resident = Number((await status.innerText()).match(/Resident cache (\d+) bytes/)?.[1]);
    expect(resident).toBeGreaterThan(0);
    expect(resident).toBeLessThanOrEqual(64 * 1024 * 1024);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" }))
      .toContainText("Trajectory overlay: 5 seed");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toHaveLength(14);
    expect(entry?.checkpoint.source.seeds.filter((seed: { group: string }) =>
      seed.group === "line-1")).toHaveLength(5);
    expect(entry?.checkpoint.source.seeds.filter((seed: { group: string }) =>
      seed.group === "plane-1")).toHaveLength(9);
    expect(entry?.checkpoint.workspace.hiddenSeedGroups).toEqual(["plane-1"]);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByLabel("Show plane-1 seed group")).not.toBeChecked();
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText("Showing 5/14 trajectory results");
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(/source sha256:[a-f0-9]{64}/);
    await page.evaluate(() => {
      const originalPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message) {
        window.setTimeout(() => originalPost.call(this, message), 1200);
      };
    });
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await editor.getByRole("button", { name: "Cancel run" }).click();
    await expect(editor.getByTestId("vector-field3d-run-status"))
      .toContainText("cancelled; no partial result");
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 places oriented 80³ slice seeds only after a physical-coordinate proposal", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-vortex-80-overview.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    const expected = (index: number) => -4 + 8 * Math.round(index * 79 / 31) / 79;
    for (const [plane, axes, fixedAxis] of [
      ["XY", ["x", "y"], "z"], ["XZ", ["x", "z"], "y"],
      ["YZ", ["y", "z"], "x"],
    ] as const) {
      await editor.getByRole("button", { name: `${plane} slice` }).click();
      await editor.getByRole("button", { name: "Preview slice" }).click();
      const figure = editor.getByRole("figure", { name: `${plane} field slice` });
      const fixed = Number(await editor.getByLabel("Slice physical coordinate").inputValue());
      await figure.getByRole("button", { name: `Place seed on ${plane} slice` }).click();
      await figure.locator('[data-probe-cell="6-20"]').click();
      const proposal = editor.getByTestId("vector-field3d-seed-proposal");
      await expect(proposal).toBeVisible();
      const proposedText = await proposal.innerText();
      for (const [axis, index] of [[axes[0], 6], [axes[1], 20]] as const) {
        const value = Number(proposedText.match(new RegExp(`\\b${axis} = (-?[\\d.]+) m`))?.[1]);
        expect(Math.abs(value - expected(index))).toBeLessThan(0.06);
      }
      await expect(proposal).toContainText(`${fixedAxis} = ${fixed.toPrecision(8)} m`);
      await expect(figure.getByTestId("vector-field3d-proposed-seed-marker")).toHaveCount(1);
      await expect(editor).toContainText("Trajectory seeds (0/32)");
      if (plane === "XY") {
        await figure.locator("svg[role=img]").first().evaluate(svg => {
          const point = (svg as SVGSVGElement).createSVGPoint();
          point.x = 50; point.y = 260;
          const screen = point.matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
          svg.dispatchEvent(new MouseEvent("click", { bubbles: true,
            clientX: screen.x, clientY: screen.y }));
        });
        await expect(editor.getByRole("alert").filter({ hasText: /inside the displayed slice plot/i }))
          .toBeVisible();
        await expect(proposal).toHaveCount(0);
        await figure.getByRole("button", { name: "Zoom xy in" }).click();
        await figure.locator('[data-probe-cell="16-16"]').click();
        await expect(proposal).toBeVisible();
        const zoomedText = await proposal.innerText();
        for (const axis of ["x", "y"] as const) {
          const value = Number(zoomedText.match(new RegExp(`\\b${axis} = (-?[\\d.]+) m`))?.[1]);
          expect(Math.abs(value - expected(16))).toBeLessThan(0.06);
        }
      }
      if (plane === "YZ") {
        await proposal.getByLabel("Proposed seed group").selectOption("");
        await proposal.getByRole("button", { name: "Add proposed seed" }).click();
        await expect(editor).toContainText("Trajectory seeds (1/32)");
        await expect(editor.getByRole("region", { name: "Seed group slice-1" })).toBeVisible();
      }
    }
    for (let index = 0; index < 3; index++)
      await editor.getByRole("button", { name: "Add ring (8)" }).click();
    await editor.getByRole("button", { name: "Add line (5)" }).click();
    await editor.getByRole("button", { name: "Add seed", exact: true }).click();
    await editor.getByRole("button", { name: "Add seed", exact: true }).click();
    await expect(editor).toContainText("Trajectory seeds (32/32)");
    await expect(editor.getByRole("button", { name: "Add seed", exact: true })).toBeDisabled();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "YZ field slice" })
      .getByRole("button", { name: "Place seed on YZ slice" })).toBeDisabled();
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 measured Burgers slice seed keeps its verified source through Project reopen", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-burgers-horizontal-level1.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByRole("button", { name: "Preview slice" }).click();
    const fixed = Number(await editor.getByLabel("Slice physical coordinate").inputValue());
    const figure = editor.getByRole("figure", { name: "XY field slice" });
    await expect(figure.getByLabel("Slice sample provenance")).toContainText(/source tiles verified/);
    await figure.getByRole("button", { name: "Place seed on XY slice" }).click();
    await figure.locator('[data-probe-cell="11-17"]').click();
    const proposal = editor.getByTestId("vector-field3d-seed-proposal");
    await expect(proposal).toContainText(`z = ${fixed.toPrecision(8)} m`);
    await proposal.getByLabel("Proposed seed group").selectOption("");
    await proposal.getByRole("button", { name: "Add proposed seed" }).click();
    await expect(editor.getByRole("region", { name: "Seed group slice-1" })).toContainText("seed-1");
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const status = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(status).toContainText(/source sha256:[a-f0-9]{64}/);
    const firstSourceHash = (await status.innerText()).match(/source (sha256:[a-f0-9]{64})/)?.[1];
    expect(firstSourceHash).toBeDefined();
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toHaveLength(1);
    expect(entry?.checkpoint.source.seeds[0].group).toBe("slice-1");
    expect(entry?.checkpoint.source.seeds[0].position[2]).toBe(fixed);
    expect(entry?.checkpoint.source.field.references[0].sceneFingerprint).toMatch(/^[a-f0-9]{64}$/);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByRole("region", { name: "Seed group slice-1" })).toContainText("seed-1");
    await expect(editor.getByTestId("vector-field3d-trajectory-status")).toHaveCount(0);
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(`source ${firstSourceHash}`);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 places 80³ 3D seeds on explicit planes through camera rays", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-vortex-80-overview.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    const figure = editor.getByRole("figure", { name: "3D vector arrow renderer" });
    await expect(figure.getByLabel("3D preview provenance")).toContainText(/Verified dataset source/);
    const clickCenter = async (dx = 0, dy = 0) => {
      const canvas = figure.locator("canvas");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("3D canvas did not mount");
      await canvas.click({ position: { x: bounds.width / 2 + dx, y: bounds.height / 2 + dy } });
    };
    for (const plane of ["xy", "xz", "yz"] as const) {
      await editor.getByLabel("3D camera preset").selectOption(plane);
      await figure.getByLabel("3D seed plane", { exact: true }).selectOption(plane);
      await clickCenter();
      const proposal = editor.getByTestId("vector-field3d-seed-proposal");
      await expect(proposal).toBeVisible();
      await expect(figure.getByTestId("vector-field3d-3d-seed-marker")).toBeVisible();
      const text = await proposal.innerText();
      for (const axis of ["x", "y", "z"] as const) {
        const value = Number(text.match(new RegExp(`\\b${axis} = (-?[\\d.]+) m`))?.[1]);
        expect(Number.isFinite(value) && Math.abs(value) <= 4).toBe(true);
      }
      await clickCenter(25, -25);
      const orientedText = await proposal.innerText();
      const oriented = (axis: "x" | "y" | "z") =>
        Number(orientedText.match(new RegExp(`\\b${axis} = (-?[\\d.]+) m`))?.[1]);
      if (plane === "xy") { expect(oriented("x")).toBeGreaterThan(0);
        expect(oriented("y")).toBeGreaterThan(0); }
      if (plane === "xz") { expect(oriented("x")).toBeLessThan(0);
        expect(oriented("z")).toBeGreaterThan(0); }
      if (plane === "yz") { expect(oriented("y")).toBeGreaterThan(0);
        expect(oriented("z")).toBeGreaterThan(0); }
      await expect(editor).toContainText("Trajectory seeds (0/32)");
    }
    await editor.getByLabel("3D camera preset").selectOption("xy");
    await figure.getByLabel("3D seed plane", { exact: true }).selectOption("xy");
    await figure.getByLabel("3D seed plane coordinate").fill("1");
    await clickCenter();
    await expect(editor.getByTestId("vector-field3d-seed-proposal"))
      .toContainText("z = 1.0000000 m");
    await figure.getByLabel("3D seed plane coordinate").fill("1.5");
    await expect(editor.getByTestId("vector-field3d-seed-proposal")).toHaveCount(0);
    await figure.getByLabel("3D seed plane", { exact: true }).selectOption("yz");
    await clickCenter();
    await expect(editor.getByRole("alert").filter({ hasText: /ray misses the selected seed plane/i }))
      .toBeVisible();
    await figure.getByLabel("3D seed plane", { exact: true }).selectOption("xy");
    await figure.locator("canvas").click({ position: { x: 5, y: 5 } });
    await expect(editor.getByRole("alert").filter({ hasText: /outside the field domain/i }))
      .toBeVisible();
    await expect(editor.getByTestId("vector-field3d-seed-proposal")).toHaveCount(0);
    await clickCenter();
    const proposal = editor.getByTestId("vector-field3d-seed-proposal");
    await proposal.getByLabel("Proposed seed group").selectOption("");
    await proposal.getByRole("button", { name: "Add proposed seed" }).click();
    await expect(editor.getByRole("region", { name: "Seed group 3d-1" })).toContainText("seed-1");
    for (let index = 0; index < 3; index++)
      await editor.getByRole("button", { name: "Add ring (8)" }).click();
    await editor.getByRole("button", { name: "Add line (5)" }).click();
    await editor.getByRole("button", { name: "Add seed", exact: true }).click();
    await editor.getByRole("button", { name: "Add seed", exact: true }).click();
    await expect(editor).toContainText("Trajectory seeds (32/32)");
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    await expect(figure.getByLabel("3D seed plane", { exact: true })).toBeDisabled();
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 measured Burgers 3D seed keeps provenance and group after Project reopen", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-burgers-horizontal-level1.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "3D arrows" }).click();
    await editor.getByRole("button", { name: "Verify & render arrows" }).click();
    const figure = editor.getByRole("figure", { name: "3D vector arrow renderer" });
    await expect(figure.getByLabel("3D preview provenance")).toContainText(/Verified dataset source/);
    await editor.getByLabel("3D camera preset").selectOption("xy");
    await figure.getByLabel("3D seed plane", { exact: true }).selectOption("xy");
    const canvas = figure.locator("canvas");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("3D canvas did not mount");
    await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    const proposal = editor.getByTestId("vector-field3d-seed-proposal");
    await expect(proposal).toBeVisible();
    const fixed = Number(await figure.getByLabel("3D seed plane coordinate").inputValue());
    await expect(proposal).toContainText(`z = ${fixed.toPrecision(8)} m`);
    await proposal.getByLabel("Proposed seed group").selectOption("");
    await proposal.getByRole("button", { name: "Add proposed seed" }).click();
    await expect(editor.getByRole("region", { name: "Seed group 3d-1" })).toContainText("seed-1");
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const status = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(status).toContainText(/source sha256:[a-f0-9]{64}/);
    const sourceHash = (await status.innerText()).match(/source (sha256:[a-f0-9]{64})/)?.[1];
    expect(sourceHash).toBeDefined();
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toHaveLength(1);
    expect(entry?.checkpoint.source.seeds[0].group).toBe("3d-1");
    expect(entry?.checkpoint.source.seeds[0].position[2]).toBe(fixed);
    expect(entry?.checkpoint.source.field.references[0].sceneFingerprint).toMatch(/^[a-f0-9]{64}$/);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByRole("region", { name: "Seed group 3d-1" })).toContainText("seed-1");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(`source ${sourceHash}`);
  } finally { await closeSurfaceApp(app); }
});

for (const [name, folder] of [
  ["80³ analytic vortex", "output/scientific-vortex-80-overview.sscene"],
  ["measured Burgers", "output/scientific-burgers-horizontal-level1.sscene"],
] as const) {
  test(`SCI-12 profiles Electron v3 equilibrium ${name}`, async ({}, testInfo) => {
    test.setTimeout(180_000);
    const app = await launchSurfaceApp();
    try {
      const page = app.page;
      await resetSurfaceAppState(page);
      await page.getByTestId("workspace-nav-graphs").click();
      await app.app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      }, resolve(folder));
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Import scientific dataset" }).click();
      await page.getByRole("dialog", { name: "Import verified scientific dataset" })
        .getByRole("button", { name: "Open in Field Explorer" }).click();
      const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
      const rendererPid = await app.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId());
      const workingSet = () => {
        if (!Number.isSafeInteger(rendererPid) || rendererPid <= 0) return null;
        const bytes = process.platform === "win32" ?
          execFileSync("powershell", ["-NoProfile", "-Command",
            `(Get-Process -Id ${rendererPid}).WorkingSet64`], { encoding: "utf8" }) :
          execFileSync("ps", ["-o", "rss=", "-p", String(rendererPid)], { encoding: "utf8" });
        const value = Number(bytes.trim());
        return Number.isFinite(value) ? value * (process.platform === "win32" ? 1 : 1024) : null;
      };
      const memoryBefore = workingSet();
      const started = await page.evaluate(() => performance.now());
      await editor.getByRole("button", { name: "Find equilibria" }).click();
      const result = editor.getByTestId("vector-field3d-equilibria");
      await expect(result).toContainText("Verified source tiles:");
      const clickToResultMs = await page.evaluate(start => performance.now() - start, started);
      const memoryAfter = workingSet();
      const profile = JSON.parse((await result.getAttribute("data-equilibrium-profile")) ?? "null") as
        { tileRoundTripMs: number; rendererForwardMs: number; workerAdmissionMs: number;
          workerComputeMs: number; workerWallMs: number; totalWorkerWallMs: number } | null;
      expect(profile).not.toBeNull();
      expect(profile!.tileRoundTripMs).toBeGreaterThan(0);
      expect(profile!.workerAdmissionMs).toBeGreaterThan(0);
      expect(profile!.workerComputeMs).toBeGreaterThan(0);
      const text = await result.innerText();
      const residentTileBytes = Number(text.match(/Resident cache (\d+) bytes/)?.[1]);
      expect(residentTileBytes).toBeGreaterThan(0);
      expect(residentTileBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
      const measured = { fixture: name, clickToResultMs: +clickToResultMs.toFixed(1),
        residentTileBytes, rendererWorkingSetDeltaBytes: memoryBefore !== null && memoryAfter !== null ?
          memoryAfter - memoryBefore : null,
        profile };
      console.log(`SCI-12 Electron equilibrium profile: ${JSON.stringify(measured)}`);
      await testInfo.attach("electron-equilibrium-profile.json", {
        body: JSON.stringify(measured, null, 2), contentType: "application/json" });
    } finally { await closeSurfaceApp(app); }
  });
}

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
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
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
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(differential).toHaveCount(0);
    await editor.getByRole("button", { name: "Reverify probe" }).click();
    await expect(editor.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(values).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "XY field slice" })).toHaveCount(0);
    await expect(editor.getByRole("figure", { name: "3D vector arrow renderer" })).toHaveCount(0);
    await rm(resource);
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
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
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    const differential = editor.getByTestId("vector-field3d-differential");
    await expect(differential).toContainText("Divergence 0.00000 1/s");
    await expect(differential).toContainText("Curl (0.00000, 0.00000, 2.00000) 1/s");
    await editor.getByLabel("Probe x").fill("4");
    await expect(differential).toHaveCount(0);
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
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

test("SCI-05 normalized ring lines report batch progress and SCI-06 scalar layers", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Add ring (8)" }).click();
    await expect(editor).toContainText("Trajectory seeds (8/32)");
    await editor.getByLabel("Trajectory mode").selectOption("normalized-field-line");
    await editor.getByLabel("Trajectory solver method").selectOption("rk45");
    await editor.getByLabel("Max normalized line length").fill("3");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByText("Trajectory seeds 8/8")).toBeVisible();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText("line-limit");
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText("line parameter");
    await editor.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await editor.getByLabel("Probe x").fill("1");
    await editor.getByRole("button", { name: "Analyze field calculus" }).click();
    await expect(editor.getByTestId("vector-field3d-differential"))
      .toContainText("Local structure: rotation-dominated");
    await editor.getByRole("button", { name: "XY slice" }).click();
    await editor.getByLabel("Slice displayed field").selectOption("grad-speed-x");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("grad-speed-x");
    await editor.getByLabel("Slice displayed field").selectOption("laplacian-speed");
    await editor.getByRole("button", { name: "Preview slice" }).click();
    await expect(editor.getByRole("figure", { name: "XY field slice" }))
      .toContainText("laplacian-speed");
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Open saved document" }).click();
    await expect(editor.getByLabel("Trajectory mode")).toHaveValue("normalized-field-line");
    await expect(editor.getByLabel("Slice displayed field")).toHaveValue("laplacian-speed");
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
      await expect(editor.getByTestId("vector-field3d-preview-status"))
        .toContainText("Full detail: 512 of 512 evaluated positions");
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
    await viewport.hover();
    await page.mouse.down();
    await expect(editor.getByTestId("vector-field3d-preview-status"))
      .toContainText("Overview:");
    await page.mouse.up();
    await expect(editor.getByTestId("vector-field3d-preview-status"))
      .toContainText("Full detail: 512 of 512 evaluated positions");
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

test("SCI-13 80³ trajectory groups use saved colors without changing verified source", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-vortex-80-overview.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Add line (5)" }).click();
    await editor.getByRole("button", { name: "Add plane grid (9)" }).click();
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const figure = editor.getByRole("figure", { name: "3D vector arrow renderer" });
    const legend = figure.getByTestId("vector-field3d-trajectory-group-colors");
    await expect(legend.locator('[data-seed-group="line-1"]')).toBeVisible();
    await expect(legend.locator('[data-seed-group="plane-1"]')).toBeVisible();
    const sourceBefore = await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!);
      return { structure: value.identity.structuralHash,
        fingerprint: value.source.field.references[0].sceneFingerprint };
    });
    const trajectorySource = (await editor.getByTestId("vector-field3d-trajectory-status").innerText())
      .match(/source (sha256:[a-f0-9]{64})/)?.[1];
    await editor.getByLabel("Color line-1 seed group").fill("#ff3366");
    await editor.getByLabel("Name line-1 seed group").fill("Core swirl");
    await editor.getByRole("button", { name: "Rename line-1 group" }).click();
    await expect(legend.locator('[data-seed-group="line-1"]'))
      .toContainText("Core swirl #ff3366");
    await expect(legend.locator('[data-seed-group="line-1"] span'))
      .toHaveCSS("background-color", "rgb(255, 51, 102)");
    await editor.getByLabel("Show line-1 seed group").uncheck();
    await expect(legend.locator('[data-seed-group="line-1"]')).toHaveCount(0);
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(legend.locator('[data-seed-group="line-1"]')).toBeVisible();
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(legend.locator('[data-seed-group="line-1"]')).toContainText("line-1 #ff3366");
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(legend.locator('[data-seed-group="line-1"]')).not.toContainText("#ff3366");
    for (let index = 0; index < 3; index++)
      await editor.getByRole("button", { name: "Redo seed edit" }).click();
    await expect(editor.getByLabel("Show line-1 seed group")).not.toBeChecked();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(`source ${trajectorySource}`);
    const sourceAfter = await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!);
      return { structure: value.identity.structuralHash,
        fingerprint: value.source.field.references[0].sceneFingerprint };
    });
    expect(sourceAfter).toEqual(sourceBefore);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 measured Burgers group deletion undo and Project reopen restore exact seeds", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-burgers-horizontal-level1.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await editor.getByRole("button", { name: "Add line (5)" }).click();
    await editor.getByRole("button", { name: "Add plane grid (9)" }).click();
    await editor.getByLabel("Color line-1 seed group").fill("#ff3366");
    await editor.getByLabel("Name line-1 seed group").fill("Measured swirl");
    await editor.getByRole("button", { name: "Rename line-1 group" }).click();
    await editor.getByLabel("Show plane-1 seed group").uncheck();
    const beforeDelete = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    await editor.getByRole("button", { name: "Delete line-1 group" }).click();
    await expect(editor).toContainText("Trajectory seeds (9/32)");
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(editor).toContainText("Trajectory seeds (14/32)");
    const restored = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    expect(restored.source.seeds).toEqual(beforeDelete.source.seeds);
    expect(restored.workspace.seedGroupStyles).toEqual(beforeDelete.workspace.seedGroupStyles);
    expect(restored.workspace.hiddenSeedGroups).toEqual(beforeDelete.workspace.hiddenSeedGroups);
    await editor.getByRole("button", { name: "Redo seed edit" }).click();
    await expect(editor).toContainText("Trajectory seeds (9/32)");
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(editor.getByRole("region", { name: "Seed group line-1" }))
      .toContainText("Measured swirl");
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const status = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(status).toContainText(/source sha256:[a-f0-9]{64}/);
    const sourceHash = (await status.innerText()).match(/source (sha256:[a-f0-9]{64})/)?.[1];
    expect(sourceHash).toBeDefined();
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toEqual(beforeDelete.source.seeds);
    expect(entry?.checkpoint.workspace.seedGroupStyles).toEqual(beforeDelete.workspace.seedGroupStyles);
    expect(entry?.checkpoint.workspace.hiddenSeedGroups).toEqual(["plane-1"]);
    expect(entry?.checkpoint.source.field.references[0].sceneFingerprint)
      .toBe(beforeDelete.source.field.references[0].sceneFingerprint);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByLabel("Name line-1 seed group")).toHaveValue("Measured swirl");
    await expect(editor.getByLabel("Color line-1 seed group")).toHaveValue("#ff3366");
    await expect(editor.getByLabel("Show plane-1 seed group")).not.toBeChecked();
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(`source ${sourceHash}`);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 80³ sphere, shell and random patterns stay bounded and repeat exactly", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-vortex-80-overview.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    const patterns = editor.locator(".vector-field3d-spatial-seeds");
    await patterns.locator("summary").click();
    await patterns.getByLabel("Spatial center x").fill("1");
    await patterns.getByLabel("Spatial center y").fill("-0.5");
    await patterns.getByLabel("Spatial center z").fill("0.25");
    await patterns.getByLabel("Spatial seed radius").fill("1.5");
    await patterns.getByLabel("Spatial seed count").fill("8");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await expect(editor.getByRole("region", { name: "Seed group shell-1" })).toBeVisible();
    await patterns.getByLabel("Spatial seed pattern").selectOption("sphere");
    await patterns.getByLabel("Spatial seed count").fill("6");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await patterns.getByLabel("Spatial seed pattern").selectOption("random");
    await patterns.getByLabel("Spatial random seed").fill("42");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await expect(editor).toContainText("Trajectory seeds (26/32)");
    const document = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    const seeds = document.source.seeds as { group: string; position: number[] }[];
    const ofGroup = (id: string) => seeds.filter(seed => seed.group === id)
      .map(seed => seed.position);
    const shell = ofGroup("shell-1"), sphere = ofGroup("sphere-1");
    expect(shell).toHaveLength(8);
    expect(sphere).toHaveLength(6);
    for (const point of shell)
      expect(Math.hypot(point[0]! - 1, point[1]! + .5, point[2]! - .25))
        .toBeCloseTo(1.5, 10);
    for (const point of [...shell, ...sphere, ...ofGroup("random-1")])
      expect(point.every(value => value >= -4 && value <= 4)).toBe(true);
    expect(ofGroup("random-1")).toEqual(ofGroup("random-2"));
    await patterns.getByLabel("Spatial seed count").fill("7");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /32-seed limit/i })).toBeVisible();
    await expect(editor.getByRole("region", { name: "Seed group random-3" })).toHaveCount(0);
    await patterns.getByLabel("Spatial seed count").fill("1");
    await patterns.getByLabel("Spatial center x").fill("3.5");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await expect(editor.getByRole("alert").filter({ hasText: /complete seed sphere/i }))
      .toBeVisible();
    const afterRejected = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    expect(afterRejected.source.seeds).toEqual(document.source.seeds);
    expect(afterRejected.identity.structuralHash).toBe(document.identity.structuralHash);
    expect(afterRejected.source.field.references[0].sceneFingerprint)
      .toBe(document.source.field.references[0].sceneFingerprint);
  } finally { await closeSurfaceApp(app); }
});

test("SCI-13 measured Burgers spatial seeds survive undo, redo and Project reopen", async () => {
  test.setTimeout(180_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, resolve("output/scientific-burgers-horizontal-level1.sscene"));
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    let editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    const patterns = editor.locator(".vector-field3d-spatial-seeds");
    await patterns.locator("summary").click();
    await patterns.getByLabel("Spatial seed count").fill("5");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await patterns.getByLabel("Spatial seed pattern").selectOption("random");
    await patterns.getByLabel("Spatial seed count").fill("4");
    await patterns.getByLabel("Spatial random seed").fill("17");
    await patterns.getByRole("button", { name: "Add spatial seed group" }).click();
    await expect(editor).toContainText("Trajectory seeds (9/32)");
    const generated = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    await editor.getByRole("button", { name: "Undo seed edit" }).click();
    await expect(editor).toContainText("Trajectory seeds (5/32)");
    await editor.getByRole("button", { name: "Redo seed edit" }).click();
    await expect(editor).toContainText("Trajectory seeds (9/32)");
    const restored = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("math3d.scientific-field-explorer.session.v1")!));
    expect(restored.source.seeds).toEqual(generated.source.seeds);
    expect(restored.source.field.references).toEqual(generated.source.field.references);
    await editor.getByLabel("Trajectory max time").fill("0.05");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    const status = editor.getByTestId("vector-field3d-trajectory-status");
    await expect(status).toContainText(/source sha256:[a-f0-9]{64}/);
    const sourceHash = (await status.innerText()).match(/source (sha256:[a-f0-9]{64})/)?.[1];
    expect(sourceHash).toBeDefined();
    await editor.getByRole("button", { name: "Save document" }).click();
    await editor.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    await projectPanel.getByTestId("project-save").click();
    await expect(projectPanel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) => item.module === "vector3d");
    expect(entry?.checkpoint.source.seeds).toEqual(generated.source.seeds);
    expect(entry?.checkpoint.source.field.references[0].sceneFingerprint)
      .toBe(generated.source.field.references[0].sceneFingerprint);
    await projectPanel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await projectPanel.getByTestId(`project-open-field-explorer-${entry.expected.id}`).click();
    editor = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(editor.getByRole("region", { name: "Seed group shell-1" })).toContainText("seed-1");
    await expect(editor.getByRole("region", { name: "Seed group random-1" })).toContainText("seed-6");
    await editor.getByRole("button", { name: "Run trajectories" }).click();
    await expect(editor.getByTestId("vector-field3d-trajectory-status"))
      .toContainText(`source ${sourceHash}`);
  } finally { await closeSurfaceApp(app); }
});
