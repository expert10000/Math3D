import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Graph creation stays outside the left list and editing opens from Inspector", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const list = page.getByLabel("Graph functions", { exact: true });
    await expect(list.getByRole("button", { name: "Add Graph" })).toBeVisible();
    await expect(list.locator(".graph2d-function-editor")).toHaveCount(0);

    await list.getByRole("button", { name: "Add Graph" }).click();
    const types = page.getByRole("dialog", { name: "Choose graph type" });
    await types.getByRole("button", { name: "Function", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Create graph" });
    const form = editor.getByRole("form", { name: "New function" });
    await form.getByLabel("Start from preset").selectOption("parabola");
    await form.getByLabel("Function expression").fill("x^2 + 1");
    await form.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(editor.getByLabel("Graph preview", { exact: true })).toContainText("y = x^2 + 1");
    await expect(editor.getByLabel("Plotted graph preview").locator('[data-graph2d-path]'))
      .toHaveAttribute("d", /[ML]/);
    await editor.getByRole("button", { name: "Create graph" }).click();
    await expect(editor).toBeHidden();
    await expect(list.getByRole("button", { name: "Select Parabola" })).toBeVisible();
    await expect(list.locator(".graph2d-function-editor")).toHaveCount(0);
    await expect(list.getByRole("button", { name: /^Edit / })).toHaveCount(0);

    await list.getByRole("button", { name: "Select Parabola" }).click();
    const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    await inspector.locator(":scope > summary").click();
    await inspector.getByRole("button", { name: "Edit graph" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Parabola" });
    await editDialog.getByLabel("Function expression").fill("x^2 + 2");
    await editDialog.getByRole("button", { name: "Preview", exact: true }).click();
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(list.getByText("y = x^2 + 2")).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Polar Preview draws the unsaved curve in the dialog", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Add Graph" }).click();
    await page.getByRole("dialog", { name: "Choose graph type" }).getByRole("button", { name: "Polar" }).click();
    const editor = page.getByRole("dialog", { name: "Create graph" });
    await editor.getByLabel("Polar radius expression").fill("2*cos(theta)");
    await editor.getByRole("button", { name: "Preview", exact: true }).click();
    const plot = editor.getByLabel("Plotted graph preview");
    await expect(plot.locator('[data-graph2d-path]')).toHaveAttribute("d", /[ML]/);
    await expect(plot.locator(".graph2d-plot-background")).toHaveCSS("fill", "rgb(248, 251, 255)");
    const diagnostics = editor.getByLabel("Preview diagnostics", { exact: true });
    await expect(diagnostics).toContainText("Expression");
    await expect(diagnostics).toContainText("Sampling");
    await expect(diagnostics).toContainText("Viewport");
    await expect(diagnostics).toContainText("Performance");
    await expect(editor.getByRole("button", { name: "Create graph" })).toBeVisible();
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true }).getByText("2*cos(theta)")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
  }
});
