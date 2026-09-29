import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const open = async (page: Page) => {
  await page.route("**/api/worker/**", route => route.fulfill({ status: 503, body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
  await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
  await expect(page.locator('[data-graph2d-path="function_2"]')).toHaveAttribute("d", /[ML]/);
};
const value = (page: Page) => page.getByTestId("graph2d-parameters").getByLabel("a preview value", { exact: true });
const save = async (page: Page) => { await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-save").click();
  await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved"); await page.getByTestId("kernel-workspace-toggle").click(); };
const configure = async (page: Page) => {
  await page.getByTestId("graph2d-parameters-open").click(); const panel = page.getByTestId("graph2d-parameters");
  await panel.getByRole("button", { name: "Configure a", exact: true }).click();
  await panel.getByLabel("Parameter min", { exact: true }).fill("-3"); await panel.getByLabel("Parameter max", { exact: true }).fill("3");
  await panel.getByLabel("Parameter step", { exact: true }).fill("0.5"); await panel.getByLabel("Parameter unit", { exact: true }).fill("ratio");
  await panel.getByRole("button", { name: "Save parameter", exact: true }).click(); await expect(value(page)).toHaveValue("2");
};

test("G2D38 parameter previews apply once, undo/redo, persist, animate and export offline frames", async ({ page, context }, info) => {
  await open(page); await configure(page); await save(page); const panel = page.getByTestId("graph2d-parameters"), curve = page.locator('[data-graph2d-path="function_2"]');
  await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible();
  const original = await curve.getAttribute("d"), sourceBefore = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
  await value(page).fill("-2"); await expect(page.getByTestId("graph2d-update-status")).toContainText("Parameter preview — not saved");
  await expect.poll(() => curve.getAttribute("d")).not.toBe(original);
  expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(sourceBefore);
  await expect(page.getByTestId("graph2d-export-open")).toBeDisabled();
  await panel.getByRole("button", { name: "Cancel preview", exact: true }).click(); await expect(curve).toHaveAttribute("d", original!);
  await panel.getByLabel("a slider", { exact: true }).focus(); await page.keyboard.press("ArrowLeft"); await expect(value(page)).toHaveValue("1.5");
  await panel.getByRole("button", { name: "Apply preview value", exact: true }).click(); await expect(value(page)).toHaveValue("1.5");
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await expect(value(page)).toHaveValue("2");
  await page.keyboard.press("Control+y"); await expect(value(page)).toHaveValue("1.5");
  await save(page);
  await panel.getByLabel("Animation from", { exact: true }).fill("-2"); await panel.getByLabel("Animation to", { exact: true }).fill("2");
  await panel.getByLabel("Animation frames", { exact: true }).fill("5"); await panel.getByLabel("Animation fps", { exact: true }).fill("10");
  const beforePlay = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
  await panel.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect(panel).toContainText("Frame 5 / 5"); await expect(panel.getByRole("button", { name: "Play animation", exact: true })).toBeEnabled();
  await expect(value(page)).toHaveValue("2"); expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(beforePlay);
  await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect(panel.getByRole("button", { name: "Download frame report", exact: true })).toBeEnabled();
  const paths: Record<string, string> = {};
  for (const format of ["report", "manifest"]) {
    const pending = page.waitForEvent("download"); await panel.getByRole("button", { name: `Download frame ${format}`, exact: true }).click();
    const download = await pending, path = info.outputPath(format === "report" ? "frames.html" : "frames.csv"); await download.saveAs(path); paths[format] = path;
  }
  const html = await readFile(paths.report, "utf8"), csv = await readFile(paths.manifest, "utf8");
  expect(html.match(/<svg /g)).toHaveLength(5); expect(csv).toContain('"0","0","a","-2","ratio"'); expect(csv).toContain('"4","0.4","a","2","ratio"');
  await page.screenshot({ path: info.outputPath("parameters-desktop.png") });
  const report = await context.newPage(), requests: string[] = []; report.on("request", request => { if (request.url().startsWith("http")) requests.push(request.url()); });
  await report.goto(pathToFileURL(paths.report).href); await expect(report.getByRole("img")).toHaveCount(5);
  const ids = await report.locator("[id]").evaluateAll(elements => elements.map(e => e.id)); expect(new Set(ids).size).toBe(ids.length); expect(requests).toEqual([]);
  await report.screenshot({ path: info.outputPath("frame-report.png") });
  await panel.getByRole("button", { name: "Cancel preview", exact: true }).click(); await panel.getByRole("button", { name: "Close parameters", exact: true }).click();
  await expect(page.getByTestId("graph2d-parameters-open")).toBeFocused(); await page.reload();
  await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-reopen").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByTestId("graph2d-parameters-open").click();
  await expect(value(page)).toHaveValue("1.5"); await expect(panel).toContainText("ratio");
  await page.setViewportSize({ width: 360, height: 640 }); expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  const box = (await panel.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(360);
  await value(page).fill("2"); await panel.getByRole("button", { name: "Apply preview value", exact: true }).click(); await expect(value(page)).toHaveValue("2");
  await page.screenshot({ path: info.outputPath("parameters-narrow.png") });
});

test("G2D38 pan/zoom keeps last same-source geometry visible while a sampling worker is held", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker, state = { hold: false, active: 0 };
    (window as unknown as { graphMotionWorkers: typeof state }).graphMotionWorkers = state;
    window.Worker = class extends Native {
      tracked = false; stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.tracked = String(url).includes("graph2dSamplingWorker"); if (this.tracked) state.active++; }
      postMessage(message: unknown) { if (this.tracked && state.hold) return; super.postMessage(message); }
      terminate() { if (this.tracked && !this.stopped) { this.stopped = true; state.active--; } super.terminate(); }
    };
  });
  await open(page); await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible();
  await page.evaluate(() => { (window as unknown as { graphMotionWorkers: { hold: boolean } }).graphMotionWorkers.hold = true; });
  const viewer = page.getByTestId("main-viewer"), box = (await viewer.boundingBox())!, curve = page.locator('[data-graph2d-path="function_2"]');
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .6); await page.mouse.down();
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + box.width * .25 + i * 5, box.y + box.height * .6 + i * 2); await expect(curve).toHaveAttribute("d", /[ML]/); }
  await page.mouse.up(); await expect(page.getByTestId("graph2d-update-status")).toContainText("previous preview/same-source samples remain visible");
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -30); await expect(curve).toHaveAttribute("d", /[ML]/); }
  await page.evaluate(() => { (window as unknown as { graphMotionWorkers: { hold: boolean } }).graphMotionWorkers.hold = false; });
  await page.mouse.wheel(0, 10); await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible(); await expect(curve).toHaveAttribute("d", /[ML]/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { graphMotionWorkers: { active: number } }).graphMotionWorkers.active)).toBe(0);
});

