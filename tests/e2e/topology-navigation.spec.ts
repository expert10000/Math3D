import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('Topology guide and representation controls preserve the canonical Torus source', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-topology').click();
    await page.getByTestId('topology-preset-card-torus_square').click();
    const nav = page.getByRole('region', { name: 'Topology navigation', exact: true });
    const guide = nav.getByRole('group', { name: 'Construction guide', exact: true });
    const views = nav.getByRole('group', { name: 'Representation views', exact: true });
    await expect(guide).toContainText('they do not certify completed checks');
    await expect(nav.getByTestId('topology-navigation-source')).toContainText('Topic: Euler');
    await expect(nav.getByTestId('topology-navigation-source')).toContainText(/Source:.*Torus/);
    await views.getByRole('button', { name: 'Quotient Structure View', exact: true }).click();
    const counts = page.getByTestId('topology-count-canonical');
    await expect(counts).toContainText('V 1, E 2, F 1; χ = 0');
    const canonicalCounts = await counts.innerText();
    const provenance = page.getByTestId('topology-source-provenance');
    const sourceText = await provenance.innerText();
    const sourceHash = await provenance.locator('[title]').first().getAttribute('title');
    expect(sourceHash).toBeTruthy();
    const canonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(canonicalHash).toBeTruthy();
    for (const name of ['Diagram View', 'Complex View', 'Algebra View', 'Realization View', 'Quotient Structure View']) {
      const button = views.getByRole('button', { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(views.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(guide.locator('[aria-current="step"]')).toHaveCount(1);
      await expect(counts).toHaveText(canonicalCounts);
      await expect(provenance).toHaveText(sourceText, { useInnerText: true });
      await expect(provenance.locator('[title]').first()).toHaveAttribute('title', sourceHash!);
      await expect(page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', canonicalHash!);
      await expect(page.getByTestId('topology-count-display')).toContainText('Display geometry only');
    }
    await guide.getByRole('button', { name: '1. Diagram', exact: true }).click();
    await expect(views.getByRole('button', { name: 'Diagram View', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(counts).toHaveText(canonicalCounts);
    await expect(provenance.locator('[title]').first()).toHaveAttribute('title', sourceHash!);
    await page.screenshot({ path: test.info().outputPath('topology-navigation.png'), fullPage: true });
  } finally {
    await closeSurfaceApp(ctx);
  }
});
