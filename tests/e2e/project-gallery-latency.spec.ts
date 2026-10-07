import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("profile Projects Gallery and saved-card opening with 25 projects", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    const panel = page.getByTestId("project-explorer-panel");
    const measureClick = (selector: string, visible: boolean) => page.evaluate(({ selector, visible }) => new Promise<number>((resolve, reject) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) { reject(new Error(`Missing button ${selector}`)); return; }
      const start = performance.now();
      const timeout = window.setTimeout(() => reject(new Error(`Gallery did not become ${visible ? "visible" : "hidden"}`)), 60_000);
      const check = () => {
        const panel = document.querySelector<HTMLElement>("[data-testid='project-explorer-panel']");
        if (Boolean(panel && panel.getBoundingClientRect().width > 0) === visible) {
          window.clearTimeout(timeout); resolve(Math.round(performance.now() - start));
        } else requestAnimationFrame(check);
      };
      button.click(); requestAnimationFrame(check);
    }), { selector, visible });
    const emptyMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    await panel.getByTestId("project-import-samsung-examples").click();
    await expect(panel.getByTestId("project-gallery-grid").locator("article")).toHaveCount(25, { timeout: 60_000 });
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.reload();
    const coldFirstPaintMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    const readyStart = await page.evaluate(() => performance.now());
      await expect(panel.getByTestId("project-gallery-grid")).not.toContainText("Loading project details…", { timeout: 60_000 });
      await expect(panel.getByTestId("project-message")).not.toContainText("Loading current workspace…", { timeout: 60_000 });
    const coldReadyMs = Math.round(await page.evaluate(() => performance.now()) - readyStart);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    const warmFirstPaintMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    const helicoid = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.find((item: { title: string }) => item.title === "Helicoid")?.id as string);
    expect(helicoid).toBeTruthy();
    const savedCardOpenMs = await measureClick(`[data-testid='project-open-saved-${helicoid}']`, false);
    await expect(panel).toBeHidden({ timeout: 60_000 });
    const openPhases = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("measure").filter(entry => entry.name.startsWith("project-open:")).map(entry => [entry.name.replace("project-open:", ""), Math.round(entry.duration)])));
    const metrics = { platform: "desktop Electron", projectCount: 25, emptyFirstPaintMs: emptyMs, coldFirstPaintMs, coldReadyMs, warmFirstPaintMs, savedCardOpenMs, openPhases };
    console.log(`PROJECT_GALLERY_LATENCY ${JSON.stringify(metrics)}`);
    writeFileSync(test.info().outputPath("project-gallery-latency.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  } finally { await closeSurfaceApp(context); }
});
