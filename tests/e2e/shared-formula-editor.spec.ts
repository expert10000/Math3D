import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Complex Analysis uses the shared expanded formula editor", async () => {
  const app = await launchSurfaceApp({ MATH3D_E2E: "1" });
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Function Explorer", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Complex function expression" });
    await expect(field).toBeVisible();
    await field.locator("..").locator("..").getByRole("button", { name: "Expand formula" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Complex function expression" });
    const expanded = dialog.getByLabel("Complex function expression expanded");
    await expect(dialog.getByLabel("Preview diagnostics")).toContainText("Complex");
    await expanded.fill("1/(z-z)");
    await expect(dialog.getByLabel("Formula preview")).toContainText("singular or undefined");
    await expanded.fill("z^2+i");
    await expect(dialog.getByRole("button", { name: "Apply formula" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Apply formula" }).click();
    await expect(field).toHaveValue("z^2+i");
  } finally { await closeSurfaceApp(app); }
});

test("saved Surface formulas use scoped validation before Apply", async () => {
  const app = await launchSurfaceApp({ MATH3D_E2E: "1" });
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await page.getByTestId("surfaces-left-tab-object").click();
    await page.getByRole("button", { name: "Edit saved Surface" }).last().click();
    const field = page.getByTestId("project-surface-field-y");
    await expect(field).toBeVisible();
    await field.locator("..").locator("..").getByRole("button", { name: "Expand formula" }).click();
    const dialog = page.getByRole("dialog", { name: /^Edit / });
    const expanded = dialog.locator("textarea");
    await expanded.fill("unknown(x)");
    await expect(dialog.getByRole("button", { name: "Apply formula" })).toBeDisabled();
    await expanded.fill("2*cosh(x)");
    await expect(dialog.getByLabel("Preview diagnostics")).toContainText("Viewport");
    await dialog.getByRole("button", { name: "Apply formula" }).click();
    await expect(field).toHaveValue("2*cosh(x)");
  } finally { await closeSurfaceApp(app); }
});
