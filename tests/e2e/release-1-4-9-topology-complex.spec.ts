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

type AreaName = "topology" | "complex";

type WhiteScreenEvent = {
  label: string;
  atMs: number;
  textLength: number;
  hasHeading: boolean;
};

type ActionResult = {
  area: AreaName;
  index: number;
  target: string;
  expectedSceneLabel: string;
  statusBar: string;
  matchedSceneState: boolean;
  loadMs: number;
  atMs: number;
  rssMiB: number;
  byRoleMiB: Record<string, number>;
};

type CardCandidate = {
  testId: string;
  label: string;
  disabled: boolean;
};

type ComplexAction = {
  target: string;
  expected: string;
  bodyNeedle?: string;
  afterClick?: string;
};

const positiveIntFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const actionDelayMs = positiveIntFromEnv("MATH3D_RELEASE_CHECK_ACTION_DELAY_MS", 5_000);
const actionsPerArea = positiveIntFromEnv("MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA", 12);
const sceneLoadTimeoutMs = positiveIntFromEnv("MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS", 30_000);
const selectedAreas = new Set(
  String(process.env.MATH3D_RELEASE_CHECK_AREAS ?? "topology,complex")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const complexActions: ComplexAction[] = [
  { target: "Function Explorer", expected: "Complex Function Explorer", afterClick: "Preset" },
  { target: "Möbius Lab", expected: "Mobius viewer", bodyNeedle: "Möbius map", afterClick: "Preset" },
  { target: "Riemann Sphere", expected: "Mobius viewer", bodyNeedle: "Riemann Sphere" },
  { target: "Residue Lab", expected: "Residue Lab", bodyNeedle: "Residue Lab" },
  { target: "Branch Lab", expected: "Branch Lab", bodyNeedle: "Branch Lab" },
  { target: "Covering Lab", expected: "Covering Map Lab", bodyNeedle: "Covering Lab" },
];

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

async function readSceneState(page: Page): Promise<{ statusBar: string; body: string }> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
    return {
      statusBar: normalize(document.querySelector("[data-testid='app-status-bar']")?.textContent),
      body: normalize(document.body?.innerText),
    };
  });
}

async function waitForTopologyPreset(page: Page, expectedLabel: string): Promise<{ statusBar: string; matched: boolean; loadMs: number }> {
  const started = performance.now();
  await expect(page.getByTestId("topology-selected-preset")).toHaveText(expectedLabel, { timeout: sceneLoadTimeoutMs });
  const state = await readSceneState(page);
  return {
    statusBar: state.statusBar,
    matched: (await page.getByTestId("topology-selected-preset").innerText()).trim() === expectedLabel,
    loadMs: performance.now() - started,
  };
}

async function waitForComplexView(page: Page, expected: string, bodyNeedle?: string): Promise<{ statusBar: string; matched: boolean; loadMs: number }> {
  const started = performance.now();
  await page.waitForFunction(
    ({ expectedLabel, expectedBody }) => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
      const statusBar = normalize(document.querySelector("[data-testid='app-status-bar']")?.textContent);
      const body = normalize(document.body?.innerText);
      return statusBar.includes(expectedLabel.toLowerCase()) && (!expectedBody || body.includes(expectedBody.toLowerCase()));
    },
    { expectedLabel: expected, expectedBody: bodyNeedle ?? "" },
    { timeout: sceneLoadTimeoutMs, polling: 100 }
  );
  const state = await readSceneState(page);
  const haystack = `${state.statusBar} ${state.body}`.toLowerCase();
  return {
    statusBar: state.statusBar,
    matched: state.statusBar.toLowerCase().includes(expected.toLowerCase()) && (!bodyNeedle || haystack.includes(bodyNeedle.toLowerCase())),
    loadMs: performance.now() - started,
  };
}

async function collectTopologyCards(page: Page): Promise<CardCandidate[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid^='topology-preset-card-']"))
      .filter((element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => ({
        testId: element.getAttribute("data-testid") ?? "",
        label: element.querySelector("div")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        disabled: element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true",
      }))
      .filter((candidate) => candidate.testId && candidate.label && !candidate.disabled)
  );
}

