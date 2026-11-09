import { expect, type Page } from "@playwright/test";

/** Exercise the Geometry Services handler without dev-server pointer stalls; the built UI has a separate pointer test. */
export async function openGeometryServices(page: Page) {
  const geometryNav = page.getByRole("button", { name: "Geometry", exact: true }).first();
  await geometryNav.click();
  await expect(geometryNav).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("geometry-left-panel")).toBeVisible({ timeout: 60_000 });
  const servicesButton = page.getByTestId("geometry-professional-panel-services");
  await servicesButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(servicesButton).toHaveAttribute("aria-pressed", "true");
  const geometry = page.getByTestId("scientific-services-geometry");
  await expect(geometry).toBeVisible();
  return geometry;
}
