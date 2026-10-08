import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

for (const recover of [true, false]) test(`startup only offers autosave recovery (${recover ? "restore" : "decline"}); saved Project stays explicit`, async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    const owner = page.getByTestId("project-source-editor");
    const id = (await owner.getAttribute("data-document-id"))!, hash = (await owner.getAttribute("data-source-hash"))!;
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    // Existing installations may still carry the obsolete opt-in setting.
    await page.evaluate(() => {
      localStorage.setItem("math3d.project-ui.v1", JSON.stringify({ resumeEnabled: true, placement: "right" }));
      const workbooks = JSON.parse(localStorage.getItem("math3d.workbooks.v1")!);
      const recovered = structuredClone(workbooks); recovered[0].title = "Autosave recovery wins";
      localStorage.setItem("math3d.workbook.autosave.v1", JSON.stringify({ savedAt: Date.now(), payload: { workbooks: recovered, activeWorkbookId: recovered[0].id, activeStageId: "define" } }));
      localStorage.removeItem("math3d.workbook.manualSaveAt.v1");
      localStorage.removeItem("math3d.workbook.autosaveRecoveryDismissedAt.v1");
    });
    await page.addInitScript(accept => {
      (window as any).startupPrompts = [];
      window.confirm = message => { (window as any).startupPrompts.push(String(message)); return accept; };
    }, recover);
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).startupPrompts?.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).startupPrompts[0])).toMatch(/^Recover last autosave/);
    await expect(owner).toHaveCount(0);
    await expect(page.getByTestId("projects-quick-toggle")).toHaveCount(0);
    await expect(page.getByTestId("project-resume-progress")).toHaveCount(0);
    await expect(page.getByTestId("project-resume-explicit")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.workbooks.v1")!)[0].title === "Autosave recovery wins")).toBe(recover);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
    await page.screenshot({ path: test.info().outputPath(`startup-autosave-${recover ? "restored" : "declined"}.png`) });
    await openLastSavedProject(page);
    await expect(owner).toHaveAttribute("data-document-id", id);
    await expect(owner).toHaveAttribute("data-source-hash", hash);
    await expect(page.getByTestId("project-explorer-panel")).toHaveAttribute("data-project-placement", "left");
    await expect(page.getByTestId("surface-viewer-controls-strip")).toBeVisible();
    await expect(page.getByTestId("project-resume-enabled")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});
