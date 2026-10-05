import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("NTS05 Geometry Project Note display modes persist", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
    const control = page.getByTestId("geometry-note-pins-mode");
    await expect(control).toBeVisible();
    for (const mode of ["off", "pins", "labels", "all"] as const) {
      await control.selectOption(mode);
      await expect(control).toHaveValue(mode);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.ui.geometryNotePins.v1"))).toBe(mode);
    }
    await page.reload();
    await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
    await expect(page.getByTestId("geometry-note-pins-mode")).toHaveValue("all");
  } finally { await closeSurfaceApp(ctx); }
});

test("Projects starter opens two current Geometry Note pins and their Notes", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, projects = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 2048, height: 1100 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-template-select").selectOption("geometry-note-pins");
    await projects.getByTestId("project-template-preview").click();
    await expect(projects.getByTestId("project-import-preview")).toContainText("Geometry Notes and Pins");
    await expect(projects.getByTestId("project-import-open")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("project-starter-preview.png") });
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByTestId("geometry-note-pins-mode")).toBeVisible();
    await expect(page.getByTitle("Current Geometry object-local Project Notes")).toHaveText("2");
    await page.getByTestId("notes-toggle").click();
    await expect(page.getByTestId("project-notes-panel")).toContainText("Box top");
    await expect(page.getByTestId("project-notes-panel")).toContainText("Sphere north pole");
    await page.getByTestId("project-notes-panel").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Fast", exact: true }).first().click();
    const mode = page.getByTestId("geometry-note-pins-mode"), viewport = page.getByTestId("surface-viewer-canvas-host").first();
    await mode.selectOption("off");
    await page.waitForTimeout(300);
    const withoutPins = await viewport.screenshot();
    await mode.selectOption("all");
    await page.waitForTimeout(300);
    const withPins = await viewport.screenshot({ path: test.info().outputPath("geometry-note-pins-fast.png") });
    const changedPixels = await page.evaluate(async ([before, after]) => {
      const pixels = async (base64: string) => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const left = await pixels(before), right = await pixels(after);
      let changed = 0;
      for (let index = 0; index < left.length; index += 4) {
        if (Math.abs(left[index]! - right[index]!) + Math.abs(left[index + 1]! - right[index + 1]!) + Math.abs(left[index + 2]! - right[index + 2]!) > 90) changed++;
      }
      return changed;
    }, [withoutPins.toString("base64"), withPins.toString("base64")] as const);
    expect(changedPixels).toBeGreaterThan(100);
  } finally { await closeSurfaceApp(ctx); }
});

test("Opening a starter card creates a saved Project and opens its Geometry", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, projects = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await expect(projects.getByTestId("project-template-card-geometry-note-pins")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("project-starter-gallery.png") });
    await projects.getByTestId("project-template-open-geometry-note-pins").click();
    await expect(projects.getByTestId("project-view-mode")).toContainText("Geometry Notes and Pins");
    await expect(projects.getByTestId("project-view-mode")).toContainText("Saved in Your saved projects");
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(current.metadata.title).toBe("Geometry Notes and Pins");
    await expect(projects.getByTestId(`project-library-${current.identity.id}`)).toBeVisible();
    await expect(page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: test.info().outputPath("project-starter-opened.png") });
  } finally { await closeSurfaceApp(ctx); }
});