async function runTopologyArea(
  page: Page,
  rootPid: number,
  actions: number,
  startedAt: number,
  samples: ProcessMemorySample[],
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  await selectSection(page, "Topology");
  await expect(page.getByRole("heading", { name: "Topology Module" })).toBeVisible({ timeout: 15_000 });
  await firstVisible(page.getByRole("button", { name: "Preset mode", exact: true })).then((button) => button?.click());

  for (let index = 0; index < actions; index += 1) {
    const cards = await collectTopologyCards(page);
    if (!cards.length) throw new Error("No visible Topology preset cards found.");
    const card = cards[index % cards.length];
    const locator = page.getByTestId(card.testId).first();
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    const sceneState = await waitForTopologyPreset(page, card.label);
    await waitAfterAction(page, actionDelayMs, `topology:${index + 1}:${card.label}`, startedAt, whiteScreenEvents);
    const sample = await sampleProcessTreeSafely(rootPid, performance.now() - startedAt);
    samples.push(sample);
    results.push({
      area: "topology",
      index: index + 1,
      target: card.testId,
      expectedSceneLabel: card.label,
      statusBar: sceneState.statusBar,
      matchedSceneState: sceneState.matched,
      loadMs: Number(sceneState.loadMs.toFixed(1)),
      atMs: sample.atMs,
      rssMiB: Number(bytesToMiB(sample.rssBytes).toFixed(1)),
      byRoleMiB: compactBytesByRole(sample.byRole),
    });
  }
  return results;
}

async function runComplexArea(
  page: Page,
  rootPid: number,
  actions: number,
  startedAt: number,
  samples: ProcessMemorySample[],
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  await selectSection(page, "Complex Analysis");

  for (let index = 0; index < actions; index += 1) {
    const action = complexActions[index % complexActions.length];
    const button = await firstVisible(page.getByRole("button", { name: action.target, exact: true }));
    if (!button) throw new Error(`Complex Analysis button not found: ${action.target}`);
    await button.click();
    if (action.afterClick) {
      const nested = await firstVisible(page.getByRole("button", { name: action.afterClick, exact: true }));
      await nested?.click().catch(() => undefined);
    }
    const sceneState = await waitForComplexView(page, action.expected, action.bodyNeedle);
    await waitAfterAction(page, actionDelayMs, `complex:${index + 1}:${action.target}`, startedAt, whiteScreenEvents);
    const sample = await sampleProcessTreeSafely(rootPid, performance.now() - startedAt);
    samples.push(sample);
    results.push({
      area: "complex",
      index: index + 1,
      target: action.target,
      expectedSceneLabel: action.bodyNeedle ?? action.expected,
      statusBar: sceneState.statusBar,
      matchedSceneState: sceneState.matched,
      loadMs: Number(sceneState.loadMs.toFixed(1)),
      atMs: sample.atMs,
      rssMiB: Number(bytesToMiB(sample.rssBytes).toFixed(1)),
      byRoleMiB: compactBytesByRole(sample.byRole),
    });
  }
  return results;
}

test.describe("release 1.4.9 topology and complex analysis check", () => {
  test("loads Topology presets and Complex Analysis labs in one app session", async () => {
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

      if (selectedAreas.has("topology")) {
        actions.push(...(await runTopologyArea(ctx.page, rootPid, actionsPerArea, startedAt, samples, whiteScreenEvents)));
      }
      if (selectedAreas.has("complex")) {
        actions.push(...(await runComplexArea(ctx.page, rootPid, actionsPerArea, startedAt, samples, whiteScreenEvents)));
      }
      if (!actions.length) throw new Error("No release-check areas selected. Use topology, complex, or both.");

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
        selectedAreas: [...selectedAreas],
        actionsPerArea,
        totalLoads: actions.length,
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
        `math3d-release-1.4.9-topology-complex-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
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
      if (selectedAreas.has("topology")) expect(actions.filter((action) => action.area === "topology")).toHaveLength(actionsPerArea);
      if (selectedAreas.has("complex")) expect(actions.filter((action) => action.area === "complex")).toHaveLength(actionsPerArea);
    } finally {
      await closeReleaseCheckApp(ctx);
    }
  });
});
