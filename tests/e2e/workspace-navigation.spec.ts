import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const SECTION_LABELS = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;
type SectionLabel = (typeof SECTION_LABELS)[number];

const findSectionButton = async (page: Page, label: SectionLabel): Promise<Locator | null> => {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const pressedAttr = await button.getAttribute("aria-pressed");
    if (pressedAttr == null) continue;
    return button;
  }
  return null;
};

const getAvailableSectionLabels = async (page: Page): Promise<SectionLabel[]> => {
  const available: SectionLabel[] = [];
  for (const label of SECTION_LABELS) {
    if (await findSectionButton(page, label)) available.push(label);
  }
  return available;
};

const getActiveSectionLabel = async (page: Page, labels: SectionLabel[]): Promise<SectionLabel | null> => {
  for (const label of labels) {
    const button = await findSectionButton(page, label);
    if (!button) continue;
    if ((await button.getAttribute("aria-pressed")) === "true") return label;
  }
  return null;
};

const selectSection = async (page: Page, labels: SectionLabel[], label: SectionLabel): Promise<void> => {
  const button = await findSectionButton(page, label);
  if (!button) throw new Error(`Section button not found: ${label}`);
  await button.click({ timeout: 5_000 });
  await expect.poll(async () => getActiveSectionLabel(page, labels)).toBe(label);
};

const clickVisibleButtonByName = async (page: Page, name: string): Promise<void> => {
  const buttons = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    await button.scrollIntoViewIfNeeded().catch(() => undefined);
    await button.click({ timeout: 5_000 });
    return;
  }
  throw new Error(`Visible button not found: ${name}`);
};

const settleRenderer = async (page: Page, delayMs = 250): Promise<void> => {
  await page.waitForTimeout(delayMs);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
};

const isWhiteScreen = async (page: Page): Promise<"blank" | "closed" | "ok"> => {
  if (page.isClosed()) return "closed";
  try {
    const blank = await page.evaluate(() => {
      const text = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
      const hasAppHeading = !!document.querySelector("h1");
      return !hasAppHeading && text.length < 8;
    });
    return blank ? "blank" : "ok";
  } catch (error) {
    const message = String(error);
    if (/closed|crash|Target page|browser has been closed/i.test(message)) return "closed";
    throw error;
  }
};

const wait = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs));

const isMath3dPageAlive = async (page: Page): Promise<boolean> => {
  if (page.isClosed()) return false;
  try {
    return await page.evaluate(() => {
      const hasHeading = Array.from(document.querySelectorAll("h1")).some((heading) =>
        /^math3d$/i.test(heading.textContent?.trim() ?? "")
      );
      const hasSurfacesNav = Array.from(document.querySelectorAll("button")).some((button) => {
        const text = (button.textContent ?? "").replace(/\s+/g, " ").trim();
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return text === "Surfaces" && rect.width > 0 && rect.height > 0 && style.display !== "none";
      });
      return hasHeading && hasSurfacesNav;
    });
  } catch {
    return false;
  }
};

const getLiveMath3dPage = async (ctx: LaunchedSurfaceApp, timeoutMs = 12_000): Promise<Page> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = ctx.app.windows();
    for (const page of [...pages].reverse()) {
      if (await isMath3dPageAlive(page)) {
        ctx.page = page;
        return page;
      }
    }
    await wait(250);
  }
  throw new Error("MATH3D page did not recover within timeout.");
};

const runWithWhiteScreenGuard = async (
  page: Page,
  label: string,
  action: () => Promise<void>,
  timeoutMs = 6_000
): Promise<void> => {
  let finished = false;
  let blankSince = 0;
  const startedAt = Date.now();
  const guard = (async () => {
    while (!finished) {
      await wait(250);
      if (Date.now() - startedAt > timeoutMs) throw new Error(`action timeout after ${timeoutMs}ms`);
      const screenState = await isWhiteScreen(page);
      if (screenState === "closed") {
        throw new Error(`page closed during ${label}`);
      }
      if (screenState === "blank") {
        blankSince ||= Date.now();
        if (Date.now() - blankSince >= 1_000) throw new Error(`white screen detected during ${label}`);
      } else {
        blankSince = 0;
      }
    }
  })();
  try {
    await Promise.race([action(), guard]);
  } finally {
    finished = true;
  }
};

