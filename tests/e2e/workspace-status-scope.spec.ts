import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('independent Graphs, Topology and Complex footers do not inherit retained mesh state', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx=await launchSurfaceApp({ MATH3D_GPU_MODE:'software', MATH3D_SKIP_AUTOSAVE_RECOVERY:'1' });
    const {page}=ctx;await resetSurfaceAppState(page);
    const footer=page.getByTestId('app-status-bar');
    await page.getByTestId('workspace-nav-mesh').click();
    await expect(footer).toContainText('Mesh viewer');
    await expect(footer).toContainText('Box');
    await expect(footer).toContainText('type mesh');
    await expect(footer).toContainText(/\d[\d,]* vertices \/ \d[\d,]* faces/);
    // Real UI navigation retains the existing 3D scene. It must not certify that
    // scene's mesh diagnostics as Graph/Topology/analytic Complex analysis.
    await page.getByTestId('workspace-nav-graphs').click();
    await expect(footer).toContainText('Cartesian');
    await expect(footer).toContainText(/document r\d+/);
    for(const stale of ['Box','type mesh','vertices','camera','analysis ready']) await expect(footer).not.toContainText(stale);
    await page.getByTestId('workspace-nav-topology').click();
    await expect(footer).toContainText('Topology quotient module');
    for(const stale of ['Box','type mesh','vertices','camera','analysis ready']) await expect(footer).not.toContainText(stale);
    // Graphs/Topology are independent views and must not change the Box scene.
    await page.getByTestId('workspace-nav-mesh').click();
    await expect(footer).toContainText('Box');
    await expect(footer).toContainText('type mesh');
    await page.getByTestId('workspace-nav-complex_analysis').click();
    // The 3D Complex map intentionally generates/selects its own mesh before
    // entering the analytic Explorer. Capture that real source boundary.
    await expect(footer).toContainText('Complex viewer');
    await expect(footer).toContainText('Complex Map Sweep');
    await expect(footer).toContainText(/\d[\d,]* vertices \/ \d[\d,]* faces/);
    const complexMeshCounts=(await footer.innerText()).match(/\d[\d,]* vertices \/ \d[\d,]* faces/)![0];
    await page.getByRole('button',{name:'Function Explorer',exact:true}).click();
    await expect(footer).toContainText('Complex Function Explorer');
    for(const stale of ['Box','Complex Map Sweep','type mesh','vertices','camera','analysis ready']) await expect(footer).not.toContainText(stale);
    await page.getByTestId('workspace-nav-mesh').click();
    await expect(footer).toContainText('Mesh viewer');
    await expect(footer).toContainText('Complex Map Sweep');
    await expect(footer).toContainText(complexMeshCounts);
    await expect(footer).toContainText('type mesh');
    await expect(footer).toContainText(/\d[\d,]* vertices \/ \d[\d,]* faces/);
  } finally {await closeSurfaceApp(ctx);}
});
