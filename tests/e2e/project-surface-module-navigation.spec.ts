import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("saved Catenoid does not cover global Surfaces navigation and retains its draft", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, editor = page.getByTestId("project-source-editor");
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(editor).toBeVisible();
    const id = await editor.getAttribute("data-document-id"), hash = await editor.getAttribute("data-source-hash");
    const savedBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await editor.getByTestId("project-source-json").locator("summary").click();
    await editor.getByTestId("project-source-definition").fill("Unapplied source draft survives a module visit.");
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByTestId("surface-family-implicit").first().click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("surface-family-implicit").first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    await expect(page.getByTestId("app-shell")).not.toHaveAttribute("data-project-document-id", id!);
    await page.screenshot({ path: test.info().outputPath("global-implicit-after-catenoid.png") });

    const reopenSaved = async () => {
      await page.getByRole("button", { name: "Project", exact: true }).click();
      await expect(page.getByTestId("project-viewer-document")).toHaveValue("");
      await page.getByTestId("project-viewer-document").selectOption(id!);
      await expect(editor).toHaveAttribute("data-document-id", id!);
      await expect(editor).toHaveAttribute("data-source-hash", hash!);
      await editor.getByTestId("project-source-json").locator("summary").click();
      await expect(editor.getByTestId("project-source-definition")).toHaveValue("Unapplied source draft survives a module visit.");
      await expect(editor.getByTestId("project-source-undo")).toBeDisabled();
      await page.getByRole("button", { name: "Project", exact: true }).click();
    };
    await reopenSaved();
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    // Repeated module navigation must not silently reopen the saved source.
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("app-shell")).not.toHaveAttribute("data-project-document-id", id!);
    await page.getByTestId("surface-family-parametric").first().click();
    const preset = page.getByTestId("module-workspace").getByRole("button", { name: /^Catenoid(?:\s|$)/ }).first();
    await expect(preset).toBeVisible(); await preset.click();
    await expect(page.getByTestId("surface-primary-viewer").locator("canvas").first()).toBeVisible();
    await expect(editor).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("global-catenoid-module.png") });
    await reopenSaved();
    await expect(editor.getByTestId("project-source-back-to-module")).toHaveText("Back to normal Surfaces");
    await editor.getByTestId("project-source-back-to-module").click();
    await expect(editor).toHaveCount(0); await expect(page.getByTestId("module-workspace")).toBeVisible();
    await page.getByTestId("workspace-nav-mesh").click();
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("app-shell")).not.toHaveAttribute("data-project-document-id", id!);
    await expect(page.getByTestId("surface-family-parametric").first()).toHaveAttribute("aria-pressed", "true");
    await reopenSaved();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(savedBytes);
    await page.screenshot({ path: test.info().outputPath("retained-catenoid-reopened-draft.png") });
  } finally { await closeSurfaceApp(ctx); }
});
