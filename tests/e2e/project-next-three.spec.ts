import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));
const download = async (ctx: LaunchedSurfaceApp, click: () => Promise<unknown>, name: string) => {
  const file = test.info().outputPath(name);
  await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), file);
  await click();
  await expect.poll(() => { try { const bytes = readFileSync(file); if (name.endsWith('.json')) JSON.parse(bytes.toString()); return bytes.length > 0; } catch { return false; } }).toBe(true);
  return readFileSync(file, "utf8");
};
const openValues = async (page: Page) => {
  const values = page.getByTestId('note-live-values').first();
  if (await values.getAttribute('open') === null) await values.locator('summary').click();
  return values;
};

test("PRJ50 retains three resolutions of one source through export and cold reopen", async () => {
  test.setTimeout(300_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, projects = page.getByTestId('project-explorer-panel'), workflow = page.getByTestId('project-saved-mesh-workflow');
    await page.setViewportSize({ width: 1440, height: 1000 });
    const item = collection.projects.find((entry: any) => (entry.project ?? entry).metadata.title === 'Catenoid'), project = item.project ?? item, sourceId = project.workspace.entries[0].expected.id;
    await page.getByTestId('projects-toggle').click();
    await projects.getByTestId('project-import-file').setInputFiles({ name: 'catenoid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(item)) });
    await projects.getByTestId('project-import-open').click(); await projects.getByTestId(`project-open-analysis-${sourceId}`).click();
    await workflow.getByTestId('project-analysis-studies').locator('summary').click(); await workflow.getByTestId('project-resolution-run').click();
    await expect(workflow.getByTestId('project-saved-mesh-message')).toContainText('Three resolution studies', { timeout: 60_000 });
    await expect(workflow.getByTestId('project-resolution-table').locator('tbody tr')).toHaveCount(3);
    const report = JSON.parse(await download(ctx, () => workflow.getByTestId('project-resolution-export-json').click(), 'resolution.json'));
    expect(report.runs.map((run: any) => [run.samplesPerAxis, run.vertexCount, run.interior.count, run.interior.excluded])).toEqual([[17,289,225,64],[33,1089,961,128],[65,4225,3969,256]]);
    expect(report.surfaceSource.documentId).toBe(sourceId); expect(report.qualification).toContain('not certified');
    await workflow.getByTestId('project-resolution-run').click();
    await expect(workflow.getByTestId('project-saved-mesh-message')).toContainText('Three resolution studies');
    await expect(workflow.getByTestId('project-resolution-table').locator('tbody tr')).toHaveCount(3);
    await page.getByTestId('projects-toggle').click(); await projects.getByTestId('project-save').click();
    await expect(projects.getByTestId('project-message')).toContainText('Saved');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('math3d.project.v1')!));
    expect(saved.workspace.entries.find((entry: any) => entry.expected.id === sourceId).checkpoint.source).toEqual(project.workspace.entries[0].checkpoint.source);
    const packageText = await download(ctx, () => projects.getByTestId('project-export-resources').click(), 'resolution-project.json');
    expect(JSON.parse(packageText).project.workspace.results.filter((item: any) => report.runs.some((run: any) => run.savedResult.resultId === item.resultId))).toHaveLength(3);
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page; projects = page.getByTestId('project-explorer-panel'); workflow = page.getByTestId('project-saved-mesh-workflow');
    await page.getByTestId('projects-toggle').click(); await projects.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await page.getByTestId('projects-toggle').click(); await projects.getByTestId(`project-open-analysis-${sourceId}`).click();
    expect(JSON.parse(await download(ctx, () => workflow.getByTestId('project-resolution-export-json').click(), 'resolution-reopened.json'))).toEqual(report);
    await workflow.getByTestId('project-resolution-results').scrollIntoViewIfNeeded(); await page.screenshot({ path: test.info().outputPath('resolution-comparison.png') });
  } finally { await closeSurfaceApp(ctx); }
});