test("G2D38 cancels frame workers on close/view replacement and recovers from export failure", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker, state = { hold: false, fail: false, active: 0 };
    (window as unknown as { animationWorkers: typeof state }).animationWorkers = state;
    window.Worker = class extends Native {
      tracked = false; stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.tracked = String(url).includes("graph2dAnimationWorker"); if (this.tracked) state.active++; }
      postMessage(message: unknown) { if (this.tracked && state.hold) return; if (this.tracked && state.fail) { this.dispatchEvent(new ErrorEvent("error", { message: "Injected animation export failure" })); return; } super.postMessage(message); }
      terminate() { if (this.tracked && !this.stopped) { this.stopped = true; state.active--; } super.terminate(); }
    };
  });
  await open(page); await configure(page); const panel = page.getByTestId("graph2d-parameters");
  const active = () => page.evaluate(() => (window as unknown as { animationWorkers: { active: number } }).animationWorkers.active);
  const set = (value: { hold?: boolean; fail?: boolean }) => page.evaluate(v => Object.assign((window as unknown as { animationWorkers: object }).animationWorkers, v), value);
  await set({ hold: true }); await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect.poll(active).toBe(1);
  await panel.getByRole("button", { name: "Close parameters", exact: true }).click(); await expect.poll(active).toBe(0);
  await page.getByTestId("graph2d-parameters-open").click(); await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect.poll(active).toBe(1);
  await page.getByRole("button", { name: "Reset", exact: true }).click(); await expect.poll(active).toBe(0);
  await set({ hold: false, fail: true }); await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect(panel).toContainText("Injected animation export failure"); await expect.poll(active).toBe(0);
  await set({ fail: false }); await panel.getByLabel("Animation frames", { exact: true }).fill("2");
  await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect(panel.getByRole("button", { name: "Download frame report", exact: true })).toBeEnabled(); await expect.poll(active).toBe(0);
});
