import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Function Explorer distinguishes default, invalid and branch-profile messages", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Function Explorer", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Complex function expression" });
    const expressionStatus = page.getByTestId("complex-function-status");
    const branchStatus = page.getByTestId("complex-branch-profile-status");
    await expect(input).toHaveValue("z");
    await expect(expressionStatus).toContainText("default identity function f(z) = z");
    await input.fill("");
    await expect(expressionStatus).toContainText("previews default f(z) = z");
    await expect(branchStatus).toContainText("No supported branch profile detected");
    await input.fill("1/(");
    await expect(expressionStatus).toContainText("Expression needs attention");
    await expect(expressionStatus).toHaveAttribute("role", "alert");
    await expect(branchStatus).toContainText("unavailable until the expression is accepted");
    await input.fill("sqrt(z)");
    await expect(expressionStatus).toContainText("Expression accepted for preview");
    await expect(branchStatus).toContainText("Detected branch profile");
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      mkdirSync(process.env.MATH3D_UI_CAPTURE_DIR, { recursive: true });
      await page.getByTestId("complex-function-status").locator("..").screenshot({
        path: join(process.env.MATH3D_UI_CAPTURE_DIR, "complex-function-status-source-build.png"),
      });
    }
  } finally {
    await closeSurfaceApp(app);
  }
});
