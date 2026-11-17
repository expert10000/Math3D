import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('basic Mesh forms keep source and output choices beside Run and preserve Smooth Undo', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-mesh').click();
    const tools = page.getByRole('button', { name: 'Mesh tools', exact: true });
    for (const button of await tools.all()) if (await button.isVisible()) { await button.click(); break; }
    const card = page.getByTestId('mesh-workspace-operation-registry').first();
    await expect(card).toBeVisible();
    const id = 'mesh-workspace-operation-registry';
    for (const operation of ['clean-normals', 'decimate', 'smooth']) {
      await card.getByTestId(`${id}-row-${operation}`).click();
      await expect(card.getByRole('group', { name: 'Source', exact: true })).toContainText('Box');
      await expect(card.getByRole('group', { name: 'Parameters', exact: true })).toBeVisible();
      const output = card.getByRole('group', { name: 'Output', exact: true });
      await output.getByLabel('Replace', { exact: true }).check();
      const run = card.getByRole('group', { name: 'Run', exact: true });
      await expect(run).toContainText('Source: Box');
      await expect(run).toContainText('Replace active mesh');
      await output.getByLabel('New object', { exact: true }).check();
      await expect(run).toContainText('New object (preserve source)');
    }
    await card.getByTestId(`${id}-smooth-iterations`).fill('2');
    const runSmooth = card.getByTestId(`${id}-run-smooth`);
    await expect(runSmooth).toBeEnabled({ timeout: 45_000 });
    await runSmooth.click();
    const result = card.getByTestId(`${id}-last-result`);
    await expect(result).toContainText('Smooth', { timeout: 90_000 });
    await expect(result).toContainText(/success|warning/);
    await expect(result).toContainText('Output: new-object');
    await expect(page.getByTestId('app-status-bar')).toContainText(/Box.*Smooth/);
    const undo = card.getByTestId(`${id}-undo-last-operation`);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByTestId('app-status-bar')).toContainText('Box');
    await expect(page.getByTestId('app-status-bar')).not.toContainText('Box (Smooth)');
    await page.screenshot({ path: test.info().outputPath('mesh-operation-form-after-undo.png'), fullPage: true });
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test('Boolean, implicit and CGAL forms expose the same sections and keyboard output choice', async () => {
  test.setTimeout(150_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-mesh').click();
    for (const button of await page.getByRole('button', { name: 'Mesh tools', exact: true }).all())
      if (await button.isVisible()) { await button.click(); break; }
    const card = page.getByTestId('mesh-workspace-operation-registry').first();
    const id = 'mesh-workspace-operation-registry';
    for (const operation of ['cgal-validate', 'cgal-repair', 'cgal-repair-validate', 'cgal-remesh', 'boolean-union', 'implicit-preview', 'implicit-mesh']) {
      const row = card.getByTestId(`${id}-row-${operation}`);
      await row.click();
      await expect(row).toHaveAttribute('aria-expanded', 'true');
      for (const section of ['Source', 'Parameters', 'Output', 'Run'])
        await expect(card.getByRole('group', { name: section, exact: true })).toBeVisible();
      const output = card.getByRole('group', { name: 'Output', exact: true });
      if (operation === 'cgal-validate' || operation === 'implicit-preview') {
        await expect(output).toContainText('Analysis only');
      } else if (operation === 'implicit-mesh') {
        await expect(output).toContainText('New object');
      } else {
        const replace = output.getByLabel('Replace', { exact: true });
        await replace.focus();
        await page.keyboard.press('Space');
        await expect(replace).toBeChecked();
        await expect(card.getByRole('group', { name: 'Run', exact: true })).toContainText('Replace active mesh');
        await output.getByLabel('New object', { exact: true }).check();
      }
    }
    await card.getByTestId(`${id}-row-implicit-preview`).click();
    await expect(card.getByRole('group', { name: 'Source', exact: true })
      .getByTestId(`${id}-open-implicit-sphere`)).toBeVisible();
    await expect(card.getByTestId(`${id}-run-implicit-preview`)).toBeDisabled();
  } finally {
    await closeSurfaceApp(ctx);
  }
});
