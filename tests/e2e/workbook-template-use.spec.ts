import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Use template creates and opens the selected Workbook", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByText("Templates & problem packs", { exact: true }).click();
    const card = page.getByText("Geometry selection and Notes", { exact: true }).locator("..");
    await card.getByRole("button", { name: "Use template" }).click();
    await expect(page.getByTestId("workbook-template-message")).toContainText("Created and opened “Geometry selection and Notes”");
    await expect(page.getByText("Templates & problem packs", { exact: true }).locator("..")).not.toHaveAttribute("open");
    const books = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.workbooks.v1") ?? "[]"));
    expect(books.filter((book: { title: string }) => book.title === "Geometry selection and Notes").length).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("combobox", { name: "Workbook" })).toHaveValue(books[0].id);
    await expect(page.getByRole("combobox", { name: "Workbook" }).locator("option:checked")).toHaveText("Geometry selection and Notes");
    await expect(page.getByRole("combobox", { name: "Workbook" })).toBeInViewport();
  } finally { await closeSurfaceApp(ctx); }
});
