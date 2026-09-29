import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const start = async (page: Page) => {
  await page.route("**/api/worker/**", r => r.fulfill({ status: 503, body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
  await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
};
const save = async (page: Page) => { await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-save").click();
  await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved"); await page.getByTestId("kernel-workspace-toggle").click(); };
const checkpoint = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!).entries.find((e: { module: string }) => e.module === "graph2d").checkpoint);

test("G2D41 Dense previews immediately, Close keeps settings and the selected inspector", async ({ page }) => {
  await start(page); await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Select Parabola", exact: true }).click();
  const inspector = page.getByLabel("Graph inspector", { exact: true }); await expect(inspector.locator(".graph2d-inspector-details").first()).toContainText("Parabola");
  await expect(inspector.getByTestId("graph2d-sampling-status")).toContainText("converged");
  await save(page); const original = await checkpoint(page);
  await page.evaluate(() => {
    document.documentElement.dataset.gridSamplingStarts = "0";
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker { constructor(url: string | URL, options?: WorkerOptions) { super(url, options);
      if (String(url).includes("graph2dSamplingWorker")) document.documentElement.dataset.gridSamplingStarts = String(Number(document.documentElement.dataset.gridSamplingStarts) + 1);
    } };
  });
  const before = await page.locator(".graph2d-grid-major").count();
  await page.getByRole("button", { name: "Grid", exact: true }).click(); const panel = page.getByTestId("graph2d-grid-settings");
  await panel.getByLabel("Grid density", { exact: true }).selectOption("dense");
  await expect.poll(() => page.locator(".graph2d-grid-major").count()).toBeGreaterThan(before);
  await save(page); expect((await checkpoint(page)).display.axes.gridOptions).toBeUndefined();
  await panel.getByRole("button", { name: "Close grid settings", exact: true }).click();
  await expect(inspector.locator(".graph2d-inspector-details").first()).toContainText("Parabola");
  await save(page); const saved = await checkpoint(page); expect(saved.display.axes.gridOptions.density).toBe("dense");
  expect(saved.selection).toEqual(original.selection); expect(saved.source).toEqual(original.source);
  expect(await page.evaluate(() => document.documentElement.dataset.gridSamplingStarts)).toBe("0");
  await page.getByRole("button", { name: "Grid", exact: true }).click(); await panel.getByLabel("Grid density", { exact: true }).selectOption("sparse");
  // Escape must dismiss Grid even after focus returned to the plot/toolbar; a repeated Escape on its button must not clear selection.
  await page.getByRole("button", { name: "Grid", exact: true }).focus(); await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(inspector.locator(".graph2d-inspector-details").first()).toContainText("Parabola");
  await page.getByRole("button", { name: "Grid", exact: true }).click(); await expect(panel.getByLabel("Grid density", { exact: true })).toHaveValue("dense");
});

test("G2D41 inspector keeps observations and scroll position while zoom sampling is pending", async ({ page }) => {
  await start(page); await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Select Parabola", exact: true }).click();
  const inspector = page.getByLabel("Graph inspector", { exact: true }); await expect(inspector.getByTestId("graph2d-sampling-status")).toContainText("converged");
  const observedField = inspector.locator('.graph2d-inspector-details').first().locator('dt:text-is("Observed") + dd');
  const observed = await observedField.innerText();
  await inspector.evaluate(el => { el.scrollTop = 120; });
  const scroll = await inspector.evaluate(el => el.scrollTop), bounds = await inspector.boundingBox();
  await page.evaluate(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        setTimeout(() => {
          if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
          else super.postMessage(message, transferOrOptions);
        }, 3000);
      }
    };
  });
  const plot = await page.getByTestId("graph2d-plot").boundingBox(); await page.mouse.move(plot!.x + plot!.width * .55, plot!.y + plot!.height * .45); await page.mouse.wheel(0, -180);
  await expect(inspector.getByTestId("graph2d-sampling-status")).toContainText("Updating");
  await expect(observedField).toHaveText(observed);
  await expect.poll(() => inspector.evaluate(el => el.scrollTop)).toBe(scroll);
  expect(await inspector.boundingBox()).toEqual(bounds);
});

