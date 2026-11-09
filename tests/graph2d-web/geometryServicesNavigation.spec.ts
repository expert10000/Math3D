import { expect, test } from "@playwright/test";

test("Geometry Services opens through the visible pointer control", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
  await expect(page.getByTestId("geometry-left-panel")).toBeVisible();
  const services = page.getByTestId("geometry-professional-panel-services");
  await services.click();
  await expect(services).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("scientific-services-geometry")).toBeVisible();
});
