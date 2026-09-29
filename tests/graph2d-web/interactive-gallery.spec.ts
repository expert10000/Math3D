import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
const { getGraph2DPresetCatalog, getGraph2DInteractivePreset, getGraph2DInteractivePresetGuidance } = require(resolve("packages/core/src/index.ts"));

const start = async (page: Page) => {
  await page.route("**/api/worker/**", r => r.fulfill({ status: 503, body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
};
const checkpoint = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!).entries.find((e: { module: string }) => e.module === "graph2d").checkpoint);
const save = async (page: Page) => { await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-save").click();
  await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved"); await page.getByTestId("kernel-workspace-toggle").click(); };

test("GGL10 interactive gallery previews no source; sliders reset/apply once, recommended playback is opt-in and portable", async ({ page }, info) => {
  await start(page); await page.getByTestId("graph-gallery-open").click(); const gallery = page.getByTestId("graph-gallery");
  await gallery.getByLabel("Search graphs").fill("Two slopes"); await gallery.getByRole("button", { name: "Preview Two slopes", exact: true }).click();
  await expect(gallery.getByLabel("Two slopes interactive controls")).toContainText("graph2d.parameters.v1");
  expect(await page.evaluate(() => localStorage.getItem("math3d.graph2d.gallery-origin"))).toBeNull();
  await page.setViewportSize({ width: 390, height: 740 }); await expect.poll(() => gallery.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await gallery.getByRole("button", { name: "Open interactive Two slopes", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("interactive-gallery-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 850 });
  await gallery.getByRole("button", { name: "Open interactive Two slopes", exact: true }).click();
  const source = await checkpoint(page); expect(source.requiredCapabilities).toContain("graph2d.parameters.v1");
  await page.getByTestId("graph2d-parameters-open").click(); const panel = page.getByTestId("graph2d-parameters"), value = panel.getByLabel("a preview value", { exact: true });
  await expect(panel.getByLabel("Interactive recipe guidance")).toContainText("Matches Two slopes (interactive)");
  await expect(panel).toContainText("No active frame"); await expect(panel.getByLabel("Animation frames", { exact: true })).toHaveValue("15");
  const bytes = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
  await value.fill("-1"); expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(bytes);
  await panel.getByRole("button", { name: "Preview default a", exact: true }).click(); await expect(value).toHaveValue("2");
  await panel.getByRole("button", { name: "Cancel preview", exact: true }).click();
  await panel.getByLabel("a slider", { exact: true }).focus(); await page.keyboard.press("ArrowLeft"); await expect(value).toHaveValue("1.9");
  await panel.getByRole("button", { name: "Apply preview value", exact: true }).click(); await save(page);
  expect((await checkpoint(page)).source.variables[0].value).toBe(1.9);
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await expect(value).toHaveValue("2");
  await page.keyboard.press("Control+y"); await expect(value).toHaveValue("1.9");
  await panel.getByLabel("Animation frames", { exact: true }).fill("3"); await panel.getByRole("button", { name: "Reset recommended animation", exact: true }).click();
  await expect(panel.getByLabel("Animation frames", { exact: true })).toHaveValue("15"); await expect(panel).toContainText("No active frame");
  await panel.getByRole("button", { name: "Play animation", exact: true }).click(); await expect(panel).toContainText("Frame 15 / 15");
  await expect(value).toHaveValue("3"); expect((await checkpoint(page)).source.variables[0].value).toBe(1.9);
  await panel.getByRole("button", { name: "Reset recommended animation", exact: true }).click(); await expect(value).toHaveValue("1.9");
  await panel.getByRole("button", { name: "Play animation", exact: true }).click(); await expect(panel).toContainText("Frame 1 / 15");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(panel.getByRole("button", { name: "Play animation", exact: true })).toBeEnabled(); await expect(value).toHaveValue("1.9"); await expect(panel).toContainText("No active frame");
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; });
  await panel.evaluate(el => { el.scrollTop = 0; }); await page.screenshot({ path: info.outputPath("interactive-parameters.png") });
  await panel.getByRole("button", { name: "Close parameters", exact: true }).click();
  await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-reopen").click(); await page.getByTestId("kernel-workspace-toggle").click();
  await page.getByTestId("graph2d-parameters-open").click(); await expect(value).toHaveValue("1.9");
});

test("Gallery Open returns to current/preserved edited copies; fresh copies stay explicit", async ({ page }) => {
  await start(page); const gallery = page.getByTestId("graph-gallery");
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill("Two slopes");
  await gallery.getByRole("button", { name: "Open Two slopes", exact: true }).click();
  const id = (await checkpoint(page)).identity.id, functions = page.getByLabel("Graph functions");
  await functions.getByRole("button", { name: "Edit Unit slope", exact: true }).click();
  await functions.getByLabel("Function expression").fill("3*x"); await functions.getByRole("button", { name: "Save function", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill("Two slopes");
    await gallery.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await functions.getByRole("button", { name: "Edit Unit slope", exact: true }).click(); await expect(functions.getByLabel("Function expression")).toHaveValue("3*x");
    await functions.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByRole("button", { name: "Open Lissajous loops", exact: true }).click();
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill("Two slopes");
  await gallery.getByRole("button", { name: "Open Two slopes", exact: true }).click();
  expect((await checkpoint(page)).identity.id).toBe(id); expect((await checkpoint(page)).source.objects[0].expression.source).toBe("3*x");
  await page.reload(); await page.getByTestId("workspace-nav-graphs").click();
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill("Two slopes");
  await gallery.getByRole("button", { name: "Open Two slopes", exact: true }).click();
  expect((await checkpoint(page)).identity.id).toBe(id); expect((await checkpoint(page)).source.objects[0].expression.source).toBe("3*x");
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill("Two slopes");
  await gallery.getByRole("button", { name: "Preview Two slopes", exact: true }).click();
  await gallery.getByRole("button", { name: "Open fresh copy of Two slopes", exact: true }).click();
  expect((await checkpoint(page)).identity.id).not.toBe(id); expect((await checkpoint(page)).source.objects[0].expression.source).toBe("x");
});

test("wheel zoom keeps its plot focal point fixed and suppresses native scrolling/browser zoom", async ({ page }) => {
  await start(page); const gallery = page.getByTestId("graph-gallery");
  await page.getByTestId("graph-gallery-open").click(); await gallery.getByRole("button", { name: "Open Lissajous loops", exact: true }).click();
  await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible();
  const plot = page.getByTestId("graph2d-plot");
  // Force a scrollable, bordered host to expose the passive-wheel failure.
  await page.getByTestId("main-viewer").evaluate(el => { (el as HTMLElement).style.borderWidth = "12px";
    const spacer = document.createElement("div"); spacer.style.cssText = "position:absolute;top:120%;height:100px;width:1px"; el.appendChild(spacer); });
  const box = (await plot.boundingBox())!, x = box.x + box.width * .3, y = box.y + box.height * .7;
  const world = (viewport: { xMin: number; xMax: number; yMin: number; yMax: number; aspect: string }, width: number, height: number) => {
    const unit = Math.max((viewport.xMax - viewport.xMin) / width, (viewport.yMax - viewport.yMin) / height);
    const sx = viewport.aspect === "equal" ? unit * width : viewport.xMax - viewport.xMin, sy = viewport.aspect === "equal" ? unit * height : viewport.yMax - viewport.yMin;
    return { x: (viewport.xMin + viewport.xMax) / 2 - sx * .2, y: (viewport.yMin + viewport.yMax) / 2 - sy * .2 };
  };
  const original = world((await checkpoint(page)).display.viewport, box.width, box.height);
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, top: document.querySelector('[data-testid="main-viewer"]')!.scrollTop, scale: visualViewport!.scale }));
  await page.mouse.move(x, y);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -75); await expect(plot).toBeVisible(); }
  await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible(); await save(page);
  const afterBox = (await plot.boundingBox())!, after = world((await checkpoint(page)).display.viewport, afterBox.width, afterBox.height);
  expect(after.x).toBeCloseTo(original.x, 7); expect(after.y).toBeCloseTo(original.y, 7);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, top: document.querySelector('[data-testid="main-viewer"]')!.scrollTop, scale: visualViewport!.scale }))).toEqual(scroll);
  expect(await page.getByTestId("main-viewer").evaluate(el => {
    const rect = el.querySelector("svg")!.getBoundingClientRect();
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, clientX: rect.x + rect.width * .3, clientY: rect.y + rect.height * .7, deltaY: -1 });
    el.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
});

