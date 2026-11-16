import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('Topology Algebra summary and provenance disclosure preserve exact source identity', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-topology').click();
    await page.getByTestId('topology-preset-card-torus_square').click();
    const source = page.getByTestId('topology-source-provenance');
    const sourceHash = await source.locator('[title]').first().getAttribute('title');
    const canonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(sourceHash).toBeTruthy();
    expect(canonicalHash).toBeTruthy();
    await page.getByRole('group', { name: 'Representation views' }).getByRole('button', { name: 'Algebra View' }).click();
    const algebra = page.getByTestId('topology-algebra-view');
    const summary = algebra.getByTestId('topology-algebra-summary');
    const details = algebra.getByTestId('topology-algebra-provenance-details');
    await expect(summary).toContainText('Canonical cell basis');
    await expect(summary).toContainText('1 zero-cells · 2 one-cells · 1 two-cells');
    await expect(summary).toContainText('Chain condition');
    await expect(algebra.getByTestId('topology-algebra-eligibility')).toBeVisible();
    await expect(details).not.toHaveAttribute('open', '');
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details).toContainText('Source structural hash');
    await expect(details).toContainText('Canonical complex hash');
    await expect(details).toContainText('Matrix artifact');
    await expect(source.locator('[title]').first()).toHaveAttribute('title', sourceHash!);
    await expect(page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', canonicalHash!);
    await page.screenshot({ path: test.info().outputPath('topology-algebra-summary.png'), fullPage: true });
  } finally {
    await closeSurfaceApp(ctx);
  }
});
