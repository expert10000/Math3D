import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-03 returns a saved Graph probe to its promoted Curve without changing local selection", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-derivative-study").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: /Select parabola/i }).click();
    const compactInspector = page.locator(".graph2d-compact-panels > details").last();
    await compactInspector.locator(":scope > summary").click();
    const inspector = compactInspector;
    const returnButton = inspector.getByTestId("graph2d-return-curve-cursor");
    await expect(returnButton).toBeEnabled();
    const localProbe = inspector.getByLabel("Selected graph result").locator(":scope > span").first();
    const before = await localProbe.textContent();
    await returnButton.click();
    await expect(inspector.getByTestId("graph2d-linked-curve-cursor")).toContainText("Linked Curve parameter");
    await expect(page.getByTestId("graph2d-plot").locator(".graph2d-probe-linked")).toHaveCount(1);
    expect(await localProbe.textContent()).toBe(before);
    const ids = await page.evaluate(() => {
      const entries = JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries;
      return { graph: entries.find((entry: { module: string }) => entry.module === "graph2d").expected.id as string,
        curve: entries.find((entry: { module: string }) => entry.module === "curve").expected.id as string };
    });
    await page.getByTestId("projects-toggle").click();
    await projects.getByRole("button", { name: "View current project" }).click();
    await projects.getByTestId(`project-dashboard-document-${ids.curve}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", ids.curve);
    await projects.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByTestId("project-curve-linked-cursor")).toContainText("Linked Curve parameter t=");
    const parameter = page.getByTestId("project-curve-parameter");
    await expect(parameter).not.toHaveValue("");
    await parameter.fill("1");
    await page.getByTestId("project-curve-share-parameter").click();
    await expect(page.getByTestId("project-curve-linked-cursor")).toContainText("Linked Curve parameter t=1");
    await page.getByTestId("projects-toggle").click();
    await projects.getByRole("button", { name: "View current project" }).click();
    await projects.getByTestId(`project-dashboard-document-${ids.graph}`).click();
    await projects.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByTestId("graph2d-linked-curve-cursor").first()).toContainText("(1.0000, 1.0000)");
    await expect(page.getByTestId("graph2d-plot").locator(".graph2d-probe-linked")).toHaveCount(1);
  } finally { await closeSurfaceApp(app); }
});
