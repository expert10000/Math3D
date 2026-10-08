import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("saved Surface opens the real module and dock switching does not recapture the Project", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const editor = page.getByTestId("project-source-editor"), panel = page.getByTestId("project-explorer-panel"), inspector = page.getByTestId("document-module-inspector");
    await expect(inspector).toBeVisible(); await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "module");
    const id = (await editor.getAttribute("data-document-id"))!, hash = (await editor.getAttribute("data-source-hash"))!;
    await expect(page.getByTestId("surface-analysis-contract-identity")).toContainText(id);
    await expect(page.getByTestId("surface-analysis-contract")).toContainText("catenary revolution");
    await expect(page.getByTestId("surface-viewer-canvas-host")).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("surface-module-default.png") });
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await page.evaluate(() => {
      const reads: string[] = []; (window as any).projectSwitchReads = reads;
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key: string) { if (key === "math3d.project.v1" || key.includes("project.library")) reads.push(key); return get.call(this, key); };
    });
    const timings: number[] = [];
    const cpu = await page.context().newCDPSession(page); await cpu.send("Profiler.enable"); await cpu.send("Profiler.start");
    for (let cycle = 0; cycle < 5; cycle++) {
      let started = Date.now();
      await editor.getByRole("tablist", { name: "Document details" }).getByRole("tab", { name: "Project", exact: true }).click();
      await expect(panel).toHaveAttribute("data-project-placement", "right"); timings.push(Date.now() - started);
      started = Date.now(); await editor.getByRole("tablist", { name: "Document details" }).getByRole("tab", { name: "Inspector", exact: true }).click();
      await expect(panel).toHaveCount(0); await expect(inspector).toBeVisible(); timings.push(Date.now() - started);
      started = Date.now(); await editor.getByRole("tablist", { name: "Document controls" }).getByRole("tab", { name: "Project", exact: true }).click();
      await expect(panel).toHaveAttribute("data-project-placement", "left"); timings.push(Date.now() - started);
    }
    const profile = await cpu.send("Profiler.stop"); await cpu.detach();
    writeFileSync(test.info().outputPath("project-inspector-switch-cpu.json"), JSON.stringify(profile.profile));
    writeFileSync(test.info().outputPath("project-inspector-switch-times.json"), JSON.stringify(timings));
    expect(await page.evaluate(() => (window as any).projectSwitchReads)).toEqual([]);
    expect(Math.max(...timings)).toBeLessThan(1500);
    await editor.getByRole("tab", { name: "Tools", exact: true }).click();
    await page.getByTestId("surface-computation-curvature-field").click(); await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toHaveText(/Execution: (ready|cached)/);
    await expect(page.getByTestId("surface-curvature-statistics")).toContainText("RMS");
    await expect(page.getByTestId("surface-analysis-contract-identity")).toContainText(id);
    await page.getByTestId("surface-computation-surface-probe").click(); await page.getByTestId("surface-probe-current-sample").click();
    await expect(page.getByTestId("surface-local-probe-result")).toContainText("Euler:");
    const readK = async () => {
      const row = await page.getByTestId("surface-local-probe-result").locator("div").filter({ hasText: /^K \/ H:/ }).innerText();
      return Number(row.replace("K / H:", "").split("/")[0].trim());
    };
    const curvatureError = async (radius: number) => {
      const row = await page.getByTestId("surface-local-probe-result").locator("div").filter({ hasText: /^Position:/ }).innerText();
      const x = Number(row.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i)![0]);
      return Math.abs(await readK() + 1 / (radius ** 2 * Math.cosh(x / radius) ** 4));
    };
    await expect.poll(() => curvatureError(1)).toBeLessThan(0.0001);
    await expect(editor).toHaveAttribute("data-source-hash", hash);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
    await editor.getByRole("tab", { name: "Source/Object", exact: true }).click();
    await editor.getByTestId("project-surface-field-y").fill("2*(exp(x/2)+exp(-x/2))/2"); await editor.getByTestId("project-surface-apply").click();
    await expect(editor).not.toHaveAttribute("data-source-hash", hash); await expect(page.getByTestId("surface-local-probe-result")).toHaveCount(0);
    await editor.getByRole("tab", { name: "Tools", exact: true }).click();
    await page.getByTestId("surface-computation-curvature-field").click(); await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toHaveText(/Execution: (ready|cached)/);
    await page.getByTestId("surface-computation-surface-probe").click(); await page.getByTestId("surface-probe-current-sample").click();
    await expect.poll(() => curvatureError(2)).toBeLessThan(0.0001);
    await page.getByTestId("project-source-undo").click(); await expect(editor).toHaveAttribute("data-source-hash", hash);
    await page.getByTestId("document-custom-view").click(); await expect(page.getByTestId("document-surface-inspector")).toBeVisible();
    await expect(page.getByTestId("surface-viewer-canvas-host")).toHaveCount(1);
    await page.getByTestId("document-custom-view").click(); await expect(inspector).toBeVisible(); await expect(editor).toHaveAttribute("data-source-hash", hash);
    await editor.getByRole("tablist", { name: "Document controls" }).getByRole("tab", { name: "Project", exact: true }).click();
    await panel.getByRole("button", { name: "Close project explorer", exact: true }).click(); await expect(panel).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});
