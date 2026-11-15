import { readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

const bootTopology = async () => {
  const ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
  await resetSurfaceAppState(ctx.page);
  await ctx.page.getByTestId('workspace-nav-topology').click();
  return ctx;
};

test('TOP-05 edit: add a real diagram vertex, undo and redo without losing source identity', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await bootTopology();
    await resizeSurfaceAppWindow(ctx, 1440, 1000);
    const { page } = ctx;
    await page.getByTestId('topology-preset-card-torus_square').click();
    const nav = page.getByRole('group', { name: 'Representation views' });
    await nav.getByRole('button', { name: 'Diagram View' }).click();
    const toolbar = page.getByTestId('topology-diagram-toolbar');
    const svg = toolbar.locator('..').locator('svg').first();
    await expect(svg).toBeVisible();
    // SVG React keys are not DOM attributes: select vertex circles by the stable
    // diagram group structure and compare counts, not React implementation keys.
    const circles = svg.locator('g:has(> circle) > circle');
    const initialCount = await circles.count();
    expect(initialCount).toBeGreaterThanOrEqual(4);
    const initialSourceHash = await page.getByTestId('topology-source-provenance').locator('[title]').first().getAttribute('title');
    const initialCanonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(initialSourceHash).toBeTruthy();
    expect(initialCanonicalHash).toBeTruthy();

    await toolbar.getByRole('button', { name: 'Add Vertex' }).click();
    await svg.scrollIntoViewIfNeeded();
    await svg.click({ position: { x: 140, y: 115 } });
    await expect(circles).toHaveCount(initialCount + 1);
    const undo = toolbar.getByTestId('topology-source-undo');
    const redo = toolbar.getByTestId('topology-source-redo');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(circles).toHaveCount(initialCount);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(circles).toHaveCount(initialCount + 1);
    await undo.click();
    await expect(circles).toHaveCount(initialCount);
    await nav.getByRole('button', { name: 'Quotient Structure View' }).click();
    await expect(page.getByTestId('topology-count-canonical')).toContainText('V 1, E 2, F 1; χ = 0');
    await expect(page.getByTestId('topology-source-provenance').locator('[title]').first()).toHaveAttribute('title', initialSourceHash!);
    await expect(page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', initialCanonicalHash!);
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test('TOP-05 presets: Torus, Mobius and Klein retain distinct source and canonical diagnostics', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await bootTopology();
    const { page } = ctx;
    const cases = [
      { id: 'torus_square', name: /Torus/i, euler: 'χ = 0' },
      { id: 'mobius_from_rectangle', name: /Möbius|Mobius/i, euler: 'χ = 0' },
      { id: 'klein_bottle_square', name: /Klein/i, euler: 'χ = 0' },
    ] as const;
    const hashes = new Set<string>();
    for (const item of cases) {
      await page.getByTestId(`topology-preset-card-${item.id}`).click();
      await expect(page.getByTestId('topology-navigation-source')).toContainText(item.name);
      await expect(page.getByTestId('topology-count-canonical')).toContainText(item.euler);
      const sourceHash = await page.getByTestId('topology-source-provenance').locator('[title]').first().getAttribute('title');
      const canonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
      expect(sourceHash).toBeTruthy();
      expect(canonicalHash).toBeTruthy();
      hashes.add(sourceHash!);
      await page.getByRole('group', { name: 'Representation views' }).getByRole('button', { name: 'Algebra View' }).click();
      await expect(page.getByTestId('topology-algebra-eligibility')).toBeVisible();
      await page.getByRole('group', { name: 'Representation views' }).getByRole('button', { name: 'Diagram View' }).click();
    }
    expect(hashes.size).toBe(3);
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test('TOP-05 native cold reopen: file replay, identities and source/canonical provenance survive process restart', async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  let profileDir: string | null = null;
  try {
    ctx = await bootTopology();
    profileDir = ctx.profileDir;
    const savedPath = path.join(profileDir, 'torus-qualification.math3d-topology');
    await ctx.page.getByTestId('topology-preset-card-torus_square').click();
    const originalSourceHash = await ctx.page.getByTestId('topology-source-provenance').locator('[title]').first().getAttribute('title');
    const originalCanonicalHash = await ctx.page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(originalSourceHash).toBeTruthy();
    expect(originalCanonicalHash).toBeTruthy();

    // Keep the production IPC save path: only replace the OS file-picker response.
    await ctx.app.evaluate(({ dialog }, filePath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath }),
      });
    }, savedPath);
    await ctx.page.getByTestId('topology-document-persistence').getByRole('button', { name: 'Save .math3d-topology' }).click();
    await expect(ctx.page.getByTestId('topology-document-audit')).toContainText('v3');
    await expect.poll(() => existsSync(savedPath)).toBe(true);
    const file = JSON.parse(readFileSync(savedPath, 'utf8'));
    expect(file.payload.persistence.document.identity.structuralHash).toBeTruthy();
    // File v3 canonicalHash is SHA-256; the UI title uses its separate fnv1a32 view identifier.
    expect(file.payload.persistence.canonicalHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const savedCanonicalHash = file.payload.persistence.canonicalHash;
    const identity = file.payload.persistence.document.identity;

    // Process teardown, not page.reload. Retain only this isolated temporary profile.
    await ctx.app.close();
    ctx = null;
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' }, profileDir);
    await ctx.page.getByTestId('workspace-nav-topology').click();
    await ctx.app.evaluate(({ dialog }, filePath) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [filePath] }),
      });
    }, savedPath);
    await ctx.page.getByTestId('topology-document-persistence').getByRole('button', { name: 'Load .math3d-topology' }).click();
    await expect(ctx.page.getByTestId('topology-document-audit')).toContainText(/v3|replay/i);
    await expect(ctx.page.getByTestId('topology-count-canonical')).toContainText('V 1, E 2, F 1; χ = 0');
    await expect(ctx.page.getByTestId('topology-source-provenance').locator('[title]').first()).toHaveAttribute('title', originalSourceHash!);
    await expect(ctx.page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', originalCanonicalHash!);
    await expect(ctx.page.getByTestId('topology-persistence-status')).toContainText('Replay:');
    const afterFile = JSON.parse(readFileSync(savedPath, 'utf8'));
    expect(afterFile.payload.persistence.document.identity).toEqual(identity);
    expect(afterFile.payload.persistence.canonicalHash).toBe(savedCanonicalHash);
  } finally {
    if (ctx) await closeSurfaceApp(ctx);
    else if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  }
});

