import { expect, test } from "@playwright/test";

test("local Chrome Sage panel factors and finds roots with rejection and cancellation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

  const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Operation").selectOption("sage.polynomial.factor");
  const coefficients = panel.getByLabel("Integer coefficients (constant first)");
  await coefficients.fill("1, wrong, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Enter 2–13 integer coefficients");

  await coefficients.fill("-1, 0, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
  await expect(panel).toContainText("(x - 1) * (x + 1)");

  await panel.getByLabel("Operation").selectOption("sage.polynomial.roots_exact");
  await coefficients.fill("-2, 0, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Algebraic roots (2 counting multiplicity)", { timeout: 60_000 });
  await expect(panel).toContainText("Minimal polynomial (constant first): -2, 0, 1");

  await coefficients.fill("1, 0, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toContainText("Sage root calculation cancelled.", { timeout: 30_000 });
  await expect(panel.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
});
