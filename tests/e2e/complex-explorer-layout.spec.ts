import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('Complex Explorer allocates plot and Inspector space at native workbench widths', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-complex_analysis').click();
    await page.getByRole('button', { name: 'Function Explorer', exact: true }).click();
    const layout = page.getByTestId('complex-explorer-layout');
    const plots = page.getByTestId('complex-explorer-plots');
    const inspector = page.getByTestId('complex-explorer-inspector');
    for (const width of [1600, 1100, 800]) {
      await resizeSurfaceAppWindow(ctx, width, 850);
      for (const name of ['2-pane', 'Focus Z', '3-pane']) {
        const button = layout.getByRole('button', { name, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        // Exercise a real three-pane view as well as the domain layout.
        await layout.getByRole('button', { name: name === '3-pane' ? 'Path' : 'Domain', exact: true }).click();
        await expect(plots.locator('#svgZ')).toBeVisible();
        await expect(plots.locator('#svgW')).toBeVisible();
        await expect.poll(async () => {
          const outer = await layout.boundingBox();
          const p = await plots.boundingBox();
          const i = await inspector.boundingBox();
          if (!outer || !p || !i) return false;
          const fits = [p, i].every(b => b.x >= outer.x - 1 && b.x + b.width <= outer.x + outer.width + 1);
          const separate = i.y >= p.y + p.height - 1 || i.x >= p.x + p.width - 1;
          const plotBounds = await plots.locator('#svgZ, #svgW').evaluateAll(nodes => nodes.map(n => {
            const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width };
          }));
          return fits && separate && plotBounds.every(r => r.width > 50 && r.x >= p.x - 1 && r.right <= p.x + p.width + 1);
        }).toBe(true);
      }
      await page.screenshot({ path: test.info().outputPath(`complex-layout-${width}.png`), fullPage: true });
    }
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test('Complex Setup and Gallery dock controls fit and remain keyboard reachable at 800 px', async () => {
  test.setTimeout(150_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-complex_analysis').click();
    await page.getByRole('button', { name: 'Function Explorer', exact: true }).click();
    const dock = page.getByTestId('complex-explorer-dock-content');
    const setup = dock.getByTestId('complex-dock-setup');
    const gallery = dock.getByTestId('complex-dock-gallery');
    for (const width of [800, 1100, 1600]) {
      await resizeSurfaceAppWindow(ctx, width, 850);
      await setup.focus();
      await page.keyboard.press('Space');
      await expect(setup).toHaveAttribute('aria-pressed', 'true');
      await expect(dock.getByRole('textbox', { name: 'Complex function expression' })).toBeVisible();
      await expect.poll(() => dock.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll('input[type="number"], input[type="text"], select, button')]
          .filter((control) => control.getClientRects().length > 0);
        return controls.every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        });
      })).toBe(true);
      if (width === 800)
        await page.screenshot({ path: test.info().outputPath('complex-dock-setup-800.png'), fullPage: true });
      await gallery.focus();
      await page.keyboard.press('Enter');
      await expect(gallery).toHaveAttribute('aria-pressed', 'true');
      await expect(dock.getByText('Riemann Surface Gallery')).toBeVisible();
      await expect.poll(() => dock.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll('.complex-explorer-gallery button')]
          .every((button) => button.getBoundingClientRect().right <= bounds.right + 1);
      })).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`complex-dock-${width}.png`), fullPage: true });
    }
  } finally {
    await closeSurfaceApp(ctx);
  }
});
