import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("profile first Catenoid Project opening", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("projects-toggle").click();
    const elapsedMs = await ctx.page.evaluate(() => new Promise<number>((resolve, reject) => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="project-template-open-catenoid-evidence"]');
      if (!button) { reject(new Error("Catenoid starter is missing")); return; }
      const started = performance.now();
      const timeout = window.setTimeout(() => reject(new Error("Catenoid viewport did not open")), 60_000);
      const check = () => {
        const editor = document.querySelector<HTMLElement>('[data-testid="project-source-editor"][data-document-module="surface"]');
        if (editor?.querySelector("canvas")) { window.clearTimeout(timeout); resolve(performance.now() - started); }
        else requestAnimationFrame(check);
      };
      button.click(); requestAnimationFrame(check);
    }));
    await expect(ctx.page.getByTestId("project-source-editor")).toHaveAttribute("data-document-module", "surface");
    const phases = await ctx.page.evaluate(() => Object.fromEntries(performance.getEntriesByType("measure")
      .filter(entry => entry.name.startsWith("project-open:"))
      .map(entry => [entry.name.slice("project-open:".length), Math.round(entry.duration)])));
    console.log(`CATENOID_OPEN_PROFILE ${JSON.stringify({ elapsedMs: Math.round(elapsedMs), phases })}`);
    await test.info().attach("catenoid-open-profile", { body: JSON.stringify({ elapsedMs, phases }, null, 2), contentType: "application/json" });
  } finally { await closeSurfaceApp(ctx); }
});
