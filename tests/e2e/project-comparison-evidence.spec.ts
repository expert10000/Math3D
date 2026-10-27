import { expect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

async function exportReport(ctx: LaunchedSurfaceApp, name: string, button: Locator) {
  const path = test.info().outputPath(name);
  await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), path);
  await button.click();
  await expect.poll(() => { try { return readFileSync(path).length > 0; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
  return readFileSync(path, "utf8");
}

test("PC08 exports qualified, source-backed overlay views from both coordinate starters and refuses mismatch", async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page; await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-coordinate-overlay-study").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view"), button = view.getByTestId("project-comparison-export-evidence");
    await view.getByLabel("Saved composition").selectOption({ label: "Verified A/B overlay" });
    await expect(button).toBeEnabled();
    const verified = await exportReport(ctx, "verified-comparison.html", button);
    expect(verified).toContain("source-declared match");
    expect(verified).toContain(project.compositions.find((item: any) => item.title === "Verified A/B overlay").members[0].expected.structuralHash);
    expect((verified.match(/<img /g) ?? []).length).toBe(1);
    await view.getByLabel("Saved composition").selectOption({ label: "Unverified A/D overlay" });
    const asserted = await exportReport(ctx, "asserted-comparison.html", button);
    expect(asserted).toContain("operator assertion");
    await view.getByTestId("project-composition-source-1").selectOption(project.workspace.entries[2].expected.id);
    await expect(button).toBeDisabled();
    await view.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-explorer-panel").getByTestId("project-open-composition").click();
    await view.getByLabel("Saved composition").selectOption({ label: "Verified A/B overlay" });
    expect(await exportReport(ctx, "verified-after-restart.html", button)).toContain("source-declared match");
  } finally { await closeSurfaceApp(ctx); }
});

test("PC08 exports both retained/current Surface views from Project and embedded Workbook", async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page; await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-surface-generation-study").click();
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Before / after · linked u,v" });
    const html = await exportReport(ctx, "surface-comparison.html", view.getByTestId("project-comparison-export-evidence"));
    expect(html).toContain("retained checkpoint"); expect(html).toContain("current");
    expect((html.match(/<img /g) ?? []).length).toBe(2);
    await view.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    const back = page.getByTestId("project-source-back-to-module"); if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await page.getByTestId("workbook-comparison-select").first().selectOption(project.compositions[0].id);
    const link = page.getByTestId("workbook-comparison-link").first();
    await link.getByText("Show embedded comparison").click();
    const embedded = await exportReport(ctx, "workbook-comparison.html", link.getByTestId("workbook-comparison-export-evidence"));
    expect(embedded).toContain(project.compositions[0].members[0].expected.structuralHash);
    expect((embedded.match(/<img /g) ?? []).length).toBe(2);
    const publication = page.getByTestId("workbook-publication");
    await publication.locator("summary").click();
    const markdown = await exportReport(ctx, "workbook-comparison.md", publication.getByRole("button", { name: "Export selected Markdown" }));
    expect(markdown).toContain("Saved Project comparison");
    expect(markdown).toContain(project.compositions[0].members[1].expected.structuralHash);
  } finally { await closeSurfaceApp(ctx); }
});