test("NOTE03 edits accessible document content and preserves it in a saved Workbook resource", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    const item = collection.projects.find((entry: any) => (entry.project ?? entry).metadata.title === 'Catenoid'), sourceId = (item.project ?? item).workspace.entries[0].expected.id;
    await page.getByTestId('projects-toggle').click();
    await page.getByTestId('project-explorer-panel').getByTestId('project-import-file').setInputFiles({ name: 'catenoid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(item)) });
    await page.getByTestId('project-explorer-panel').getByTestId('project-import-open').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-analysis-${sourceId}`).click();
    const image = `data:image/png;base64,${(await page.getByTestId('surface-viewer-canvas-host').first().screenshot()).toString('base64')}`;
    await page.evaluate(thumbnail => {
      const books = JSON.parse(localStorage.getItem('math3d.workbooks.v1')!); const book = books[0]; book.title = 'Catenoid Investigation';
      book.stages.forEach((stage: any) => { stage.blocks = []; });
      book.stages[0].blocks = [{ id: 'prose', type: 'text', title: 'Observation', text: '# Catenoid\n**Numerical evidence** and $H=0$\n<script>window.notebookExecuted=1</script>' }, { id: 'equation', type: 'formula', title: 'Parametrization', formula: '\\mathbf{x}(u,v)=(\\cosh v\\cos u,\\cosh v\\sin u,v)' }];
      book.stages[2].blocks = [{ id: 'figure', type: 'visualize', title: 'Captured view', visualize: { live: false, snapshotA: { datasetRef: 'captured-surface', datasetKind: 'surface', viewerKind: 'surface', capturedAt: Date.now(), thumbnail } } }];
      localStorage.setItem('math3d.workbooks.v1', JSON.stringify(books)); localStorage.setItem('math3d.workbooks.active.v1', book.id);
    }, image);
    await page.reload(); await page.getByRole('button', { name: 'Surfaces', exact: true }).first().click(); await page.getByRole('button', { name: 'Workbook', exact: true }).first().click();
    await page.getByTestId('workbook-view-document').click();
    const prose = page.getByTestId('workbook-document-block-prose'), figure = page.getByTestId('workbook-document-block-figure');
    await expect(prose.locator('strong')).toContainText('Numerical evidence'); await expect(prose.locator('math')).toHaveCount(1);
    await expect(page.getByTestId('workbook-equation-rendered').locator('math')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).notebookExecuted)).toBeUndefined();
    await prose.getByText('Edit document content', { exact: true }).click(); await prose.getByRole('button', { name: 'Add table to this block' }).click();
    await prose.getByLabel('Table caption', { exact: true }).fill('Resolution measurements'); await prose.getByLabel('Table columns', { exact: true }).fill('n\tInterior');
    await prose.getByLabel('Table rows', { exact: true }).fill('17\t225\n33\t961\n65\t3969'); await prose.getByTestId('workbook-table-apply').click();
    await expect(prose.locator('table tbody tr')).toHaveCount(3);
    await figure.getByText('Edit document content', { exact: true }).click(); await figure.getByRole('button', { name: 'Add figure caption and description' }).click();
    await figure.getByLabel('Figure caption', { exact: true }).fill('Saved mathematical surface'); await figure.getByLabel('Figure description', { exact: true }).fill('Captured three-dimensional mathematical surface');
    await expect(figure.getByRole('img')).toHaveAttribute('alt', 'Captured three-dimensional mathematical surface');
    const markdown = await download(ctx, () => page.getByRole('button', { name: 'Export Markdown', exact: true }).click(), 'investigation.md');
    expect(markdown).toContain('| n | Interior |'); expect(markdown).toContain('$$'); expect(markdown).toContain('![Captured three-dimensional mathematical surface]');
    await page.evaluate(() => { window.open = () => null; });
    const html = await download(ctx, () => page.getByRole('button', { name: 'Export PDF', exact: true }).click(), 'investigation.html');
    expect(html).toContain('<math'); expect(html).toContain('<caption>Resolution measurements</caption>'); expect(html).toContain('Saved mathematical surface'); expect(html).toContain('&lt;script&gt;');
    await page.getByTestId('projects-toggle').click(); const projects = page.getByTestId('project-explorer-panel');
    await projects.getByTestId('project-title').fill('Document study'); await projects.getByTestId('project-save').click(); await expect(projects.getByTestId('project-message')).toContainText('Saved');
    await projects.getByTestId('project-save-active-workbook').click(); await expect(projects.getByTestId('project-message')).toContainText('to this Project');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('math3d.project.v1')!)), packageText = await download(ctx, () => projects.getByTestId('project-export-resources').click(), 'investigation-project.json');
    expect(JSON.parse(packageText).resources.some((item: any) => item.kind === 'workbook-payload')).toBe(true);
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await page.getByTestId('projects-toggle').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-workbook-${saved.workbooks[0].id}`).click();
    await page.getByRole('button', { name: 'Surfaces', exact: true }).first().click(); await page.getByRole('button', { name: 'Workbook', exact: true }).first().click(); await page.getByTestId('workbook-view-document').click();
    await expect(page.getByTestId('workbook-document-block-prose').locator('table tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('workbook-document-block-figure').getByRole('img')).toHaveAttribute('alt', 'Captured three-dimensional mathematical surface');
    await page.goto(pathToFileURL(test.info().outputPath('investigation.html')).href);
    await page.locator('.workbook').first().screenshot({ path: test.info().outputPath('investigation-document.png') });
  } finally { await closeSurfaceApp(ctx); }
});

test("NTS06 live parameter values show edits and frozen snapshots survive export and reopen", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId('workspace-nav-graphs').click(); await page.getByTestId('graph-gallery-open').click();
    await page.getByLabel('Search graphs').fill('Two slopes'); await page.getByRole('button', { name: 'Open Two slopes', exact: true }).click();
    await page.getByTestId('graph2d-parameters-open').click(); const parameters = page.getByTestId('graph2d-parameters');
    await parameters.getByRole('button', { name: 'Configure a', exact: true }).click(); await parameters.getByLabel('Parameter unit', { exact: true }).fill('ratio'); await parameters.getByRole('button', { name: 'Save parameter', exact: true }).click();
    await page.getByTestId('projects-toggle').click(); const projects = page.getByTestId('project-explorer-panel');
    await projects.getByTestId('project-title').fill('Live values'); await projects.getByTestId('project-save').click(); await expect(projects.getByTestId('project-message')).toContainText('Saved'); await projects.getByRole('button', { name: 'Close project explorer' }).click();
    await page.getByTestId('notes-toggle').click(); const notes = page.getByTestId('project-notes-panel'); await notes.getByTestId('notes-new').click();
    await notes.getByRole('textbox', { name: 'Draft title' }).fill('Parameter observation'); await notes.getByRole('textbox', { name: 'Draft body' }).fill('a is {{value:unknown}}.'); await notes.getByTestId('notes-save').click(); await expect(notes.getByTestId('notes-message')).toContainText('Saved 1 Note');
    let values = await openValues(page); await values.getByLabel('Live value target', { exact: true }).selectOption({ label: 'Graph parameter a' }); await values.getByRole('button', { name: 'Insert live value' }).click();
    values = await openValues(page); await expect(values.getByTestId('note-value-value1')).toContainText('2 ratio · current');
    await notes.getByRole('button', { name: 'Close', exact: true }).click(); await parameters.getByLabel('a preview value', { exact: true }).fill('3'); await parameters.getByRole('button', { name: 'Apply preview value', exact: true }).click();
    await page.getByTestId('notes-toggle').click(); values = await openValues(page); await expect(values.getByTestId('note-value-value1')).toContainText('3 ratio · stale');
    await expect(notes.getByTestId('note-rendered-body')).toContainText('{{value:unknown}}');
    const beforeExport = await page.evaluate(() => localStorage.getItem('math3d.project.v1'));
    const snapshot = JSON.parse(await download(ctx, () => values.getByRole('button', { name: 'Export value snapshot' }).click(), 'live-note-snapshot.json'));
    expect(snapshot.valueSnapshot.values[0]).toMatchObject({ value: 3, units: 'ratio', status: 'stale' });
    expect(await page.evaluate(() => localStorage.getItem('math3d.project.v1'))).toBe(beforeExport);
    await values.getByRole('button', { name: 'Freeze values' }).click(); values = await openValues(page); await expect(values).toContainText('frozen snapshot');
    await notes.getByRole('button', { name: 'Close', exact: true }).click(); await parameters.getByLabel('a preview value', { exact: true }).fill('4'); await parameters.getByRole('button', { name: 'Apply preview value', exact: true }).click();
    await page.getByTestId('notes-toggle').click(); values = await openValues(page); await expect(values.getByTestId('note-value-value1')).toContainText('3 ratio · stale');
    await values.screenshot({ path: test.info().outputPath('note-frozen-values.png') }); await notes.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByTestId('projects-toggle').click();
    await projects.getByTestId('project-save').click(); await expect(projects.getByTestId('project-message')).toContainText('Saved');
    const packageText = await download(ctx, () => projects.getByTestId('project-export-resources').click(), 'frozen-notes-project.json');
    expect(JSON.parse(packageText).project.notes[0].valueSnapshot.values[0]).toMatchObject({ value: 3, units: 'ratio', status: 'stale' });
    const savedId = JSON.parse(packageText).project.identity.id;
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await page.getByTestId('projects-toggle').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-saved-${savedId}`).click();
    await expect(page.getByTestId('project-explorer-panel')).toBeHidden();
    await page.getByTestId('notes-toggle').click(); values = await openValues(page);
    await expect(values.getByTestId('note-value-value1')).toContainText('3 ratio · stale'); await values.getByRole('button', { name: 'Use live values' }).click(); values = await openValues(page); await expect(values.getByTestId('note-value-value1')).toContainText('4 ratio · stale');
  } finally { await closeSurfaceApp(ctx); }
});
