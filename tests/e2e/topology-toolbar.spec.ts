import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('Topology diagram toolbar preserves source and canonical state while switching tools', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-topology').click();
    await page.getByTestId('topology-preset-card-torus_square').click();
    await page.getByRole('group', { name: 'Representation views' }).getByRole('button', { name: 'Diagram View' }).click();

    const toolbar = page.getByRole('toolbar', { name: 'Diagram editing' });
    const tool = toolbar.getByRole('group', { name: 'Drawing tool' });
    const edit = toolbar.getByRole('group', { name: 'Diagram edit actions' });
    const history = toolbar.getByRole('group', { name: 'Diagram history' });
    await expect(toolbar).toBeVisible();
    await expect(tool.getByRole('button', { name: 'Select/Drag' })).toHaveAttribute('aria-pressed', 'true');
    await expect(edit.getByRole('button', { name: 'Remove Vertex' })).toBeDisabled();
    await expect(edit.getByRole('button', { name: 'Remove Edge' })).toBeDisabled();
    const counts = page.getByTestId('topology-count-canonical');
    await expect(counts).toContainText('V 1, E 2, F 1; χ = 0');
    const initialCounts = await counts.innerText();
    const sourceHash = await page.getByTestId('topology-source-provenance').locator('[title]').first().getAttribute('title');
    const canonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(sourceHash).toBeTruthy();
    expect(canonicalHash).toBeTruthy();

    for (const name of ['Add Vertex', 'Add Edge', 'Select/Drag']) {
      await tool.getByRole('button', { name, exact: true }).click();
      await expect(tool.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(tool.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(counts).toHaveText(initialCounts);
      await expect(page.getByTestId('topology-source-provenance').locator('[title]').first()).toHaveAttribute('title', sourceHash!);
      await expect(page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', canonicalHash!);
    }
    const boundary = toolbar.getByRole('checkbox', { name: 'Append new edges to face boundary' });
    const initialBoundary = await boundary.isChecked();
    await boundary.click();
    await expect(boundary).toBeChecked({ checked: !initialBoundary });
    await boundary.click();
    await expect(boundary).toBeChecked({ checked: initialBoundary });
    await expect(history.getByTestId('topology-source-undo')).toBeVisible();
    await expect(history.getByTestId('topology-source-redo')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('topology-toolbar.png'), fullPage: true });
  } finally {
    await closeSurfaceApp(ctx);
  }
});
