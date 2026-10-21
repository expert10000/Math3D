import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("GRA-17 desktop reviews and downloads a source-linked Complex contour", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Parametric");
    const editor = graphEditor(page);
    await editor.getByLabel("Parametric name").fill("Complex circle");
    await editor.getByLabel("Parametric x expression").fill("cos(t)");
    await editor.getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await panel.getByLabel("Complex contour samples").fill("129");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("129 points · closed contour");
    await expect(panel.getByRole("img", { name: "Complex contour preview" })).toBeVisible();
    const path = resolve("output/graph2d-complex-mapping-e2e.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), path);
    await panel.getByRole("button", { name: "Download Complex Analysis document" }).click();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
    }).toMatchObject({ format: "math3d.complex-analysis-document", provenance: { origin: "graph2d-promotion" } });
  } finally { await closeSurfaceApp(app); }
});