test("G2D41 grid controls retain source, saved spacing and reversible display intent", async ({ page }, info) => {
  await start(page); const original = await checkpoint(page), opener = page.getByRole("button", { name: "Grid", exact: true });
  await opener.focus(); await page.keyboard.press("Enter"); const panel = page.getByTestId("graph2d-grid-settings");
  await expect(panel.getByRole("checkbox", { name: "Show grid", exact: true })).toBeFocused();
  await panel.getByLabel("X grid spacing", { exact: true }).fill("0"); await panel.getByRole("button", { name: "Apply grid settings", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("positive");
  await panel.getByLabel("X grid spacing", { exact: true }).fill("0.5"); await panel.getByLabel("Y grid spacing", { exact: true }).fill("1");
  await panel.getByLabel("Grid contrast", { exact: true }).selectOption("strong"); await panel.getByLabel("Show minor subdivisions", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Apply grid settings", exact: true }).click(); await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".graph2d-grid-minor")).toHaveCount(0); await expect(page.getByRole("button", { name: "Toggle polar grid", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused(); await save(page);
  const configured = await checkpoint(page); expect(configured.source).toEqual(original.source); expect(configured.identity).toEqual(original.identity);
  expect(configured.requiredCapabilities).toContain("graph2d.grid.v1"); expect(configured.display.axes.gridOptions.xStep).toBe(.5);
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await save(page);
  expect((await checkpoint(page)).display.axes.gridOptions).toBeUndefined();
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+y"); await save(page);
  await page.reload(); await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByTestId("kernel-workspace-reopen").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByRole("button", { name: "Grid", exact: true }).click(); await expect(page.getByLabel("X grid spacing", { exact: true })).toHaveValue("0.5");
  await page.screenshot({ path: info.outputPath("grid-settings.png") });
});

test("G2D41 dense-grid notice, visibility and compact keyboard access", async ({ page }, info) => {
  await start(page); await page.setViewportSize({ width: 700, height: 800 });
  await page.getByRole("button", { name: "Grid", exact: true }).click(); const panel = page.getByTestId("graph2d-grid-settings");
  await panel.getByLabel("X grid spacing", { exact: true }).fill("1e-100"); await panel.getByRole("button", { name: "Apply grid settings", exact: true }).click();
  await expect(page.getByTestId("graph2d-update-status")).toContainText("Manual X spacing");
  await panel.getByLabel("Show grid", { exact: true }).uncheck(); await panel.getByLabel("Show numbers", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Apply grid settings", exact: true }).click(); await page.keyboard.press("Escape");
  await expect(page.locator(".graph2d-grid")).toHaveCount(0); await expect(page.locator(".graph2d-tick-labels")).toHaveCount(0);
  await page.emulateMedia({ forcedColors: "active" }); await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.getByTestId("graph2d-grid-settings").getByRole("checkbox", { name: "Show grid", exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath("grid-compact-high-contrast.png") });
});
test("G2D37 continuation and scale policies preserve authored range, undo and saved log zoom", async ({ page }, info) => {
  await start(page); const source = (await checkpoint(page)).source;
  await page.getByTestId("main-viewer").focus(); for (let i = 0; i < 5; i++) await page.keyboard.press("-");
  await page.getByRole("button", { name: "Show continuation", exact: true }).click();
  await expect(page.locator("[data-graph2d-continuation]").first()).toHaveAttribute("stroke-opacity", "0.35");
  await expect.poll(() => page.locator("[data-graph2d-continuation]").first().getAttribute("d")).not.toBe("");
  await save(page); expect((await checkpoint(page)).source).toEqual(source);
  await page.screenshot({ path: info.outputPath("continuation.png") });
  await page.getByRole("button", { name: "Scales", exact: true }).click(); const panel = page.getByTestId("graph2d-scales");
  await panel.getByLabel("X scale", { exact: true }).selectOption("log10"); await panel.getByLabel("Y scale", { exact: true }).selectOption("log10");
  await panel.getByLabel("Axis aspect", { exact: true }).selectOption("free");
  await panel.getByRole("button", { name: "Apply scales and bounds", exact: true }).click(); await expect(panel.getByRole("alert")).toContainText("positive");
  for (const [key, value] of Object.entries({ xMin: ".1", xMax: "10", yMin: ".01", yMax: "100" })) await panel.getByLabel(`Axis ${key}`, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "Apply scales and bounds", exact: true }).click(); await expect(panel.getByRole("alert")).toHaveCount(0);
  await panel.getByRole("button", { name: "Close scales", exact: true }).click(); await save(page);
  const d = await checkpoint(page); expect(d.requiredCapabilities).toContain("graph2d.scales.v1"); expect(d.source).toEqual(source);
  await expect.poll(() => page.getByTestId("graph2d-plot").locator("[data-graph2d-path]").first().getAttribute("d")).not.toBe("");
  expect(await page.getByTestId("graph2d-plot").innerHTML()).not.toMatch(/NaN|Infinity/);
  await page.screenshot({ path: info.outputPath("log-scales.png") });
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await save(page);
  expect((await checkpoint(page)).display.viewport.xScale).toBeUndefined();
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+y"); await save(page);
  expect((await checkpoint(page)).display.viewport.xScale).toBe("log10");
  await page.reload(); await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByTestId("kernel-workspace-reopen").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByRole("button", { name: "Scales", exact: true }).click(); await expect(panel.getByLabel("X scale", { exact: true })).toHaveValue("log10");
});
test("G2D39 checked data fitting, residuals, stale models and offline uncertainty publication", async ({ page, context }, info) => {
  await start(page); const functions = page.getByLabel("Graph functions");
  await functions.getByRole("button", { name: "Add data series", exact: true }).click();
  await functions.getByLabel("Data series name").fill("Measurements");
  await functions.getByLabel("Data series import").fill("x,y\n0,1\n1,3\n2,4\n3,7\n4,8\n5,12\n6,NA");
  await functions.getByRole("button", { name: "Save data series", exact: true }).click();
  await functions.getByRole("button", { name: "Select Measurements", exact: true }).click(); await save(page);
  const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1")), panel = page.getByRole("region", { name: "Regression fitting", exact: true });
  await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(0);
  await panel.getByRole("button", { name: "Fit dataset", exact: true }).click(); await expect(panel.getByRole("status")).toHaveText("Current regression");
  await expect(panel).toContainText("n=6 · excluded=1 · df=4"); await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(1);
  await panel.getByText("Residuals (6)", { exact: true }).click(); await expect(panel.getByRole("rowheader", { name: "row_1", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
  await page.getByRole("button", { name: "Fit", exact: true }).click(); await page.screenshot({ path: info.outputPath("regression.png") });
  await panel.getByLabel("Regression model", { exact: true }).selectOption("quadratic"); await expect(panel.getByRole("status")).toContainText("Stale regression");
  await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(0); await panel.getByRole("button", { name: "Fit dataset", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Current regression"); await expect(panel).toContainText("df=3");
  await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
  const pending = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Export HTML report", exact: true }).click();
  const path = info.outputPath("regression-report.html"), download = await pending; await download.saveAs(path);
  const html = await readFile(path, "utf8"); expect(html).toContain("95% prediction"); expect(html).toContain("row_1"); expect(html).toContain("graph2d.regression");
  const report = await context.newPage(), network: string[] = []; report.on("request", request => { if (request.url().startsWith("http")) network.push(request.url()); });
  await report.goto(pathToFileURL(path).href); await expect(report.getByRole("columnheader", { name: "Residual", exact: true })).toBeVisible();
  await report.getByRole("columnheader", { name: "Residual", exact: true }).scrollIntoViewIfNeeded();
  await report.emulateMedia({ media: "print" }); await expect(report.getByRole("columnheader", { name: "Residual", exact: true })).toBeVisible();
  await report.screenshot({ path: info.outputPath("regression-report.png") }); expect(network).toEqual([]); await report.close();
  await page.keyboard.press("Escape"); await panel.getByRole("button", { name: "Clear regression", exact: true }).click();
  await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(0);
});

test("G2D40 keyboard scales focus, high contrast patterns and compact controls", async ({ page }, info) => {
  await start(page); const opener = page.getByRole("button", { name: "Scales", exact: true });
  await opener.focus(); await page.keyboard.press("Enter"); const panel = page.getByTestId("graph2d-scales");
  await expect(panel.getByLabel("X scale", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(panel.getByLabel("Y scale", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(panel).not.toBeVisible(); await expect(opener).toBeFocused();
  await page.getByTestId("main-viewer").focus(); for (let i = 0; i < 4; i++) await page.keyboard.press("-");
  await page.getByRole("button", { name: "Show continuation", exact: true }).click();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const extension = page.locator("[data-graph2d-continuation]").first(); await expect(extension).toHaveAttribute("stroke-dasharray", "3 6");
  expect(await extension.evaluate(e => getComputedStyle(e).strokeOpacity)).toBe("0.75");
  await page.screenshot({ path: info.outputPath("professional-high-contrast.png") });
  await page.setViewportSize({ width: 600, height: 900 }); await opener.click();
  await expect(panel.getByLabel("X scale", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
  const viewer = (await page.getByTestId("main-viewer").boundingBox())!;
  const workspace = (await page.getByTestId("graphs-workspace").boundingBox())!;
  expect(viewer.width).toBeGreaterThanOrEqual(workspace.width - 2);
  for (const button of await page.locator(".graph2d-toolbar button").all()) {
    const box = (await button.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(viewer.x); expect(box.x + box.width).toBeLessThanOrEqual(viewer.x + viewer.width + 1);
  }
  await page.screenshot({ path: info.outputPath("professional-compact.png") });
});

test("G2D40 logarithmic display omits non-positive piecewise endpoints and selected probes", async ({ page }) => {
  await start(page); await page.getByTestId("graph-gallery-open").click();
  await page.getByLabel("Search graphs").fill("Endpoints");
  await page.getByRole("button", { name: "Open Endpoints and missing data", exact: true }).click();
  await page.getByLabel("Graph functions").getByRole("button", { name: "Select Jump", exact: true }).click();
  await page.getByRole("button", { name: "Scales", exact: true }).click(); const panel = page.getByTestId("graph2d-scales");
  await panel.getByLabel("X scale", { exact: true }).selectOption("log10"); await panel.getByLabel("Y scale", { exact: true }).selectOption("log10");
  for (const [key, value] of Object.entries({ xMin: ".1", xMax: "10", yMin: ".1", yMax: "10" })) await panel.getByLabel(`Axis ${key}`, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "Apply scales and bounds", exact: true }).click();
  await panel.getByRole("button", { name: "Close scales", exact: true }).click();
  await expect.poll(() => page.getByTestId("graph2d-plot").innerHTML()).not.toMatch(/NaN|Infinity/);
  await expect(page.locator("[data-graph2d-endpoint]")).toHaveCount(1);
});
