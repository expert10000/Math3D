import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Study source panes return to their owners after restart and Project transfer", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await projects.getByTestId("curated-study-open-catenary-study").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const study = initial.workspace.studies[0];
    await projects.getByTestId("project-save").click();
    const profile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    let studies = projects.getByTestId("project-studies-panel");
    await studies.getByTestId(`project-study-open-${study.id}`).click();
    for (const pane of study.layout.panes)
      await expect(studies.getByTestId(`project-study-source-status-${pane.paneId}`)).toContainText("Saved source pin: current");
    const firstPane = study.layout.panes[0];
    const member = study.members.find((item: { memberId: string }) => item.memberId === firstPane.memberId);
    await studies.getByTestId(`project-study-open-source-${firstPane.paneId}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", member.documentId);
    await page.getByTestId("projects-toggle").click();
    if (!await projects.getByTestId("project-export-resources").isVisible()) {
      await projects.getByTestId("project-gallery-layout-toggle").click();
      await projects.locator("details.project-header-more summary").click();
      await projects.locator("details.project-header-more button").filter({ hasText: "Import / export" }).click();
    }
    const exported = test.info().outputPath("study-transfer.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), exported);
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(exported).length; } catch { return 0; } }).toBeGreaterThan(100);
    const raw = readFileSync(exported, "utf8");
    await closeSurfaceApp(app);
    app = await launchSurfaceApp(); page = app.page; await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "study-transfer.json",
      mimeType: "application/json", buffer: Buffer.from(raw) });
    await projects.getByTestId("project-import-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Imported into the library");
    await projects.getByTestId(`project-open-saved-${initial.identity.id}`).click();
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    studies = projects.getByTestId("project-studies-panel");
    await studies.getByTestId(`project-study-open-${study.id}`).click();
    for (const pane of study.layout.panes)
      await expect(studies.getByTestId(`project-study-open-source-${pane.paneId}`)).toBeEnabled();
  } finally { await closeSurfaceApp(app); }
});