test("GGL10 all ten curated copies render in actual workers with ready-to-use native-neutral controls", async ({ page }, info) => {
  await page.addInitScript(() => {
    const Native = window.Worker, state = { count: 0, active: 0 };
    (window as unknown as { interactiveWorkers: typeof state }).interactiveWorkers = state;
    window.Worker = class extends Native {
      tracked = false; stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.tracked = String(url).includes("graph2dSamplingWorker"); if (this.tracked) { state.count++; state.active++; } }
      terminate() { if (this.tracked && !this.stopped) { this.stopped = true; state.active--; } super.terminate(); }
    };
  });
  await start(page);
  const workers = () => page.evaluate(() => (window as unknown as { interactiveWorkers: { count: number; active: number } }).interactiveWorkers);
  await expect.poll(async () => (await workers()).active).toBe(0); const initial = (await workers()).count;
  await page.getByTestId("graph-gallery-open").click(); const gallery = page.getByTestId("graph-gallery");
  await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
  await expect(gallery.getByText("interactive copy in Preview", { exact: false })).toHaveCount(10);
  expect((await workers()).count).toBe(initial); await gallery.getByRole("button", { name: "Close Graph Gallery", exact: true }).click();
  for (const original of getGraph2DPresetCatalog().entries) {
    const variant = getGraph2DInteractivePreset(original); if (!variant) continue;
    await page.getByTestId("graph-gallery-open").click(); await gallery.getByLabel("Search graphs").fill(original.title);
    await gallery.getByRole("button", { name: `Preview ${original.title}`, exact: true }).click();
    const count = (await workers()).count; await expect(gallery).toContainText("nothing plays automatically"); expect((await workers()).count).toBe(count);
    await gallery.getByRole("button", { name: `Open interactive ${original.title}`, exact: true }).click();
    const saved = await checkpoint(page); expect(saved.source).toEqual(variant.template.source);
    await expect.poll(async () => (await workers()).active).toBe(0);
    for (const object of saved.source.objects) await expect(page.locator(`[data-graph2d-path="${object.id}"]`).first()).toHaveAttribute("d", /[ML]/);
    await page.getByTestId("graph2d-parameters-open").click(); const panel = page.getByTestId("graph2d-parameters"), guidance = getGraph2DInteractivePresetGuidance(saved);
    await expect(panel).toContainText("No active frame");
    for (const parameter of saved.source.variables) {
      const slider = panel.getByLabel(`${parameter.name} slider`, { exact: true });
      await expect(slider).toHaveAttribute("min", String(parameter.control.min)); await expect(slider).toHaveAttribute("max", String(parameter.control.max));
    }
    const parameter = saved.source.variables.find((p: { name: string }) => p.name === guidance.animation.parameter);
    const index = ["line-comparison", "circle-ellipse", "translated-quadratic"].includes(original.id) ? 1 : 0;
    const curve = page.locator(`[data-graph2d-path="${saved.source.objects[index].id}"]`).first(), baseline = await curve.getAttribute("d");
    await panel.getByLabel(`${parameter.name} preview value`, { exact: true }).fill(String(parameter.control.max));
    await expect.poll(() => curve.getAttribute("d")).not.toBe(baseline); await expect.poll(async () => (await workers()).active).toBe(0);
    await expect(curve).toHaveAttribute("d", /[ML]/); expect(await curve.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    expect((await checkpoint(page)).source).toEqual(saved.source);
    await panel.getByRole("button", { name: "Preview default " + parameter.name, exact: true }).click();
    await expect.poll(async () => (await workers()).active).toBe(0); await expect(curve).toHaveAttribute("d", baseline!);
    await panel.getByRole("button", { name: "Cancel preview", exact: true }).click(); await panel.getByRole("button", { name: "Close parameters", exact: true }).click();
    await page.getByTestId("main-viewer").screenshot({ path: info.outputPath(`${original.id}.png`) });
  }
});
