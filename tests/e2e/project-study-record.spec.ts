import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-04 saves and cold-reopens a Study layout of existing Project documents", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-derivative-study").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1"))).not.toBeNull();
    const ids = await page.evaluate(() => {
      const entries = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries;
      return entries.slice(0, 2).map((entry: { expected: { id: string } }) => entry.expected.id) as string[];
    });
    await projects.getByTestId("project-gallery-layout-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.getByLabel("Study title").fill("Graph and Curve question");
    for (const id of ids) await studies.getByTestId(`project-study-choose-${id}`).check();
    await studies.getByTestId("project-study-create-button").click();
    await expect(studies.locator("[data-testid^='project-study-open-']")).toHaveCount(1);
    await studies.locator("[data-testid^='project-study-open-']").click();
    await expect(studies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "split-2");
    await expect(studies.locator("[data-testid^='project-study-pane-']")).toHaveCount(2);
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveCount(0);
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "graph");
    await studies.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "geometry");
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveCount(1);
    await studies.getByTestId("project-study-link-graph-curve").click();
    await studies.getByLabel("Curve parameter (x)").fill("1");
    await studies.getByTestId("project-study-share-parameter").click();
    await expect(studies.getByTestId("project-study-linked-result")).toContainText("Graph (1, 1)");
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.locator(".graph2d-probe-linked")).toHaveCount(1);
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.studies?.length)).toBe(1);
    await page.reload();
    await openLastSavedProject(page);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    const reopened = projects.getByTestId("project-studies-panel");
    await expect(reopened.locator("[data-testid^='project-study-open-']")).toHaveCount(1);
    await reopened.locator("[data-testid^='project-study-open-']").click();
    await expect(reopened.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "split-2");
    await expect(reopened.getByTestId("project-study-graph-curve-control")).toHaveCount(1);
    await expect(reopened.locator("[data-testid^='project-study-pane-']").first()).toContainText("Source current");
    await reopened.getByLabel("Rename Study").fill("Revised question");
    await reopened.getByTestId("project-study-rename").click();
    await expect(reopened.getByTestId("project-study-view")).toContainText("Revised question");
    await reopened.getByTestId("project-study-fork").click();
    await expect(reopened.locator("[data-testid^='project-study-open-']")).toHaveCount(2);
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.studies?.length)).toBe(2);
    await reopened.locator("[data-testid^='project-study-pane-']").first().getByRole("button", { name: "Open source document" }).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", ids[0]);
  } finally { await closeSurfaceApp(app); }
});