test('TOP-05 Mesh workbench handoff: changed source cannot silently stay current', async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_GPU_MODE: 'software', MATH3D_SKIP_AUTOSAVE_RECOVERY: '1' });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await page.getByTestId('workspace-nav-mesh').click();
    await expect(page.getByTestId('app-status-bar')).toContainText('Box');
    const meshToolsBefore = page.getByRole('button', { name: 'Mesh tools', exact: true });
    for (const button of await meshToolsBefore.all()) if (await button.isVisible()) { await button.click(); break; }
    const meshCardBefore = page.getByTestId('mesh-workspace-operation-registry').first();
    await expect(meshCardBefore).toBeVisible();
    await meshCardBefore.getByTestId('mesh-workspace-operation-registry-row-smooth').click();
    const runBefore = meshCardBefore.getByTestId('mesh-workspace-operation-registry-run-smooth');
    const initialMeshGate = {
      enabled: await runBefore.isEnabled(),
      workerText: (await meshCardBefore.innerText()).slice(0, 100),
    };
    await test.info().attach('top05-e6-initial-mesh-gate.json', {
      body: Buffer.from(JSON.stringify(initialMeshGate, null, 2)),
      contentType: 'application/json',
    });
    await page.getByTestId('workspace-nav-topology').click();
    const interop = page.getByTestId('topology-interoperability-panel');
    const analyze = interop.getByTestId('topology-analyze-current-mesh');
    await expect(analyze).toBeEnabled();
    await analyze.click();
    const status = interop.getByTestId('topology-mesh-snapshot-status');
    await expect(status).toContainText('CURRENT');
    const captured = await status.innerText();
    expect(captured).toContain('Snapshot hash:');

    await page.getByTestId('workspace-nav-mesh').click();
    const tools = page.getByRole('button', { name: 'Mesh tools', exact: true });
    for (const button of await tools.all()) if (await button.isVisible()) { await button.click(); break; }
    const card = page.getByTestId('mesh-workspace-operation-registry').first();
    await expect(card).toBeVisible();
    await card.getByTestId('mesh-workspace-operation-registry-row-smooth').click();
    await card.getByTestId('mesh-workspace-operation-registry-smooth-output-replace').check();
    await card.getByTestId('mesh-workspace-operation-registry-smooth-iterations').fill('2');
    const run = card.getByTestId('mesh-workspace-operation-registry-run-smooth');
    try {
      await expect(run).toBeEnabled({ timeout: 45_000 });
    } catch (error) {
      // Diagnostic-only: preserve the failure and the real worker/mesh gate.
      const gate = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="mesh-workspace-operation-registry"]');
        const runButton = card?.querySelector('[data-testid="mesh-workspace-operation-registry-run-smooth"]') as HTMLButtonElement | null;
        const workerStatus = Array.from(document.querySelectorAll('[data-testid="worker-status"]')).map((el) => (el as HTMLElement).innerText);
        return {
          runDisabled: runButton?.disabled ?? null,
          workerStatus,
          appStatusBar: (document.querySelector('[data-testid="app-status-bar"]') as HTMLElement | null)?.innerText ?? null,
          meshOperationsHeading: (card as HTMLElement | null)?.innerText.slice(0, 900) ?? null,
          activeWorkbench: Array.from(document.querySelectorAll('[data-testid^="workspace-nav-"]'))
            .filter((el) => el.getAttribute('aria-pressed') === 'true')
            .map((el) => el.getAttribute('data-testid')),
        };
      });
      const evidence = { ...gate, initialMeshGate };
      console.log('TOP05-E6 Mesh gate evidence:', JSON.stringify(evidence));
      await test.info().attach('top05-e6-mesh-gate.json', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
      throw error;
    }
    await run.click();
    await expect(card.getByTestId('mesh-workspace-operation-registry-last-result')).toContainText(/success|warning/, { timeout: 90_000 });

    await page.getByTestId('workspace-nav-topology').click();
    await expect(status).toContainText(/STALE|SOURCE-UNAVAILABLE/);
    await expect(status).toContainText('result stale');
    await expect(analyze).toBeEnabled();
    await analyze.click();
    await expect(status).toContainText('CURRENT');
    await expect(status).toContainText('result current');
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test('TOP-05 non-manifold: Dunce cap withholds formal surface classification without inventing a manifold', async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await bootTopology();
    const { page } = ctx;
    await page.getByTestId('topology-preset-card-dunce_cap').click();
    const provenance = page.getByTestId('topology-source-provenance');
    const sourceHash = await provenance.locator('[title]').first().getAttribute('title');
    const canonicalHash = await page.getByTestId('topology-canonical-provenance').getAttribute('title');
    expect(sourceHash).toBeTruthy();
    expect(canonicalHash).toBeTruthy();
    const views = page.getByRole('group', { name: 'Representation views' });
    await views.getByRole('button', { name: 'Algebra View' }).click();
    const classification = page.getByTestId('topology-surface-classification');
    await expect(classification).toContainText('WITHHELD');
    await expect(page.getByTestId('topology-surface-classification-label')).toContainText('No formal surface name');
    await expect(classification.getByText(/WITHHELD:/).first()).toBeVisible();
    await expect(provenance.locator('[title]').first()).toHaveAttribute('title', sourceHash!);
    await expect(page.getByTestId('topology-canonical-provenance')).toHaveAttribute('title', canonicalHash!);
  } finally {
    await closeSurfaceApp(ctx);
  }
});
