import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, parseMath3DProject,
  serializeMath3DProject, vectorField3DExpression } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GR-05 native comparison withholds incompatible Cartesian frames and vector units", async () => {
  const fixture = parseMath3DProject(readFileSync(resolve(
    "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
  const first = fixture.workspace.entries.find(entry => entry.module === "vector3d")?.checkpoint;
  if (!first || first.format !== "math3d.vector-field3d-document" ||
      first.source.field.kind !== "expressions") throw new Error("Expected analytic field fixture.");
  const wrongFrame = createVectorField3DDocument({ ...first.source,
    axes: [{ ...first.source.axes[0], unit: "cm" }, first.source.axes[1],
      first.source.axes[2]],
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "cm/s"), vectorField3DExpression("y", "m/s"),
      vectorField3DExpression("z", "m/s")] } },
  { stableKey: "gr05-wrong-frame", title: "Different spatial unit" });
  const wrongVectorUnits = createVectorField3DDocument({ ...first.source,
    timeUnit: "ms",
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/ms"), vectorField3DExpression("y", "m/ms"),
      vectorField3DExpression("z", "m/ms")] } },
  { stableKey: "gr05-wrong-vector-units", title: "Different vector unit" });
  const project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, wrongFrame, wrongVectorUnits].map(checkpoint => ({
      module: "vector3d" as const, checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], results: [], artifacts: [], relations: [],
    constructions: [], committedSelection: null }),
  { stableKey: "gr05-negative-frame-units", title: "Negative comparison contracts" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gr05-negative.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    const panel = explorer.getByTestId("gf18-field-comparison");
    for (const source of [wrongFrame, wrongVectorUnits]) {
      await panel.getByLabel("Second saved field").selectOption(source.identity.id);
      await panel.getByRole("button", { name: "Compare fields" }).click();
      await expect(panel.getByRole("alert")).toContainText(
        "aligned Cartesian axes and identical component units");
      await expect(panel.getByRole("button", { name: "Save comparison in Project" }))
        .toHaveCount(0);
    }
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(active.workspace.results).toHaveLength(0);
  } finally { await closeSurfaceApp(app); }
});
