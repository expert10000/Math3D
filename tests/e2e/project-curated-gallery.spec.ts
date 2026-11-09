import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("guided Study Gallery explains real Project and external-scene routes without changing starter navigation", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await expect(panel.getByTestId("project-template-card-catenary-study")).toBeVisible();
    await panel.getByTestId("project-gallery-guided").click();
    await expect(panel.locator(".curated-study-card")).toHaveCount(14);
    const catenary = panel.getByTestId("curated-study-card-catenary-study");
    await expect(catenary).toContainText("How does a catenary generate a catenoid?");
    await expect(catenary).toContainText("Graph profile, Curve snapshot, revolution Surface");
    await catenary.locator("summary").click();
    await expect(catenary).toContainText("The numerical derivative is not a proof of minimality");
    const qwz = panel.getByTestId("curated-study-card-quantum-qwz");
    await expect(qwz).toContainText("External verified scene");
    await qwz.locator("summary").click();
    await expect(qwz).toContainText("no scene is bundled with this card");
    await expect(qwz.getByTestId("curated-study-import-quantum-qwz")).toBeEnabled();
    await panel.getByTestId("project-library-module").selectOption("Quantum scene");
    await expect(panel.locator(".curated-study-card")).toHaveCount(3);
    await panel.getByTestId("project-library-search").fill("hydrogen");
    await expect(panel.locator(".curated-study-card")).toHaveCount(1);
    await expect(panel.getByTestId("curated-study-card-quantum-hydrogen")).toBeVisible();
    await panel.getByTestId("project-gallery-all-starters").click();
    await panel.getByTestId("project-library-search").fill("");
    await panel.getByTestId("project-library-module").selectOption("All modules");
    await expect(panel.getByTestId("project-template-card-catenary-study")).toBeVisible();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const opened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(opened.metadata.tags).toContain("catenary-study");
    expect(opened.workspace.entries.map((entry: { module: string }) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
  } finally { await closeSurfaceApp(ctx); }
});
