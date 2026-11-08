import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-03 links one exact Field row to Graphs and returns without a cursor loop", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    let field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await field.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await field.getByRole("button", { name: "XY slice" }).click();
    await field.getByRole("button", { name: "Preview slice" }).click();
    await field.getByRole("region", { name: "Line profile through probe" })
      .getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await field.getByTestId("vector-field-publish-cursor").click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const graphInspector = page.locator(".graph2d-compact-panels > details").last();
    await graphInspector.locator(":scope > summary").click();
    await expect(graphInspector.getByTestId("graph2d-linked-field-cursor"))
      .toContainText("Linked Field row row_65");
    await expect(page.getByTestId("graph2d-plot").locator(".graph2d-probe-linked")).toHaveCount(1);
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    const returnButton = graphInspector.getByTestId("graph2d-return-field-cursor");
    await expect(returnButton).toBeEnabled();
    await returnButton.click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    const adopt = field.getByTestId("vector-field-adopt-cursor");
    await expect(adopt).toBeVisible();
    await adopt.click();
    await expect(adopt).toBeVisible();
    await expect(field.getByRole("button", { name: "Edit probe coordinates" })).toBeVisible();

    await field.getByLabel("Density x").fill("6");
    await field.getByTestId("vector-field-publish-cursor").click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await expect(graphInspector.getByTestId("graph2d-linked-field-cursor"))
      .toContainText("Field source, revision, or physical frame differs");
    await expect(page.getByTestId("graph2d-plot").locator(".graph2d-probe-linked")).toHaveCount(0);
    await returnButton.click();
    await expect(graphInspector.getByTestId("graph2d-return-field-cursor-error"))
      .toContainText("Analytic Field source has changed");
    await expect(page.getByRole("region", { name: "Scientific Field Explorer" })).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
