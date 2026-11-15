import { expect, test } from '@playwright/test';
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from './helpers/surfaceAppHarness';

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
    const { page } = ctx;
    await page.getByTestId('topology-preset-card-torus_square').click();
    const nav = page.getByRole('group', { name: 'Representation views' });
    await nav.getByRole('button', { name: 'Diagram View' }).click();
    const toolbar = page.getByTestId('topology-diagram-toolbar');
    const svg = toolbar.locator('xpath=following-sibling::svg[1]');
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
    await svg.click({ position: { x: 260, y: 175 } });
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
