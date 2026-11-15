import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType } from "./helpers/graphAuthoring";

test("Graph editor keeps actions visible and returns focus to invalid fields", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 760, height: 600 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    const editor = graphEditor(page);
    const minimum = editor.getByRole("spinbutton", { name: "Domain minimum" });
    await minimum.fill("1000");
    const recovery = editor.getByRole("button", { name: /Go to Domain: Domain minimum must be less than maximum/ });
    await expect(recovery).toBeVisible();
    await recovery.click();
    await expect(minimum).toBeFocused();
    await minimum.fill("-10");
    await editor.getByLabel("Function expression").fill("x^2");
    await editor.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const preview = editor.getByRole("button", { name: "Preview", exact: true });
    await expect(preview).toBeInViewport();
    await preview.click();
    await expect(editor.getByLabel("Graph preview", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "Back to editor" }).click();
    await expect(preview).toBeFocused();
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Graph functions").getByRole("button", { name: "Add Graph" })).toBeFocused();
  } finally { await closeSurfaceApp(app); }
});
