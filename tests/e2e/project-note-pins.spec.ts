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
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-template-select").selectOption("geometry-note-pins");
    await projects.getByTestId("project-template-preview").click();
    await expect(projects.getByTestId("project-import-preview")).toContainText("Geometry Notes and Pins");
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByTestId("geometry-note-pins-mode")).toBeVisible();
    await expect(page.getByTitle("Current Geometry object-local Project Notes")).toHaveText("2");
    await page.getByTestId("notes-toggle").click();
    await expect(page.getByTestId("project-notes-panel")).toContainText("Box top");
    await expect(page.getByTestId("project-notes-panel")).toContainText("Sphere north pole");
  } finally { await closeSurfaceApp(ctx); }
});
