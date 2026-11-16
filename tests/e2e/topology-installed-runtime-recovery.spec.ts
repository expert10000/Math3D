import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

test('TOP05-E8 installed Windows: worker-loss refusal, process recovery, and Topology file provenance', async () => {
  test.setTimeout(240_000);
  const exe = process.env.MATH3D_PACKAGED_APP_EXE;
  if (!exe || !existsSync(exe)) {
    throw new Error('A verified genuine installed executable is required (MATH3D_PACKAGED_APP_EXE). Do not substitute source Electron.');
  }
  let ctx: LaunchedSurfaceApp | null = null;
  let profile: string | null = null;
  try {
    // Deliberately fail worker launch through a nonexistent Python command;
    // do not change the product's capability gates or worker source files.
    ctx = await launchSurfaceApp({
      MATH3D_GPU_MODE: 'software',
      MATH3D_SKIP_AUTOSAVE_RECOVERY: '1',
      MATH3D_WORKER_MODE: 'python',
      MATH3D_PYTHON: path.join(path.dirname(exe), '__top05_nonexistent_python.exe'),
    });
    profile = ctx.profileDir;
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-mesh').click();
    const tools = page.getByRole('button', { name: 'Mesh tools', exact: true });
    for (const button of await tools.all()) if (await button.isVisible()) { await button.click(); break; }
    const card = page.getByTestId('mesh-workspace-operation-registry').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('blocked by worker', { timeout: 30000 });
    await card.getByTestId('mesh-workspace-operation-registry-row-smooth').click();
    await expect(card.getByTestId('mesh-workspace-operation-registry-run-smooth')).toBeDisabled();

    await page.getByTestId('workspace-nav-topology').click();
    await page.getByTestId('topology-preset-card-torus_square').click();
    const savedSourceHash = await page.getByTestId('topology-source-provenance').locator('[title]').first().getAttribute('title');
    const savedCanonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(savedSourceHash).toBeTruthy();
    expect(savedCanonicalHash).toBeTruthy();
    const filePath = path.join(profile, 'top05-installed-recovery.math3d-topology');
    await ctx.app.evaluate(({ dialog }, target) => {
      Object.defineProperty(dialog, 'showSaveDialog', { configurable: true, value: async () => ({ canceled: false, filePath: target }) });
    }, filePath);
    await page.getByTestId('topology-document-persistence').getByRole('button', { name: 'Save .math3d-topology' }).click();
    await expect.poll(() => existsSync(filePath)).toBe(true);
    const saved = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(saved.payload.persistence.canonicalHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const identity = saved.payload.persistence.document.identity;
    const canonicalHash = saved.payload.persistence.canonicalHash;
    await ctx.app.close();
    ctx = null;

    // Clean process restart, unchanged profile and actual installed executable,
    // with the deliberately failed worker override removed.
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' }, profile);
    await ctx.page.getByTestId('workspace-nav-mesh').click();
    const tools2 = ctx.page.getByRole('button', { name: 'Mesh tools', exact: true });
    for (const button of await tools2.all()) if (await button.isVisible()) { await button.click(); break; }
    const recoveredCard = ctx.page.getByTestId('mesh-workspace-operation-registry').first();
    await recoveredCard.getByTestId('mesh-workspace-operation-registry-row-smooth').click();
    await expect(recoveredCard.getByTestId('mesh-workspace-operation-registry-run-smooth')).toBeEnabled({ timeout: 45000 });

    await ctx.page.getByTestId('workspace-nav-topology').click();
    await ctx.app.evaluate(({ dialog }, target) => {
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => ({ canceled: false, filePaths: [target] }) });
    }, filePath);
    await ctx.page.getByTestId('topology-document-persistence').getByRole('button', { name: 'Load .math3d-topology' }).click();
    await expect(ctx.page.getByTestId('topology-document-audit')).toContainText(/v3|replay/i);
    await expect(ctx.page.getByTestId('topology-source-provenance').locator('[title]').first()).toHaveAttribute('title', savedSourceHash!);
    await expect(ctx.page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', savedCanonicalHash!);
    const persisted = ctx.page.getByTestId('topology-persistence-status');
    await expect(persisted).toContainText('Replay:');
    const after = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(after.payload.persistence.document.identity).toEqual(identity);
    expect(after.payload.persistence.canonicalHash).toBe(canonicalHash);
  } finally {
    if (ctx) await closeSurfaceApp(ctx);
    else if (profile) rmSync(profile, { recursive: true, force: true });
  }
});