const ensureComplexAnalysisControls = async (
  ctx: LaunchedSurfaceApp,
  labels: SectionLabel[]
): Promise<Page> => {
  const page = await getLiveMath3dPage(ctx);
  const functionExplorer = page.getByRole("button", { name: /^Function Explorer$/i }).first();
  if ((await functionExplorer.count()) > 0 && (await functionExplorer.isVisible().catch(() => false))) {
    return page;
  }
  await selectSection(page, labels, "Complex Analysis");
  return getLiveMath3dPage(ctx);
};

const buildAlternatingWalk = (start: SectionLabel, alternate: SectionLabel, steps: number): SectionLabel[] => {
  const walk: SectionLabel[] = [];
  let current = start;
  for (let i = 0; i < steps; i++) {
    const next = current === start ? alternate : start;
    walk.push(next);
    current = next;
  }
  return walk;
};

test.describe("Workspace navigation", () => {
  test("section navigation remains reliable across 300 clicks", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const labels = await getAvailableSectionLabels(ctx.page);
      expect(labels.length).toBeGreaterThanOrEqual(2);

      const start = await getActiveSectionLabel(ctx.page, labels);
      expect(start).toBeTruthy();
      const alternate = labels.find((label) => label !== start);
      expect(alternate).toBeTruthy();

      for (const label of buildAlternatingWalk(start as SectionLabel, alternate as SectionLabel, 300)) {
        try {
          await selectSection(await getLiveMath3dPage(ctx), labels, label);
        } catch (error) {
          try {
            await getLiveMath3dPage(ctx, 15_000);
          } catch {
            throw error;
          }
        }
      }

      await expect.poll(async () => getActiveSectionLabel(await getLiveMath3dPage(ctx), labels)).toBe(start);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("complex analysis tabs and topology navigation remain reliable across 300 actions", async () => {
    test.setTimeout(420_000);
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const labels = await getAvailableSectionLabels(ctx.page);
      for (const required of ["Surfaces", "Mesh", "Topology", "Complex Analysis"] as const) {
        expect(labels).toContain(required);
      }

      const actions: Array<{ name: string; run: () => Promise<void> }> = [
        {
          name: "Complex Analysis section",
          run: async () => selectSection(await getLiveMath3dPage(ctx!), labels, "Complex Analysis"),
        },
        {
          name: "Function Explorer tab",
          run: async () => clickVisibleButtonByName(await ensureComplexAnalysisControls(ctx!, labels), "Function Explorer"),
        },
        {
          name: "Branch Lab tab",
          run: async () => clickVisibleButtonByName(await ensureComplexAnalysisControls(ctx!, labels), "Branch Lab"),
        },
        {
          name: "Complex map tab",
          run: async () => clickVisibleButtonByName(await ensureComplexAnalysisControls(ctx!, labels), "Complex map"),
        },
        {
          name: "Topology section",
          run: async () => selectSection(await getLiveMath3dPage(ctx!), labels, "Topology"),
        },
        {
          name: "Complex Analysis section return",
          run: async () => selectSection(await getLiveMath3dPage(ctx!), labels, "Complex Analysis"),
        },
        {
          name: "Surfaces section",
          run: async () => selectSection(await getLiveMath3dPage(ctx!), labels, "Surfaces"),
        },
        {
          name: "Surfaces analysis panel",
          run: async () => {
            const page = await getLiveMath3dPage(ctx!);
            await selectSection(page, labels, "Surfaces");
            await clickVisibleButtonByName(page, "Analysis");
          },
        },
      ];

      for (let i = 0; i < 300; i += 1) {
        const action = actions[i % actions.length];
        try {
          await runWithWhiteScreenGuard(
            await getLiveMath3dPage(ctx),
            `${action.name} at action ${i + 1}/300`,
            action.run
          );
        } catch (error) {
          try {
            await getLiveMath3dPage(ctx, 15_000);
          } catch {
            throw new Error(`Action ${i + 1}/300 failed during ${action.name}: ${String(error)}`);
          }
        }
        const livePage = await getLiveMath3dPage(ctx);
        try {
          await runWithWhiteScreenGuard(livePage, `settle after ${action.name} at action ${i + 1}/300`, () =>
            settleRenderer(livePage)
          );
        } catch (error) {
          try {
            await getLiveMath3dPage(ctx, 15_000);
          } catch {
            throw new Error(`Settle ${i + 1}/300 failed after ${action.name}: ${String(error)}`);
          }
        }
        if (i % 25 === 24) {
          await expect((await getLiveMath3dPage(ctx)).getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
        }
      }

      await expect((await getLiveMath3dPage(ctx)).getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  for (const depth of [1, 2, 5, 10] as const) {
    test(`back/forward supports history depth ${depth}`, async () => {
      let ctx: LaunchedSurfaceApp | null = null;
      try {
        ctx = await launchSurfaceApp();
        await resetSurfaceAppState(ctx.page);

        const labels = await getAvailableSectionLabels(ctx.page);
        expect(labels.length).toBeGreaterThanOrEqual(2);

        const back = ctx.page.getByRole("button", { name: "Workspace back", exact: true }).first();
        const forward = ctx.page.getByRole("button", { name: "Workspace forward", exact: true }).first();
        await expect(back).toBeDisabled();
        await expect(forward).toBeDisabled();

        const start = await getActiveSectionLabel(ctx.page, labels);
        expect(start).toBeTruthy();
        const alternate = labels.find((label) => label !== start);
        expect(alternate).toBeTruthy();
        const walk = buildAlternatingWalk(start as SectionLabel, alternate as SectionLabel, depth);
        const visited: SectionLabel[] = [start as SectionLabel];
        for (const label of walk) {
          await selectSection(ctx.page, labels, label);
          visited.push(label);
        }

        await expect(back).toBeEnabled();
        await expect(forward).toBeDisabled();

        for (let idx = visited.length - 2; idx >= 0; idx--) {
          await back.click();
          await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(visited[idx]);
        }
        await expect(back).toBeDisabled();
        await expect(forward).toBeEnabled();

        for (let idx = 1; idx < visited.length; idx++) {
          await forward.click();
          await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(visited[idx]);
        }
        await expect(forward).toBeDisabled();
      } finally {
        await closeSurfaceApp(ctx);
      }
    });
  }

  test("new navigation after back clears forward history", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const labels = await getAvailableSectionLabels(ctx.page);
      expect(labels.length).toBeGreaterThanOrEqual(2);

      const back = ctx.page.getByRole("button", { name: "Workspace back", exact: true }).first();
      const forward = ctx.page.getByRole("button", { name: "Workspace forward", exact: true }).first();

      await expect(back).toBeDisabled();
      await expect(forward).toBeDisabled();

      const start = await getActiveSectionLabel(ctx.page, labels);
      expect(start).toBeTruthy();
      const target1 = labels.find((label) => label !== start);
      expect(target1).toBeTruthy();
      await selectSection(ctx.page, labels, target1 as SectionLabel);

      const target2 = labels.find((label) => label !== start && label !== target1);
      expect(target2).toBeTruthy();
      await selectSection(ctx.page, labels, target2 as SectionLabel);

      await expect(back).toBeEnabled();
      await expect(forward).toBeDisabled();

      await back.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target1 as SectionLabel);
      await expect(forward).toBeEnabled();

      const target3 = labels.find((label) => label !== target1);
      expect(target3).toBeTruthy();
      await selectSection(ctx.page, labels, target3 as SectionLabel);

      await expect(forward).toBeDisabled();
      await expect(back).toBeEnabled();

      await back.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target1 as SectionLabel);

      await forward.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target3 as SectionLabel);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
