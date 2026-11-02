import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Workbook Sage cell saves code, output and dependency freshness under local trust", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "2 Compute" }).click();
    await page.getByRole("button", { name: "Sage code", exact: true }).click();
    const cell = page.locator('[data-testid^="workbook-sage-code-"]').first();
    await expect(cell).toContainText("Local WSL", { timeout: 30_000 });
    await expect(cell.getByTestId("workbook-sage-code-run")).toBeDisabled();
    await cell.getByTestId("workbook-sage-code-input").fill("2^10");
    const dependencyPanel = page.locator('[data-testid^="workbook-dependencies-"]').last();
    await dependencyPanel.locator("summary").click();
    await dependencyPanel.getByLabel("Dependency source").selectOption({ index: 1 });
    await dependencyPanel.getByRole("button", { name: "Add link" }).click();
    await expect(dependencyPanel).toContainText("current");
    await cell.getByTestId("workbook-sage-code-trust").check();
    await cell.getByTestId("workbook-sage-code-run").click();
    await expect(cell.getByTestId("workbook-sage-code-freshness")).toContainText("current", { timeout: 60_000 });
    await expect(cell.getByTestId("workbook-sage-code-output")).toContainText("1024");
    await expect(cell.getByTestId("workbook-sage-code-output")).toContainText("Dependencies: 1 saved");
    await expect(cell.getByTestId("workbook-sage-code-output")).toContainText(/Source SHA-256: [0-9a-f]{64}/);
    await page.getByTestId("top-sage-console-button").click();
    await expect(page.getByTestId("sage-console-trust")).not.toBeChecked();
    await page.getByRole("button", { name: "Close Sage Console" }).click();
    await expect(cell.getByTestId("workbook-sage-code-trust")).toBeChecked();
    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "2 Compute" }).click();
    const reopened = page.locator('[data-testid^="workbook-sage-code-"]').first();
    await expect(reopened.getByTestId("workbook-sage-code-input")).toHaveValue("2^10");
    await expect(reopened.getByTestId("workbook-sage-code-output")).toContainText("1024");
    await expect(reopened.getByTestId("workbook-sage-code-trust")).not.toBeChecked();
    await reopened.getByTestId("workbook-sage-code-input").fill("2^11");
    await expect(reopened.getByTestId("workbook-sage-code-freshness")).toContainText("stale");
    await expect(reopened.getByTestId("workbook-sage-code-output")).toContainText("1024");
    await reopened.getByTestId("workbook-sage-code-input").fill("2^10");
    await expect(reopened.getByTestId("workbook-sage-code-freshness")).toContainText("current");
    await expect.poll(() => page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem("math3d.workbooks.v1")!);
      const book = books.find((item: any) => item.id === localStorage.getItem("math3d.workbooks.active.v1"));
      return book.stages.flatMap((stage: any) => stage.blocks).find((item: any) => item.type === "sage-code")?.sageCode.code;
    })).toBe("2^10");
    await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem("math3d.workbooks.v1")!);
      const book = books.find((item: any) => item.id === localStorage.getItem("math3d.workbooks.active.v1"));
      const cell = book.stages.flatMap((stage: any) => stage.blocks).find((item: any) => item.type === "sage-code");
      const sourceId = book.dependencies.find((edge: any) => edge.targetBlockId === cell.id).source.blockId;
      const source = book.stages.flatMap((stage: any) => stage.blocks).find((item: any) => item.id === sourceId);
      source.text = `${source.text ?? ""} changed`;
      localStorage.setItem("math3d.workbooks.v1", JSON.stringify(books));
    });
    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "2 Compute" }).click();
    const linked = page.locator('[data-testid^="workbook-sage-code-"]').first();
    await expect(linked.getByTestId("workbook-sage-code-freshness")).toContainText("stale");
    await expect(linked).toContainText("Source unavailable or changed");
    await expect(linked.getByTestId("workbook-sage-code-run")).toBeDisabled();
  } finally {
    await closeSurfaceApp(context);
  }
});
