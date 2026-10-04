import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const core = require(resolve("packages/core/src/index.ts"));
const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));
const projects = collection.projects.map((item: any) => item.project ?? item);

test("PRJ34 desktop imports all Samsung examples offline and keeps existing projects through restart", async () => {
  test.setTimeout(240_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const close = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
    const original = projects.find((project: any) => project.metadata.title === "Helicoid"), edited = core.updateMath3DProjectMetadata(original, { title: "My edited Helicoid", tags: ["personal"] });
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "my-project.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(edited)) });
    await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    await panel.getByRole("button", { name: "Favorite My edited Helicoid", exact: true }).click();
    const before = await page.evaluate(id => ({ active: localStorage.getItem("math3d.project.v1"), payload: localStorage.getItem(`math3d.project.v1.payload.${id}`), entry: JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.find((entry: any) => entry.id === id) }), edited.identity.id);
    // Reject HTTP(S) access: the collection and source resources ship in the app.
    await page.route(/^https?:\/\//, route => route.abort());
    await panel.getByTestId("project-import-samsung-examples").click();
    await expect(panel.getByTestId("project-example-import-message")).toContainText("Imported 24 Samsung projects; kept 1 existing versions", { timeout: 60_000 });
    await expect(panel.getByTestId("project-example-import-message")).toContainText("compatibility preview");
    await expect(panel.locator('[data-testid^="project-library-math3d:project:"]')).toHaveCount(25);
    const current = await page.evaluate(id => ({ active: localStorage.getItem("math3d.project.v1"), payload: localStorage.getItem(`math3d.project.v1.payload.${id}`), entry: JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.find((entry: any) => entry.id === id) }), edited.identity.id);
    expect(current).toEqual(before);
    const allBytes = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))));
    await panel.getByTestId("project-import-samsung-examples").click(); await expect(panel.getByTestId("project-example-import-message")).toContainText("Imported 0 Samsung projects; kept 25 existing versions", { timeout: 60_000 });
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(allBytes);
    await panel.getByTestId(`project-open-saved-${edited.identity.id}`).click(); await expect(panel).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(edited.identity.id);
    await expect(page.locator("canvas:visible").first()).toBeVisible();
    const enneper = projects.find((project: any) => project.metadata.title === "Enneper Study");
    await show(); await panel.getByTestId(`project-open-saved-${enneper.identity.id}`).click(); await expect(panel).toBeHidden();
    await expect(page.getByTestId("project-source-editor").getByTestId("project-surface-field-g")).toBeVisible();
    const points = projects.find((project: any) => project.metadata.title === "Endpoints and missing data");
    await show(); await panel.getByTestId(`project-open-saved-${points.identity.id}`).click(); await expect(panel).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(points.identity.id);
    const mixed = projects.find((project: any) => project.metadata.title === "PRJ30 Graph Curve Surface Study (Samsung)");
    await show(); await panel.getByTestId(`project-open-saved-${mixed.identity.id}`).click(); await expect(panel).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(mixed.identity.id);
    const volumeId = mixed.workspace.entries.find((entry: any) => entry.module === "volume").expected.id;
    await show(); await panel.getByTestId(`project-open-${volumeId}`).click(); await close(); await expect(page.getByTestId("project-volume-editor")).toBeVisible();
    const active = await page.evaluate(() => localStorage.getItem("math3d.project.v1")), preview = projects.find((project: any) => project.metadata.title === "PRJ21 Mixed Preview");
    await show(); await panel.getByTestId(`project-open-saved-${preview.identity.id}`).click(); await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(active);
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await show(); await expect(panel.locator('[data-testid^="project-library-math3d:project:"]')).toHaveCount(25);
    await panel.getByTestId(`project-open-saved-${enneper.identity.id}`).click(); await expect(page.getByTestId("project-source-editor").getByTestId("project-surface-field-g")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});
