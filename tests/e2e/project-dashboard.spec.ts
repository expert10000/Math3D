import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project Details dashboard uses stored document relations and opens a document", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-ripple-wave-study").click();
    await page.getByTestId("project-gallery-layout-toggle").click();
    const dashboard = page.getByTestId("project-dashboard");
    await expect(dashboard).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Project details sections" });
    await expect(tabs.getByTestId("project-detail-tab-overview")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("project-sidebar-contents")).toBeHidden();
    await tabs.getByTestId("project-detail-tab-documents").click();
    await expect(page.getByTestId("project-sidebar-contents")).toBeVisible();
    const research = page.getByTestId("project-research-links");
    await expect(research.locator('[data-testid^="project-research-citation-"]')).toHaveCount(4);
    await expect(research.locator('[data-testid^="project-research-note-"]:not([data-testid^="project-research-note-use-"])')).toHaveCount(2);
    await expect(research.getByText("Ripple Wave Research", { exact: false }).first()).toBeVisible();
    await tabs.getByTestId("project-detail-tab-relations").click();
    await expect(page.getByTestId("project-relationship-map")).toBeVisible();
    await expect(page.getByTestId("project-dependencies")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-results").click();
    await expect(page.getByTestId("project-detail-results")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-history").click();
    await expect(page.getByTestId("project-detail-history")).toBeVisible();
    const history = page.getByTestId("project-activity-timeline");
    const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await expect(history.getByTestId("project-activity-project-revision")).toContainText(`revision ${recorded.identity.revision}`);
    await expect(history.getByRole("region", { name: "Recorded revisions" }).getByRole("listitem")).toHaveCount(recorded.workspace.entries.length + 1);
    await expect(history.getByRole("region", { name: "Recorded derivations" }).getByRole("listitem")).toHaveCount(recorded.workspace.relations.length);
    const recordedRelation = recorded.workspace.relations[0];
    await expect(history.getByTestId(`project-activity-relation-${recordedRelation.relationId}`)).toContainText(`generation ${recordedRelation.sources[0].generation}`);
    await expect(history).toContainText("Dates and order unavailable");
    await tabs.getByTestId("project-detail-tab-overview").click();
    const header = page.getByTestId("project-explorer-header");
    await expect(header.getByTestId("project-viewer-return")).toHaveText("Open current document");
    await expect(header.getByTestId("project-detail-toggle")).toHaveText("Browse projects");
    await expect(header.getByText("More", { exact: true })).toBeVisible();
    await expect(header.locator(".project-placement-controls")).toHaveCount(0);
    await header.getByText("More", { exact: true }).click();
    await expect(header.getByRole("button", { name: "Project settings" })).toBeVisible();
    await tabs.getByTestId("project-detail-tab-history").click();
    await expect(page.getByTestId("project-overview").getByTestId("project-navigation-back")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-overview").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await expect(dashboard.getByRole("region", { name: "Project documents overview" }).getByRole("listitem")).toHaveCount(4);
    await expect(dashboard.getByRole("complementary", { name: "Project summary" })).toContainText(String(project.workspace.relations.length));
    const surface = project.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    const graph = project.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const graphTitle = project.metadata.documents[graph.expected.id].title;
    await expect(dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`)).toContainText(`From ${graphTitle}`);
    const map = page.getByTestId("project-relationship-map");
    await expect(map.getByRole("listitem")).toHaveCount(project.workspace.relations.length);
    const graphToSurface = project.workspace.relations.find((relation: any) => relation.target.type === "document" &&
      relation.target.generation.documentId === surface.expected.id && relation.sources.some((source: any) => source.documentId === graph.expected.id));
    expect(graphToSurface).toBeTruthy();
    await expect(map.getByTestId(`project-relation-freshness-${graphToSurface.relationId}`)).toHaveText("Up to date");
    await expect(dashboard.getByTestId(`project-document-freshness-${surface.expected.id}`)).toHaveText("Up to date");
    await map.getByTestId(`project-relation-edge-${graphToSurface.relationId}`).click();
    const detail = map.getByTestId("project-relation-detail");
    await expect(detail).toContainText(graphToSurface.operation);
    await expect(detail).toContainText(`Revision ${graphToSurface.sources[0].revision} · generation ${graphToSurface.sources[0].generation}`);
    await expect(detail).toContainText(`Target: ${project.metadata.documents[surface.expected.id].title}`);
    await map.screenshot({ path: test.info().outputPath("project-relationship-map.png"), animations: "disabled" });
    await detail.getByRole("button", { name: "Close relationship details" }).click();
    await resizeSurfaceAppWindow(ctx, 820, 859);
    await expect(dashboard).toBeVisible();
    const columns = await dashboard.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(1);
    await dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", surface.expected.id);
    await expect(page.getByTestId("project-explorer-panel")).toHaveClass(/project-viewer-panel/);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await map.getByTestId(`project-relation-node-${graphToSurface.relationId}-source-0`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", graph.expected.id);
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid Project Details shows freshness for its saved Mesh analysis", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    await page.getByTestId("project-gallery-layout-toggle").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.workspace.results.length).toBeGreaterThan(0);
    const result = project.workspace.results[0];
    await expect(page.getByTestId(`project-result-freshness-${result.resultId}`)).toHaveText("Up to date");
    await expect(page.getByTestId("project-relationship-map").getByRole("listitem")).toHaveCount(project.workspace.relations.length);
    await page.getByTestId("project-detail-tab-documents").click();
    const resultNote = project.notes.find((note: any) => note.anchor?.kind === "result");
    const links = page.getByTestId("project-research-links");
    const noteLink = links.getByTestId(`project-research-note-${resultNote.identity.id}`);
    await expect(noteLink).toContainText("Up to date");
    const valueNote = project.notes.find((note: any) => note.valueBindings?.some((binding: any) => binding.kind === "result"));
    const valueBinding = valueNote?.valueBindings.find((binding: any) => binding.kind === "result");
    expect(valueBinding).toBeTruthy();
    await expect(links.getByTestId(`project-research-note-value-${valueNote.identity.id}-${valueBinding.id}`)).toContainText("Up to date");
    await noteLink.locator(".project-research-target").first().getByRole("button", { name: "Inspect result" }).click();
    await expect(page.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    const browser = page.getByTestId("project-results-browser"), detail = browser.getByTestId("project-result-detail");
    await expect(detail).toContainText(resultNote.anchor.resultId);
    await expect(browser.getByTestId(`project-result-select-${result.resultId}`)).toBeVisible();
    await browser.getByTestId(`project-result-select-${result.resultId}`).click();
    await expect(detail.getByTestId("project-result-claim")).toContainText("Recorded");
    await expect(detail.getByTestId("project-result-verification"))
      .toHaveAttribute("data-scope", "not-checked");
    await expect(detail).toContainText(result.provenance.operation.algorithm);
    await expect(detail).toContainText(`Revision ${result.provenance.source.revision} · generation ${result.provenance.source.generation}`);
    await expect(detail.getByTestId("project-result-card-axes")).toContainText("Recorded");
    await expect(detail.getByTestId("result-publication-actions")).toHaveAttribute(
      "data-publication-status", "recorded");
    const evidencePath = test.info().outputPath("project-result-evidence.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(path)), evidencePath);
    await detail.getByTestId("project-result-export-evidence").click();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(evidencePath, "utf8")); } catch { return null; }
    }, { timeout: 60_000 }).not.toBeNull();
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    expect(evidence.schema).toBe("math3d.project-result-evidence/v1");
    expect(evidence.resultId).toBe(result.resultId);
    expect(evidence.source).toEqual(result.provenance.source);
    expect(evidence.publication).toMatchObject({ schema: "math3d.result-publication/v1",
      module: "project", assessment: { status: "recorded" } });
    expect(evidence.publication.summary).toEqual(evidence.summary);
    expect(evidence.assessment.mathematics).toMatch(/^Recorded /);
    if (evidence.assessment.status === "withheld") expect(evidence.summary).toBeNull();
    else expect(evidence.summary).toEqual(result.summary);
    const csvPath = test.info().outputPath("project-result-evidence.csv");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(path)), csvPath);
    await detail.getByTestId("project-result-export-evidence-csv").click();
    await expect.poll(async () => {
      try { return await readFile(csvPath, "utf8"); } catch { return null; }
    }, { timeout: 60_000 }).not.toBeNull();
    const csv = await readFile(csvPath, "utf8");
    expect(csv).toContain('"resultId","' + result.resultId + '"');
    expect(csv).toContain('"assessment.status","' + evidence.assessment.status + '"');
    if (evidence.summary === null) expect(csv).toContain('"summary",""');
    else expect(csv).toContain('"summary","' + JSON.stringify(evidence.summary).replaceAll('"', '""') + '"');
    const receiptPath = test.info().outputPath("result-publication.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(path)), receiptPath);
    await detail.getByTestId("result-publication-export-receipt").click();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(receiptPath, "utf8")); } catch { return null; }
    }, { timeout: 60_000 }).not.toBeNull();
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(evidence.publication);
    await browser.getByRole("searchbox", { name: "Search saved outputs" }).fill("no such output");
    await expect(browser.getByText("No matching results.")).toBeVisible();
    await browser.getByRole("searchbox", { name: "Search saved outputs" }).fill("");
    await detail.getByRole("button", { name: project.metadata.documents[result.provenance.source.documentId].title }).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", result.provenance.source.documentId);
  } finally { await closeSurfaceApp(ctx); }
});

test("Project Result opens its exact Note and cited Workbook block", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    await page.getByTestId("project-gallery-layout-toggle").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1")),
      { timeout: 60_000 }).not.toBeNull();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const resultNote = project.notes.find((note: { anchor?: { kind?: string } }) =>
      note.anchor?.kind === "result");
    await page.getByTestId("project-detail-tab-documents").click();
    await page.getByTestId("project-research-links")
      .getByTestId(`project-research-note-${resultNote.identity.id}`)
      .locator(".project-research-target").first()
      .getByRole("button", { name: "Inspect result" }).click();
    await expect(page.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    const backlinks = page.getByTestId("project-result-backlinks");
    await expect(backlinks).toContainText("Exact reference");
    const noteLink = backlinks.locator('[data-testid^="project-result-backlink-note-"]').first();
    const workbookLink = backlinks.locator('[data-testid^="project-result-backlink-workbook-"]').first();
    await expect(noteLink).toContainText(resultNote.title);
    await expect(workbookLink).toContainText(project.workbooks[0].title);
    await noteLink.getByRole("button", { name: "Open note" }).click();
    const notes = page.getByTestId("project-notes-panel");
    await expect(notes.getByTestId(`project-note-${resultNote.identity.id}`)).toBeVisible();
    await notes.getByRole("button", { name: "Back to Project" }).click();
    await expect(backlinks).toBeVisible();
    await workbookLink.getByRole("button", { name: "Open block" }).click();
    await expect(page.getByTestId("project-middle-workbook")).toBeVisible({ timeout: 60_000 });
  } finally { await closeSurfaceApp(ctx); }
});

test("Project Documents follows exact Workbook citations and Note anchors", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-graph-derivative-notebook").click();
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-detail-tab-documents").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const links = page.getByTestId("project-research-links");
    await expect(links).toBeVisible();
    const citations = links.locator('[data-testid^="project-research-citation-"]');
    await expect(citations).toHaveCount(3);
    const result = project.workspace.results[0];
    const resultCitation = citations.filter({ hasText: "Recorded numerical derivative" });
    await expect(resultCitation).toContainText(`r${result.provenance.source.revision} g${result.provenance.source.generation}`);
    await resultCitation.getByRole("button", { name: "Inspect result" }).click();
    await expect(page.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("project-result-detail")).toContainText(result.resultId);
    await page.getByTestId("project-detail-tab-documents").click();
    const note = project.notes[0];
    const noteLink = links.getByTestId(`project-research-note-${note.identity.id}`);
    await expect(noteLink).toContainText("Up to date");
    await noteLink.getByRole("button", { name: "Open document" }).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", note.anchor.source.documentId);
  } finally { await closeSurfaceApp(ctx); }
});

test("an older saved Ripple copy receives research links when reopened", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-ripple-wave-study").click();
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const core = require(resolve("packages/core/src/index.ts"));
    const { workbooks: _workbooks, notes: _notes, ...withoutResearch } = current;
    const legacy = core.parseMath3DProject(JSON.stringify({ ...withoutResearch,
      identity: core.createDocumentIdentity(current.identity.id, current.workspace, current.identity.revision + 1) }));
    const bytes = core.serializeMath3DProject(legacy);
    await page.evaluate(async ({ id, bytes }) => {
      localStorage.setItem("math3d.project.v1", bytes);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, bytes);
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const request = indexedDB.open("math3d.project-resources.v1", 1);
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      });
      await new Promise<void>((done, fail) => {
        const transaction = db.transaction("projects", "readwrite"), store = transaction.objectStore("projects"), request = store.get(id);
        request.onsuccess = () => {
          const record = request.result;
          if (!record) { transaction.abort(); return; }
          record.resources = record.resources.filter((item: { kind: string }) => item.kind !== "workbook-payload");
          store.put(record);
        };
        request.onerror = () => fail(request.error);
        transaction.oncomplete = () => done(); transaction.onabort = () => fail(transaction.error);
      });
      db.close();
    }, { id: legacy.identity.id, bytes });
    await page.reload();
    const panel = page.getByTestId("project-explorer-panel");
    if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-ripple-wave-study").click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workbooks?.length ?? 0)).toBe(1);
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).notes?.length ?? 0)).toBe(2);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(restored.identity.id).toBe(legacy.identity.id);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-tab-documents").click();
    await expect(panel.getByTestId("project-research-links").locator('[data-testid^="project-research-citation-"]')).toHaveCount(4);
    await page.reload();
    if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-ripple-wave-study").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-tab-documents").click();
    await expect(panel.getByTestId("project-research-links").locator('[data-testid^="project-research-citation-"]')).toHaveCount(4);
  } finally { await closeSurfaceApp(ctx); }
});
