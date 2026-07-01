import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import {
  bytesToMiB,
  sampleProcessTreeSafely,
  summarizeProcessMemory,
  type ProcessMemorySample,
} from "./helpers/processMemory";

const repoRoot = path.resolve(__dirname, "..", "..");
const firstLaunchKey = "math3d.computeEngines.firstLaunchSeen";
const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;

type AreaName = "mesh" | "geometry";

type WhiteScreenEvent = {
  label: string;
  atMs: number;
  textLength: number;
  hasHeading: boolean;
};

type ActionResult = {
  area: AreaName;
  index: number;
  label: string;
  target: string;
  expectedSceneLabel: string;
  statusBar: string;
  sceneStats: string | null;
  matchedSceneState: boolean;
  loadMs: number;
  atMs: number;
  rssMiB: number;
  byRoleMiB: Record<string, number>;
};

type CardCandidate = {
  key: string;
  testId: string;
  label: string;
  disabled: boolean;
};

const positiveIntFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const actionDelayMs = positiveIntFromEnv("MATH3D_RELEASE_CHECK_ACTION_DELAY_MS", 5_000);
const actionsPerArea = positiveIntFromEnv("MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA", 12);
const sceneLoadTimeoutMs = positiveIntFromEnv("MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS", 30_000);

const compactBytesByRole = (bytesByRole: Record<string, number>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(bytesByRole)
      .sort(([, a], [, b]) => b - a)
      .map(([role, bytes]) => [role, Number(bytesToMiB(bytes).toFixed(1))])
  );

async function readWhiteScreenState(page: Page): Promise<{ white: boolean; textLength: number; hasHeading: boolean }> {
  if (page.isClosed()) return { white: true, textLength: 0, hasHeading: false };
  return page.evaluate(() => {
    const text = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const hasHeading = Array.from(document.querySelectorAll("h1")).some((heading) =>
      /^math3d$/i.test((heading.textContent ?? "").trim())
    );
    return {
      white: !hasHeading && text.length < 8,
      textLength: text.length,
      hasHeading,
    };
  });
}

async function waitAfterAction(
  page: Page,
  delayMs: number,
  label: string,
  startedAt: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<void> {
  const deadline = Date.now() + delayMs;
  let recordedBlank = false;
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    await page.waitForTimeout(Math.min(250, Math.max(0, remainingMs))).catch(() => undefined);
    const state = await readWhiteScreenState(page).catch(() => ({ white: true, textLength: 0, hasHeading: false }));
    if (state.white && !recordedBlank) {
      whiteScreenEvents.push({
        label,
        atMs: performance.now() - startedAt,
        textLength: state.textLength,
        hasHeading: state.hasHeading,
      });
      recordedBlank = true;
    }
  }
}

async function launchReleaseCheckApp(): Promise<{ app: ElectronApplication; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-release-check-"));
  const launchEnv: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
    MATH3D_E2E: "1",
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await launchRepoElectron({
    args: ["."],
    cwd: repoRoot,
    env: launchEnv,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, "1");
  }, firstLaunchKey);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  return { app, page, profileDir };
}

async function closeReleaseCheckApp(ctx: { app: ElectronApplication; profileDir: string } | null): Promise<void> {
  if (!ctx) return;
  await ctx.app.close().catch(() => undefined);
  rmSync(ctx.profileDir, { recursive: true, force: true });
}

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function findSectionButton(page: Page, label: string): Promise<Locator | null> {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    if ((await button.getAttribute("aria-pressed")) == null) continue;
    return button;
  }
  return null;
}

async function selectSection(page: Page, label: (typeof sectionLabels)[number]): Promise<void> {
  const button = await findSectionButton(page, label);
  if (!button) throw new Error(`Section button not found: ${label}`);
  await button.click();
  await page.waitForFunction(
    ({ expectedLabels, expectedLabel }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const candidate of expectedLabels) {
        const active = buttons.find((button) => {
          const text = (button.textContent ?? "").trim();
          return text === candidate && button.getAttribute("aria-pressed") === "true";
        });
        if (active) return candidate === expectedLabel;
      }
      return false;
    },
    { expectedLabels: [...sectionLabels], expectedLabel: label },
    { timeout: 15_000, polling: 25 }
  );
}

async function openMeshGallery(page: Page): Promise<void> {
  await selectSection(page, "Mesh");
  const meshFamily = await firstVisible(page.getByTestId("surface-family-mesh"));
  if (meshFamily) {
    await meshFamily.click();
  } else {
    const meshPresets = await firstVisible(page.getByRole("button", { name: "Mesh presets", exact: true }));
    await meshPresets?.click().catch(() => undefined);
  }
  await expect(page.getByTestId("mesh-preset-grid")).toBeVisible({ timeout: 15_000 });
}

