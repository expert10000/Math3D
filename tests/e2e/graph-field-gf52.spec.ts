import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, serializeMath3DProject,
  upsertProjectTemporalFieldSource, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-52 saves exact-frame component evidence and plays pinned surfaces", async () => {
  test.setTimeout(180_000);
  const fixture = parseMath3DProject(readFileSync(resolve(
    "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
  const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } }, { stableKey: key });
  const first = make("gf52-desktop-first"), second = make("gf52-desktop-second");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf52-desktop", title: "Surface event gate" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id },
      { time: 1, documentId: second.identity.id }],
    { stableKey: "gf52-desktop-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf52.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const panel = explorer.getByTestId("gf22-time-source");
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByTestId("gf30-run-moving").click();
    await expect(panel.getByTestId("gf33-moving-playback"))
      .toContainText("Event: stable-count", { timeout: 75_000 });
    await panel.getByRole("button", { name: "Save exact-frame topology events" }).click();
    await expect(panel.getByTestId("gf33-moving-playback"))
      .toContainText("Saved 1 exact-frame event records");
    await panel.getByRole("button", { name: "Save component-event linkage" }).click();
    await expect(panel.getByTestId("gf57-linkage-status"))
      .toContainText("sampled component links");
    await panel.getByRole("button", { name: "Play verified frames" }).click();
    await expect(panel.getByTestId("gf33-moving-playback"))
      .toContainText("Frame 2/2: 1 s", { timeout: 15_000 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    const results = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!).workspace.results);
    const result = results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.temporal-surface-events");
    expect(result.summary.events[0].kind).toBe("stable-count");
    expect(result.summary.interpolation).toBe("unavailable");
    const linkage = results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.temporal-surface-linkage");
    expect(linkage.summary.exactFrameOnly).toBe(true);
  } finally { await closeSurfaceApp(app); }
});
