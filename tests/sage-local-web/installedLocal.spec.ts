import { expect, test } from "@playwright/test";

// Installed-runtime acceptance: requires Windows + WSL Ubuntu + Sage.
// Run explicitly with playwright.sage-web.config.ts; generic browser CI proves Docker separately.
test("local Chrome Sage panel factors and finds roots with rejection and cancellation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

  const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Operation")).toHaveValue("sage.symbolic.simplify");
  await page.getByTestId("top-compute-center-button").click();
  const runtimes = page.getByTestId("compute-center");
  await runtimes.getByRole("button", { name: "Runtimes", exact: true }).click();
  await runtimes.getByTestId("sage-runtime-local").getByRole("button", { name: "Check Local WSL" }).click();
  await expect(runtimes.getByTestId("sage-runtime-local")).toContainText("Local WSL SageMath version", { timeout: 30_000 });
  await runtimes.getByRole("button", { name: "Close", exact: true }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Success: yes", { timeout: 60_000 });
  await expect(panel).toContainText("LaTeX: 1");
  await panel.getByLabel("Expression").fill("x.__class__");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("unsupported syntax", { timeout: 60_000 });
  await panel.getByLabel("Expression").fill("(x+1)^4");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toContainText("Sage symbolic job cancelled.", { timeout: 30_000 });
  await page.getByTestId("top-compute-center-button").click();
  await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("cancelled");
  await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();
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

});