async function openGeometryGallery(page: Page): Promise<void> {
  await selectSection(page, "Geometry");
  await expect(page.getByTestId("geometry-gallery")).toBeVisible({ timeout: 15_000 });
}

async function collectCards(page: Page, selector: string): Promise<CardCandidate[]> {
  return page.evaluate((cardSelector) => {
    const isVisible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    return Array.from(document.querySelectorAll(cardSelector))
      .filter(isVisible)
      .map((element, index) => {
        const key = `release-check-card-${Date.now()}-${index}`;
        element.setAttribute("data-release-check-card", key);
        const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        const testId = element.getAttribute("data-testid") ?? "";
        const title =
          element.querySelector(".gallery-scan-card-title")?.textContent?.replace(/\s+/g, " ").trim() ||
          element.getAttribute("title")?.split(/\r?\n/)[0]?.trim() ||
          text.split(" ").slice(0, 3).join(" ");
        const disabled =
          element instanceof HTMLButtonElement
            ? element.disabled
            : element.getAttribute("aria-disabled") === "true" || element.classList.contains("is-disabled");
        return {
          key,
          testId,
          label: title,
          disabled,
        };
      })
      .filter((candidate) => !candidate.disabled);
  }, selector);
}

async function clickCard(page: Page, card: CardCandidate): Promise<void> {
  const locator = card.testId
    ? page.getByTestId(card.testId).first()
    : page.locator(`[data-release-check-card="${card.key}"]`).first();
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
}

async function clickGeometryQuickAdd(page: Page, card: CardCandidate): Promise<string> {
  const cardId = card.testId.replace(/^geometry-gallery-card-/, "");
  const quickAdd = cardId ? page.getByTestId(`geometry-gallery-quick-add-${cardId}`).first() : null;
  if (quickAdd && (await quickAdd.isVisible().catch(() => false)) && (await quickAdd.isEnabled().catch(() => false))) {
    await quickAdd.scrollIntoViewIfNeeded();
    await quickAdd.click();
    return `quick-add:${cardId}`;
  }
  await clickCard(page, card);
  await page.keyboard.press("Enter");
  return `card-enter:${card.testId || card.key}`;
}

async function readSceneState(page: Page): Promise<{ statusBar: string; sceneStats: string | null; body: string }> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
    const statusBar = normalize(document.querySelector("[data-testid='app-status-bar']")?.textContent);
    const sceneStats = normalize(document.querySelector("[data-testid='geometry-scene-stats']")?.textContent) || null;
    const body = normalize(document.body?.innerText);
    return { statusBar, sceneStats, body };
  });
}

async function waitForSceneLabel(
  page: Page,
  area: AreaName,
  expectedLabel: string
): Promise<{ statusBar: string; sceneStats: string | null; matched: boolean; loadMs: number }> {
  const needle = expectedLabel.toLowerCase();
  const started = performance.now();
  try {
    await page.waitForFunction(
      ({ currentArea, currentNeedle }) => {
        const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
        const statusBar = normalize(document.querySelector("[data-testid='app-status-bar']")?.textContent).toLowerCase();
        const body = normalize(document.body?.innerText).toLowerCase();
        if (currentArea === "mesh") {
          return statusBar.includes(currentNeedle);
        }
        return statusBar.includes(currentNeedle) || body.includes(`selected: ${currentNeedle}`);
      },
      { currentArea: area, currentNeedle: needle },
      { timeout: sceneLoadTimeoutMs, polling: 100 }
    );
  } catch (error) {
    const state = await readSceneState(page).catch(() => ({ statusBar: "", sceneStats: null, body: "" }));
    throw new Error(
      `Scene did not switch to ${area} preset "${expectedLabel}" within ${sceneLoadTimeoutMs} ms. ` +
        `Status bar: "${state.statusBar}". Scene stats: "${state.sceneStats ?? ""}".`
    );
  }
  const state = await readSceneState(page);
  const haystack = area === "mesh" ? state.statusBar : `${state.statusBar} ${state.body}`;
  return {
    statusBar: state.statusBar,
    sceneStats: state.sceneStats,
    matched: haystack.toLowerCase().includes(needle),
    loadMs: performance.now() - started,
  };
}

