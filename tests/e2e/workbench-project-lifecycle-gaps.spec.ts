import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

type SavedProject = {
  workspace: {
    entries: Array<{ module: string; expected: { id: string; revision: number; structuralHash: string }; checkpoint?: { source?: { resource?: { checksum?: string } }; function?: { sourceText?: string } }; replay?: { payload?: { transactions?: unknown[] } } }>;
    results: Array<{ resultId: string; provenance?: { source?: { documentId?: string }; operation?: { type?: string } } }>;
    relations: Array<{ operation?: string; sources?: Array<{ documentId?: string }>; target?: { generation?: { documentId?: string } } }>;
  };
};

async function saveProject(page: Page): Promise<SavedProject> {
  const toggle = page.getByTestId("projects-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const panel = page.getByTestId("project-explorer-panel");
  const button = panel.getByTestId("project-save");
  if (!(await button.isVisible())) await panel.getByTestId("project-gallery-layout-toggle").click();
  await expect(button).toBeVisible();
  await button.click();
  await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!) as SavedProject);
  await page.getByRole("button", { name: "Close project explorer" }).click();
  return saved;
}

test("MESH-05 known gap: Smooth New object keeps the Box document ID", async () => {
  test.setTimeout(120_000);
  const ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
  try {
    const page = ctx.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-mesh").click();
    await page.getByRole("button", { name: "Mesh presets", exact: true }).click();
    await page.getByTestId("mesh-preset-card-mesh_box").click();
    await expect(page.getByTestId("mesh-kernel-document")).toContainText("revision 1");
    const before = await saveProject(page);
    const source = before.workspace.entries.find((entry) => entry.module === "mesh");
    expect(source).toBeDefined();

    await page.getByRole("button", { name: "Mesh tools", exact: true }).click();
    const card = page.getByTestId("mesh-workspace-operation-registry").first();
    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await card.getByTestId("mesh-workspace-operation-registry-smooth-iterations").fill("2");
    await card.getByTestId("mesh-workspace-operation-registry-smooth-output-derived").check();
    await card.getByTestId("mesh-workspace-operation-registry-run-smooth").click();
    const result = card.getByTestId("mesh-workspace-operation-registry-last-result");
    await expect(result).toContainText("success", { timeout: 60_000 });
    await expect(result).toContainText("Output: new-object");
    const after = await saveProject(page);
    const entries = after.workspace.entries.filter((entry) => entry.module === "mesh");
    expect(entries[0]?.expected.revision).toBeGreaterThan(source!.expected.revision);
    const distinctResult = entries.find((entry) => entry.expected.id !== source!.expected.id);
    const sourceToDerived = after.workspace.relations.find((relation) =>
      relation.sources?.some((item) => item.documentId === source!.expected.id) &&
      relation.target?.generation?.documentId === distinctResult?.expected.id);
    const evidencePath = test.info().outputPath("mesh-new-object-project-evidence.json");
    writeFileSync(evidencePath, JSON.stringify({
        source: { expected: source!.expected, checksum: source!.checkpoint?.source?.resource?.checksum },
        savedMeshEntries: entries.map((entry) => ({ expected: entry.expected, checkpointChecksum: entry.checkpoint?.source?.resource?.checksum, replayTransactions: entry.replay?.payload?.transactions?.length ?? 0 })),
        sourceToDerived: sourceToDerived ?? null,
        operationPanel: await result.innerText(),
      }, null, 2));
    await test.info().attach("mesh-new-object-project-evidence", { path: evidencePath, contentType: "application/json" });

    test.fail(true, "MESH-05: New object should create a distinct result document and source-to-derived relation.");
    expect({ distinctResult: Boolean(distinctResult), sourceToDerived: Boolean(sourceToDerived) })
      .toEqual({ distinctResult: true, sourceToDerived: true });
  } finally { await closeSurfaceApp(ctx); }
});

test("CA-05 known gap: published 1/z numerical result is missing from Project save", async () => {
  test.setTimeout(120_000);
  const ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
  try {
    const page = ctx.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Residue Lab", exact: true }).click();
    await page.getByRole("button", { name: "Residue", exact: true }).last().click();
    await page.getByRole("tab", { name: "Provenance" }).click();
    await page.getByRole("combobox", { name: "Provenance view" }).selectOption({ label: "Residue" });
    await page.getByRole("textbox", { name: "Complex function expression" }).fill("1/z");
    await page.getByTestId("publish-complex-numerical-result").click();
    const inspector = page.getByTestId("complex-numerical-result-inspector");
    await expect(inspector).toContainText("F06 numerical result · not proof");
    const published = await inspector.innerText();
    const sourceRevision = Number(published.match(/source revision: r(\d+)/)?.[1]);
    expect(Number.isInteger(sourceRevision)).toBe(true);

    const saved = await saveProject(page);
    const source = saved.workspace.entries.find((entry) => entry.module === "complex" && entry.checkpoint?.function?.sourceText === "1/z");
    expect(source).toBeDefined();
    expect(source!.expected.revision).toBe(sourceRevision);
    const numerical = saved.workspace.results.find((result) =>
      result.provenance?.source?.documentId === source!.expected.id &&
      result.provenance?.operation?.type === "complex.numerical-analysis");
    const evidencePath = test.info().outputPath("complex-numerical-project-evidence.json");
    writeFileSync(evidencePath, JSON.stringify({
        publishedInspector: published,
        savedSource: { expected: source!.expected, expression: source!.checkpoint?.function?.sourceText },
        savedComplexResults: saved.workspace.results.filter((result) => result.provenance?.source?.documentId === source!.expected.id)
          .map((result) => ({ resultId: result.resultId, operation: result.provenance?.operation?.type })),
      }, null, 2));
    await test.info().attach("complex-numerical-project-evidence", { path: evidencePath, contentType: "application/json" });

    test.fail(true, "CA-05: a published numerical result should retain a source-qualified Project result reference.");
    expect(numerical).toBeDefined();
  } finally { await closeSurfaceApp(ctx); }
});
