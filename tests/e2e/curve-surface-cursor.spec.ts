import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("M3D20-03 shares an exact Curve parameter with its Surface chart and clears an unavailable target", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const starter = core.instantiateMath3DProjectTemplate("curve-construction-study", "cursor-e2e");
    const reference = core.createSurfaceDocument({ stableKey: "cursor-reference", metadata: { title: "Reference plane" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
      units: { length: "unitless" }, orientation: { sign: 1 }, definition: { familyId: "literal", expressions: { x: "u", y: "v", z: "0" } },
      parameters: {}, branchPolicy: null,
    } });
    const workspace = core.createMixedWorkspaceDocument({ ...starter.workspace, entries: [...starter.workspace.entries,
      { module: "surface", checkpoint: reference, expected: reference.identity, replay: null }] });
    const project = core.createMath3DProject(workspace, { stableKey: "cursor-e2e-project", title: "Curve chart cursor" });
    const chart = workspace.entries.find((entry: any) => entry.checkpoint.metadata?.title === "Parameter chart")!;
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "curve-chart.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-save").click();
    await panel.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByTestId("project-composition-source-0").selectOption(chart.expected.id);
    await view.getByTestId("project-composition-source-1").selectOption(reference.identity.id);
    const chartPane = view.getByRole("region", { name: /A: Parameter chart/ });
    await expect(chartPane.locator("canvas").first()).toBeVisible();
    await expect(view.getByTestId("project-composition-curve-source")).toBeVisible();
    await view.getByTestId("project-composition-curve-t").fill("0.5");
    await view.getByTestId("project-composition-share-curve").click();
    await expect(chartPane.getByTestId("project-composition-curve-parameter")).toContainText("u=0.50000, v=0.25000");
    await expect(view.getByTestId("project-composition-cursor-status")).toContainText("Shared saved Curve parameter");
    await expect(view.getByRole("region", { name: /B: Reference plane/ }).getByTestId("project-composition-curve-parameter")).toHaveCount(0);
    await view.getByTestId("project-composition-cursor-link").click();
    await expect(view.getByTestId("project-composition-curve-parameter")).toHaveCount(0);
    await expect(view.getByTestId("project-composition-share-curve")).toBeDisabled();
    await view.getByTestId("project-composition-cursor-link").click();
    await view.getByTestId("project-composition-share-curve").click();
    await expect(chartPane.getByTestId("project-composition-curve-parameter")).toBeVisible();
    await view.getByTestId("project-composition-chart-u").fill("0.75");
    await view.getByTestId("project-composition-chart-v").fill("0.5625");
    await view.getByTestId("project-composition-return-curve").click();
    await expect(view.getByTestId("project-composition-curve-t")).toHaveValue("0.75");
    await expect(chartPane.getByTestId("project-composition-curve-parameter")).toContainText("u=0.75000, v=0.56250");
    await expect(view.getByTestId("project-composition-cursor-status")).toContainText("Returned exact Surface chart coordinate");
    await view.getByTestId("project-composition-chart-v").fill("0.6");
    await view.getByTestId("project-composition-return-curve").click();
    await expect(view.getByTestId("project-composition-cursor-status")).toContainText("not on the saved Curve trace");
    await expect(view.getByTestId("project-composition-curve-t")).toHaveValue("0.75");
    await view.getByTestId("project-composition-source-0").selectOption(reference.identity.id);
    await expect(view.getByTestId("project-composition-curve-parameter")).toHaveCount(0);
    await expect(view.getByTestId("project-composition-curve-source")).toHaveCount(0);
  } finally { await closeSurfaceApp(ctx); }
});
