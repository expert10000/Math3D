import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const openWorkbook = async (page: Page) => {
  await page.getByRole('button', { name: 'Surfaces', exact: true }).first().click();
  const back = page.getByRole('button', { name: 'Back to module' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Workbook', exact: true }).first().click();
};
const bookState = (page: Page) => page.evaluate(() => {
  const id = localStorage.getItem('math3d.workbooks.active.v1');
  return JSON.parse(localStorage.getItem('math3d.workbooks.v1')!).find((book: any) => book.id === id);
});
const download = async (ctx: LaunchedSurfaceApp, action: () => Promise<unknown>, name: string) => {
  const file = test.info().outputPath(name);
  await ctx.app.evaluate(({ session }, target) => session.defaultSession.once('will-download', (_event, item) => item.setSavePath(target)), file);
  await action();
  await expect.poll(() => { try { const text = readFileSync(file, 'utf8'); return name.endsWith('.json') ? JSON.parse(text) : text || null; } catch { return null; } }).not.toBeNull();
  const text = readFileSync(file, 'utf8'); return name.endsWith('.json') ? JSON.parse(text) : text;
};

test('WB04 previews and runs named parameter descendants and retains bindings after cold reopen', async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem('math3d.workbooks.v1')!), book = books[0]; book.title = 'Named sampling study';
      book.stages.forEach((stage: any) => { stage.blocks = []; });
      book.stages[1].blocks = [{ id: 'independent', type: 'compute', title: 'Independent computation', compute: { operatorId: 'chart_grid' } }, { id: 'consumer', type: 'compute', title: 'Grid computation', compute: { operatorId: 'chart_grid' } }];
      book.stages[2].blocks = [{ id: 'view', type: 'visualize', title: 'Dependent view', visualize: { live: false } }];
      book.dependencies = [{ id: 'view-edge', targetBlockId: 'view', source: { kind: 'block', blockId: 'consumer' } }];
      localStorage.setItem('math3d.workbooks.v1', JSON.stringify(books)); localStorage.setItem('math3d.workbooks.active.v1', book.id);
    });
    await page.reload(); await openWorkbook(page);
    const parameters = page.getByTestId('workbook-named-parameters'); await parameters.locator('summary').click();
    await parameters.getByRole('button', { name: 'Add named parameter', exact: true }).click();
    await parameters.getByLabel('Named parameter consumer', { exact: true }).selectOption(JSON.stringify(['consumer', 'paramResolution']));
    await parameters.getByRole('button', { name: 'Bind parameter', exact: true }).click();
    await expect(parameters.getByTestId('workbook-parameter-plan')).toContainText('Grid computation → Dependent view');
    await expect(parameters.getByTestId('workbook-parameter-plan')).not.toContainText('Independent computation');
    const initial = await bookState(page), sourceId = initial.namedParameters[0].id;
    await parameters.getByLabel('Named parameter value', { exact: true }).fill('65');
    await parameters.getByRole('button', { name: 'Apply parameter', exact: true }).click();
    expect((await bookState(page)).stages[1].blocks[1].compute.runHistory ?? []).toHaveLength(0);
    await parameters.getByTestId('workbook-run-affected').click();
    await expect.poll(async () => (await bookState(page)).stages[1].blocks[1].compute.runHistory?.length ?? 0).toBe(1);
    const ran = await bookState(page);
    expect(ran.stages[1].blocks[1].compute.runHistory[0].status).toBe('ok');
    expect(ran.stages[1].blocks[1].compute.runHistory[0].params.paramResolution).toBe(65);
    expect(ran.stages[1].blocks[0].compute.runHistory ?? []).toHaveLength(0);
    await expect.poll(async () => (await bookState(page)).dependencies.find((edge: any) => edge.id === 'view-edge').source.sourceHash ?? '').toMatch(/^sha256:/);
    const retainedDependencies = (await bookState(page)).dependencies;
    await page.getByTestId('projects-toggle').click(); const projects = page.getByTestId('project-explorer-panel');
    await projects.getByTestId('project-title').fill('Named parameter investigation'); await projects.getByTestId('project-save').click();
    await projects.getByTestId('project-save-active-workbook').click(); await expect(projects.getByTestId('project-message')).toContainText('to this Project');
    const bundle = await download(ctx, () => projects.getByTestId('project-export-resources').click(), 'named-parameters.json');
    const savedId = bundle.project.workbooks[0].id;
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await page.getByTestId('projects-toggle').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-workbook-${savedId}`).click();
    await openWorkbook(page); const reopened = await bookState(page);
    expect(reopened.namedParameters[0]).toMatchObject({ id: sourceId, value: 65 }); expect(reopened.dependencies).toEqual(retainedDependencies);
    const panel = page.getByTestId('workbook-named-parameters'); await panel.locator('summary').click(); await panel.getByLabel('Named parameter', { exact: true }).selectOption(sourceId);
    await panel.getByRole('button', { name: 'Remove named parameter', exact: true }).click();
    await page.getByTestId('workbook-view-document').click(); await expect(page.getByTestId('workbook-document-block-consumer')).toContainText('missing');
  } finally { await closeSurfaceApp(ctx); }
});

test('NOTE04 and WB05 retain exact result provenance and bounded claims in Document and Geometry Claims views', async () => {
  test.setTimeout(300_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    const collection = JSON.parse(readFileSync(resolve('renderer/src/projects/examples/samsung-projects.json'), 'utf8'));
    const item = collection.projects.find((entry: any) => (entry.project ?? entry).metadata.title === 'Catenoid'), sourceId = (item.project ?? item).workspace.entries[0].expected.id;
    await page.getByTestId('projects-toggle').click(); const projects = page.getByTestId('project-explorer-panel');
    await projects.getByTestId('project-import-file').setInputFiles({ name: 'catenoid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(item)) });
    await projects.getByTestId('project-import-open').click(); await projects.getByTestId(`project-open-analysis-${sourceId}`).click();
    const workflow = page.getByTestId('project-saved-mesh-workflow'); await workflow.getByTestId('project-analysis-studies').locator('summary').click(); await workflow.getByTestId('project-resolution-run').click();
    await expect(workflow.getByTestId('project-saved-mesh-message')).toContainText('Three resolution studies', { timeout: 60_000 });
    const report = await download(ctx, () => workflow.getByTestId('project-resolution-export-json').click(), 'evidence-resolution.json');
    const result = report.runs[1].savedResult;
    await page.getByTestId('projects-toggle').click(); await projects.getByTestId('project-save').click(); await projects.getByRole('button', { name: 'Close project explorer' }).click();
    await openWorkbook(page); await page.getByRole('button', { name: 'Project reference', exact: true }).click();
    const cell = page.getByTestId('workbook-project-reference-cell').last(); await cell.getByTestId('workbook-project-reference-target').selectOption(`r:${result.resultId}`); await cell.getByRole('button', { name: 'Link selection', exact: true }).click();
    const provenance = cell.getByTestId('workbook-provenance'); await provenance.locator('summary').click();
    await expect(provenance).toContainText('Authority: numerical'); await expect(provenance).toContainText(result.provenance.engine.name); await expect(provenance).toContainText('Project relations');
    await expect(provenance.getByTestId('workbook-artifact-availability')).toContainText('no artifact sidecars');
    await page.getByRole('button', { name: 'Assert', exact: true }).click();
    await page.getByTestId('workbook-view-document').click(); const claim = page.getByTestId('workbook-evidence-claim').first();
    await claim.getByRole('button', { name: 'Write evidence claim', exact: true }).click(); await claim.getByLabel('Evidence claim text', { exact: true }).fill('Saved mean curvature lies in the declared interval.');
    await claim.getByLabel('Claim evidence', { exact: true }).selectOption(`r:${result.resultId}`); await claim.getByRole('button', { name: 'Cite evidence', exact: true }).click();
    await expect(claim.getByTestId('workbook-claim-status')).toContainText('unverified');
    await claim.getByText('Bounded scalar checker', { exact: true }).click(); await claim.getByLabel('Checker citation', { exact: true }).selectOption('0'); await claim.getByLabel('Checker field', { exact: true }).selectOption('mean.avg');
    await claim.getByLabel('Checker minimum', { exact: true }).fill('-100'); await claim.getByLabel('Checker maximum', { exact: true }).fill('100'); await claim.getByRole('button', { name: 'Check bounded scalar', exact: true }).click();
    await expect(claim.getByTestId('workbook-claim-status')).toContainText('supported');
    await claim.getByLabel('Checker minimum', { exact: true }).fill('100'); await claim.getByLabel('Checker maximum', { exact: true }).fill('101'); await claim.getByRole('button', { name: 'Check bounded scalar', exact: true }).click();
    await expect(claim.getByTestId('workbook-claim-status')).toContainText('contradicted');
    await claim.getByLabel('Checker minimum', { exact: true }).fill('-100'); await claim.getByLabel('Checker maximum', { exact: true }).fill('100'); await claim.getByRole('button', { name: 'Check bounded scalar', exact: true }).click();
    await page.getByTestId('projects-toggle').click(); await projects.getByTestId('project-save-active-workbook').click(); await expect(projects.getByTestId('project-message')).toContainText('to this Project');
    const bundle = await download(ctx, () => projects.getByTestId('project-export-resources').click(), 'evidence-workbook.json'); const workbookId = bundle.project.workbooks[0].id;
    await projects.getByRole('button', { name: 'Close project explorer' }).click();
    await openWorkbook(page); await page.getByTestId('workbook-view-document').click();
    const markdown = await download(ctx, () => page.getByRole('button', { name: 'Export Markdown', exact: true }).click(), 'claim.md');
    expect(markdown).toContain('Status at export: supported'); expect(markdown).toContain(result.resultId); expect(markdown).toContain('Authority: numerical');
    await page.evaluate(() => { window.open = () => null; });
    const html = await download(ctx, () => page.getByRole('button', { name: 'Export PDF', exact: true }).click(), 'claim.html');
    expect(html).toContain('Status at export: supported'); expect(html).toContain('Bounded checker:');
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await page.getByTestId('projects-toggle').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-saved-${bundle.project.identity.id}`).click();
    await page.getByTestId('projects-toggle').click(); await page.getByTestId('project-explorer-panel').getByTestId(`project-open-workbook-${workbookId}`).click(); await openWorkbook(page); await page.getByTestId('workbook-view-document').click();
    await expect(page.getByTestId('workbook-claim-status').first()).toContainText('supported');
    const historical = page.getByTestId('workbook-provenance').first(); await historical.locator('summary').click(); await expect(historical).toContainText(result.resultId);
    await page.getByRole('button', { name: 'Geometry', exact: true }).first().click();
    const claimsTab = page.getByRole('button', { name: 'Claims', exact: true }).first(); await claimsTab.click();
    await expect(page.getByTestId('geometry-workbook-evidence-claims')).toContainText('supported'); await expect(page.getByTestId('geometry-workbook-evidence-claims')).toContainText('Saved mean curvature');
    await page.getByTestId('geometry-workbook-evidence-claims').getByRole('button', { name: 'Open Workbook claim', exact: true }).click();
    await expect(page.getByTestId('workbook-evidence-claim').first()).toContainText('supported');
    await page.screenshot({ path: test.info().outputPath('workbook-evidence.png') });
  } finally { await closeSurfaceApp(ctx); }
});
