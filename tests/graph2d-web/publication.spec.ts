import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const open = async (page: Page) => {
  await page.route("**/api/worker/**", route => route.fulfill({ status: 503, body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
  await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
};
test("G2D36 real worker downloads four offline publications from one snapshot", async ({ page, context }, info) => {
  await open(page);
  const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
  await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
  await expect(dialog.getByRole("button", { name: "Close graph export" })).toBeFocused();
  await dialog.getByLabel("Image size").selectOption("640x480");
  await dialog.getByLabel("X unit label").fill("s"); await dialog.getByLabel("Y unit label").fill("m");
  await expect(dialog.getByRole("button", { name: "Export PNG", exact: true })).toBeEnabled();
  const snapshot = await dialog.locator("code").textContent(), paths: Record<string, string> = {};
  for (const format of ["svg", "png", "csv", "html"]) {
    const pending = page.waitForEvent("download"); await dialog.getByRole("button", { name: format === "html" ? "Export HTML report" : `Export ${format.toUpperCase()}`, exact: true }).click();
    const download = await pending, path = info.outputPath(`publication.${format}`); await download.saveAs(path); paths[format] = path;
    expect(download.suggestedFilename()).toMatch(new RegExp(`publication-.*\\.${format}$`));
    if (format !== "png") expect(await readFile(path, "utf8")).toContain(snapshot!);
  }
  const svg = await readFile(paths.svg, "utf8"); expect(svg).toContain('"x":"s"'.replace(/"/g, "&quot;"));
  expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(page.getByTestId("graph2d-export-open")).toBeFocused();
  const report = await context.newPage(), requests: string[] = [];
  report.on("request", request => { if (request.url().startsWith("http")) requests.push(request.url()); });
  await report.goto(pathToFileURL(paths.html).href); await expect(report.getByRole("heading", { name: "Two slopes", exact: true })).toBeVisible();
  await expect(report.getByRole("img")).toHaveCount(1); await expect(report.locator('th[scope="col"]')).not.toHaveCount(0);
  await report.screenshot({ path: info.outputPath("report.png"), fullPage: true });
  await report.screenshot({ path: info.outputPath("report-first-page.png") }); expect(requests).toEqual([]);
  const image = await context.newPage(); await image.goto(pathToFileURL(paths.png).href);
  expect(await image.locator("img").evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([640, 480]);
  console.log(`Publication visual QA: ${paths.png} ; ${info.outputPath("report.png")}`);
});

test("G2D36 closes/cancels workers and rejects stale settings; worker failure is recoverable", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker, state = { active: 0, fail: false, hold: false };
    (window as unknown as { publicationWorkers: typeof state }).publicationWorkers = state;
    window.Worker = class extends NativeWorker {
      tracked = false; stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.tracked = String(url).includes("graph2dPublicationWorker"); if (this.tracked) state.active++; }
      postMessage(message: unknown) {
        if (this.tracked && state.hold) return;
        if (this.tracked && state.fail) { this.dispatchEvent(new ErrorEvent("error", { message: "Injected export worker failure" })); return; }
        super.postMessage(message);
      }
      terminate() { if (this.tracked && !this.stopped) { state.active--; this.stopped = true; } super.terminate(); }
    };
  });
  await open(page);
  const set = (value: { fail?: boolean; hold?: boolean }) => page.evaluate(value => Object.assign((window as unknown as { publicationWorkers: object }).publicationWorkers, value), value);
  const active = () => page.evaluate(() => (window as unknown as { publicationWorkers: { active: number } }).publicationWorkers.active);
  await set({ hold: true }); await page.getByTestId("graph2d-export-open").click(); await expect.poll(active).toBe(1);
  await page.keyboard.press("Escape"); await expect.poll(active).toBe(0);
  await set({ hold: false, fail: true }); await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
  await expect(dialog.getByRole("alert")).toContainText("Injected export worker failure"); await expect.poll(active).toBe(0);
  await set({ fail: false }); await dialog.getByRole("button", { name: "Retry export" }).click();
  await dialog.getByLabel("X unit label").fill("old"); await dialog.getByLabel("X unit label").fill("new");
  await expect(dialog.getByRole("button", { name: "Export SVG", exact: true })).toBeEnabled();
  await expect(dialog.locator("pre")).toContainText('"x": "new"'); await expect.poll(active).toBe(0);
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("export-narrow.png") });
  await set({ hold: true }); await dialog.getByLabel("Image size").selectOption("640x480");
  await expect(dialog.getByRole("alert")).toContainText("worker deadline", { timeout: 12000 }); await expect.poll(active).toBe(0);
  await set({ hold: false }); await dialog.getByRole("button", { name: "Retry export" }).click();
  await expect(dialog.getByRole("button", { name: "Export SVG", exact: true })).toBeEnabled();
});
