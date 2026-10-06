import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project detail keeps Workbooks and Notes together through save, reopen and export", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    let page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-graph-derivative-notebook").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const starter = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const workbookId = starter.workbooks[0].id;
    await expect(projects.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(projects.getByRole("heading", { name: "Graph Derivative Investigation", exact: true, level: 2 })).toBeVisible();
    await expect(projects.getByTestId("project-library")).toBeHidden();
    await expect(projects.getByTestId(`project-workbook-${workbookId}`)).toBeVisible();

    await projects.getByTestId("project-new-note").click();
    const notes = page.getByTestId("project-notes-panel");
    const draft = notes.locator("[data-testid^='note-draft-']").first();
    await draft.getByRole("textbox", { name: "Draft title" }).fill("Study conclusion");
    await draft.getByRole("textbox", { name: "Draft body" }).fill("Compare the saved derivative with the curve before rerunning analysis.");
    await notes.getByTestId("notes-save").click();
    await expect(notes.getByTestId("notes-message")).toContainText("Saved 1 Note");

    const blocks = notes.getByRole("combobox", { name: "Workbook block target" });
    await expect(blocks.locator("option").nth(1)).toBeAttached();
    await blocks.selectOption({ index: 1 });
    await notes.getByRole("button", { name: "Note on block" }).click();
    const blockDraft = notes.locator("[data-testid^='note-draft-']").first();
    await blockDraft.getByRole("textbox", { name: "Draft body" }).fill("Check the cited Graph generation for this Workbook block.");
    await notes.getByTestId("notes-save").click();
    await expect(notes.getByTestId("notes-message")).toContainText("Saved 1 Note");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const linked = saved.notes.find((note: any) => note.anchor?.kind === "workbook-block");
    expect(linked.anchor.workbookId).toBe(workbookId);

    await notes.getByRole("button", { name: "Projects", exact: true }).click();
    await projects.getByTestId("project-detail-toggle").click();
    await expect(projects.getByTestId(`project-workbook-${workbookId}`).getByTestId(`project-open-note-${linked.identity.id}`)).toBeVisible();
    await expect(projects.getByTestId("project-all-notes")).toBeVisible();
    await projects.getByTestId("project-workbooks").scrollIntoViewIfNeeded();
    await projects.screenshot({ path: test.info().outputPath("project-detail-desktop.png") });
    await projects.getByTestId("project-detail-toggle").click();
    await projects.getByTestId(`project-details-${saved.identity.id}`).click();
    await expect(projects.getByTestId("project-view-mode")).toContainText("Saved project preview");
    await expect(projects.getByTestId(`project-workbook-${workbookId}`).getByTestId(`project-open-note-${linked.identity.id}`)).toBeDisabled();
    await projects.getByTestId("project-current").click();
    await expect(projects.getByTestId(`project-workbook-${workbookId}`).getByTestId(`project-open-note-${linked.identity.id}`)).toBeEnabled();
    const exportPath = resolve(ctx.profileDir, "project-detail-journey.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), exportPath);
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(exportPath)).toBe(true);
    const exported = JSON.parse(readFileSync(exportPath, "utf8"));
    expect(exported.project.identity.id).toBe(saved.identity.id);
    expect(exported.project.workbooks).toHaveLength(1);
    expect(exported.project.notes).toHaveLength(saved.notes.length);

    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-detail-toggle").click();
    await expect(projects.getByTestId(`project-workbook-${workbookId}`).getByTestId(`project-open-note-${linked.identity.id}`)).toBeVisible();
    await projects.getByTestId(`project-open-note-${linked.identity.id}`).click();
    await expect(page.getByTestId(`project-note-${linked.identity.id}`)).toContainText("Check the cited Graph generation");
  } finally { await closeSurfaceApp(ctx); }
});
