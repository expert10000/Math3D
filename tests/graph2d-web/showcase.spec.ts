import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
const { getGraph2DPresetCatalog, instantiateGraph2DPreset } = require(resolve("packages/core/src/index.ts"));

test("GGL14–15 web presentation and local read-only Graph file", async ({page}) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
  await page.getByTestId("graph2d-presentation-open").click();
  await expect(page.getByTestId("graphs-workspace")).toHaveAttribute("data-presentation", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("graph2d-presentation-open")).toBeFocused();
  await page.getByTestId("graph-gallery-open").click();
  const gallery = page.getByTestId("graph-gallery");
  await gallery.getByRole("button", {name: "View local file"}).click();
  const document = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison"), "web-local-view").document;
  await gallery.getByTestId("graph-local-view-file").setInputFiles({ name: "graph.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(gallery.getByTestId("graph-local-view-result")).toContainText("Unit slope");
  await expect(page.getByLabel("Empty graph scene")).toBeVisible();
  await gallery.getByRole("button", {name: "Open an independent editable copy"}).click();
  await expect(gallery).not.toBeVisible();
  await expect(page.getByLabel("Graph functions")).toContainText("Unit slope");
});