async function runPresetArea(
  page: Page,
  rootPid: number,
  area: AreaName,
  actions: number,
  startedAt: number,
  samples: ProcessMemorySample[],
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  const selector =
    area === "mesh"
      ? "[data-testid^='mesh-preset-card-'], [data-testid^='mesh-asset-card-']"
      : "[data-testid^='geometry-gallery-card-']";

  for (let index = 0; index < actions; index += 1) {
    const cards = await collectCards(page, selector);
    if (!cards.length) throw new Error(`No visible ${area} preset cards found.`);
    const card = cards[index % cards.length];
    const target = area === "geometry" ? await clickGeometryQuickAdd(page, card) : card.testId || card.key;
    if (area === "mesh") await clickCard(page, card);
    const sceneState = await waitForSceneLabel(page, area, card.label);
    const label = `${area}:${index + 1}:${card.label || target}`;
    await waitAfterAction(page, actionDelayMs, label, startedAt, whiteScreenEvents);
    const sample = await sampleProcessTreeSafely(rootPid, performance.now() - startedAt);
    samples.push(sample);
    results.push({
      area,
      index: index + 1,
      label,
      target,
      expectedSceneLabel: card.label,
      statusBar: sceneState.statusBar,
      sceneStats: sceneState.sceneStats,
      matchedSceneState: sceneState.matched,
      loadMs: Number(sceneState.loadMs.toFixed(1)),
      atMs: sample.atMs,
      rssMiB: Number(bytesToMiB(sample.rssBytes).toFixed(1)),
      byRoleMiB: compactBytesByRole(sample.byRole),
    });
  }

  return results;
}

test.describe("release 1.4.9 mesh and geometry preset check", () => {
  test("loads Mesh gallery and Geometry presets in one app session", async () => {
    test.setTimeout(Math.max(240_000, actionsPerArea * 2 * actionDelayMs + 120_000));
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;
    const samples: ProcessMemorySample[] = [];
    const whiteScreenEvents: WhiteScreenEvent[] = [];
    const actions: ActionResult[] = [];
    const startedAt = performance.now();

    try {
      ctx = await launchReleaseCheckApp();
      const rootPid = ctx.app.process().pid;
      samples.push(await sampleProcessTreeSafely(rootPid, performance.now() - startedAt));

      await openMeshGallery(ctx.page);
      await waitAfterAction(ctx.page, actionDelayMs, "mesh:open-gallery", startedAt, whiteScreenEvents);
      actions.push(
        ...(await runPresetArea(ctx.page, rootPid, "mesh", actionsPerArea, startedAt, samples, whiteScreenEvents))
      );

      await openGeometryGallery(ctx.page);
      await waitAfterAction(ctx.page, actionDelayMs, "geometry:open-gallery", startedAt, whiteScreenEvents);
      actions.push(
        ...(await runPresetArea(ctx.page, rootPid, "geometry", actionsPerArea, startedAt, samples, whiteScreenEvents))
      );

      samples.push({ ...(await sampleProcessTreeSafely(rootPid, performance.now() - startedAt)), final: true });
      const summary = summarizeProcessMemory(samples);
      const report = {
        app: "Math3D",
        releaseCandidate: "1.4.9",
        measuredAt: new Date().toISOString(),
        platform: process.platform,
        cwd: repoRoot,
        actionDelayMs,
        sceneLoadTimeoutMs,
        actionsPerArea,
        totalPresetLoads: actions.length,
        whiteScreenEvents,
        summary: {
          ...summary,
          peakRssMiB: Number(bytesToMiB(summary.peakRssBytes).toFixed(1)),
          finalRssMiB: Number(bytesToMiB(summary.finalRssBytes).toFixed(1)),
          deltaFinalMinusInitialMiB: Number(bytesToMiB(summary.deltaFinalMinusInitialBytes).toFixed(1)),
          rolePeakMiB: compactBytesByRole(summary.rolePeakBytes),
          peakSampleRolesMiB: compactBytesByRole(summary.peakSampleRolesBytes),
        },
        actions,
        samples,
      };
      const reportDir = path.join(repoRoot, "output", "release-checks");
      mkdirSync(reportDir, { recursive: true });
      const reportPath = path.join(
        reportDir,
        `math3d-release-1.4.9-mesh-geometry-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
      );
      await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      console.log(`[release-check] report=${reportPath}`);
      console.log(
        `[release-check] actions=${actions.length} peakMiB=${report.summary.peakRssMiB} finalMiB=${report.summary.finalRssMiB} whiteScreens=${whiteScreenEvents.length}`
      );
      console.table(
        actions.map((action) => ({
          area: action.area,
          index: action.index,
          rssMiB: action.rssMiB,
          target: action.target,
          scene: action.expectedSceneLabel,
          matched: action.matchedSceneState,
          loadMs: action.loadMs,
        }))
      );

      expect(whiteScreenEvents).toHaveLength(0);
      expect(actions.every((action) => action.matchedSceneState)).toBe(true);
      expect(actions.filter((action) => action.area === "mesh")).toHaveLength(actionsPerArea);
      expect(actions.filter((action) => action.area === "geometry")).toHaveLength(actionsPerArea);
    } finally {
      await closeReleaseCheckApp(ctx);
    }
  });
});
