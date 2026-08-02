import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import {
  bytesToMiB,
  sampleProcessTreeRss,
  sampleProcessTreeSafely,
  summarizeProcessMemory,
  type ProcessMemorySample,
} from "./helpers/processMemory";

const { PNG } = require("pngjs") as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Buffer } } };
};

const repoRoot = path.resolve(__dirname, "..", "..");
const firstLaunchKey = "math3d.computeEngines.firstLaunchSeen";
const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;

type ScenarioName =
  | "navigation"
  | "canvas"
  | "mixed"
  | "module-sweep"
  | "module-repeat"
  | "module-chain-repeat"
  | "surface-gallery-chain";

type WhiteScreenEvent = {
  label: string;
  atMs: number;
  detector: "dom" | "visual";
  textLength: number;
  hasHeading: boolean;
  whitePixelRatio?: number;
};

type ScenarioCheckpoint = {
  label: string;
  atMs: number;
  actionIndex: number;
  processMemory: ProcessMemorySample;
  rendererMemory: RendererMemorySnapshot | null;
  threeDiagnostics: unknown;
};

type ScenarioResult = {
  scenario: ScenarioName;
  actions: number;
  targetModule?: string;
  clickTarget?: string;
  aborted?: boolean;
  abortReason?: string;
  abortAt?: string;
  navigationActions?: number;
  canvasActions?: number;
  visitedSections?: string[];
  checkpoints?: ScenarioCheckpoint[];
  timingsMs: {
    p50: number;
    p95: number;
    max: number;
  };
};

type RendererMemorySnapshot = {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
};

type MemoryProfileReport = {
  app: string;
  version: string;
  measuredAt: string;
  platform: NodeJS.Platform;
  cwd: string;
  scenario: ScenarioName;
  actionCount: number;
  actionDelayMs: number;
  sampleIntervalMs: number;
  finalIdleMs: number;
  electronArgs: string[];
  rendererMemoryBefore: RendererMemorySnapshot | null;
  rendererMemoryAfterScenario: RendererMemorySnapshot | null;
  rendererMemoryAfterIdle: RendererMemorySnapshot | null;
  appWindowOpenAfterIdle: boolean;
  whiteScreenEvents: WhiteScreenEvent[];
  threeDiagnosticsAfterScenario: unknown;
  threeDiagnosticsAfterIdle: unknown;
  summary: ReturnType<typeof summarizeProcessMemory> & {
    peakRssMiB: number;
    finalRssMiB: number;
    deltaFinalMinusInitialMiB: number;
    rolePeakMiB: Record<string, number>;
    peakSampleRolesMiB: Record<string, number>;
  };
  scenarioResult: ScenarioResult;
  samples: ProcessMemorySample[];
};

const positiveIntFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const scenarioFromEnv = (): ScenarioName => {
  const raw = String(process.env.MATH3D_MEMORY_PROFILE_SCENARIO ?? "mixed").toLowerCase();
  if (
    raw === "navigation" ||
    raw === "canvas" ||
    raw === "mixed" ||
    raw === "module-sweep" ||
    raw === "module-repeat" ||
    raw === "module-chain-repeat" ||
    raw === "surface-gallery-chain"
  ) {
    return raw;
  }
  throw new Error(`Unsupported MATH3D_MEMORY_PROFILE_SCENARIO: ${raw}`);
};

const surfaceFamiliesFromEnv = (): string[] =>
  String(process.env.MATH3D_MEMORY_PROFILE_SURFACE_FAMILIES ?? "explicit,implicit,parametric,spline,constructed")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const targetModuleFromEnv = (): string => {
  const raw = String(process.env.MATH3D_MEMORY_PROFILE_MODULE ?? "Mesh").trim();
  const match = sectionLabels.find((label) => label.toLowerCase() === raw.toLowerCase());
  if (!match) {
    throw new Error(`Unsupported MATH3D_MEMORY_PROFILE_MODULE: ${raw}. Expected one of: ${sectionLabels.join(", ")}`);
  }
  return match;
};

const targetModulesFromEnv = (): string[] => {
  const raw = String(process.env.MATH3D_MEMORY_PROFILE_MODULES ?? "Surfaces,Mesh,Volume,Curves");
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match = sectionLabels.find((label) => label.toLowerCase() === value.toLowerCase());
      if (!match) {
        throw new Error(`Unsupported module in MATH3D_MEMORY_PROFILE_MODULES: ${value}. Expected one of: ${sectionLabels.join(", ")}`);
      }
      return match;
    });
};

const electronArgsFromEnv = (): string[] =>
  String(process.env.MATH3D_MEMORY_PROFILE_ELECTRON_ARGS ?? "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const quantile = (values: number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
};

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

async function readVisualWhitePixelRatio(page: Page): Promise<number | null> {
  if (page.isClosed()) return 1;
  const screenshot = await page.screenshot({ scale: "css", timeout: 2_000 }).catch(() => null);
  if (!screenshot) return null;
  const png = PNG.sync.read(screenshot);
  let sampled = 0;
  let white = 0;
  const stride = Math.max(1, Math.floor(Math.min(png.width, png.height) / 80));

  for (let y = 0; y < png.height; y += stride) {
    for (let x = 0; x < png.width; x += stride) {
      const index = (y * png.width + x) * 4;
      const alpha = png.data[index + 3];
      if (alpha < 16) continue;
      sampled += 1;
      const red = png.data[index];
      const green = png.data[index + 1];
      const blue = png.data[index + 2];
      if (red >= 245 && green >= 245 && blue >= 245) white += 1;
    }
  }

  return sampled > 0 ? white / sampled : null;
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
  let recordedVisualBlank = false;
  let nextVisualCheckAt = 0;
  let nextGcAt = 0;
  const visualChecksEnabled = process.env.MATH3D_MEMORY_PROFILE_VISUAL_WHITE_SCREEN !== "0";
  const forceGcEnabled = process.env.MATH3D_MEMORY_PROFILE_FORCE_GC === "1";
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      if (!recordedBlank) {
        whiteScreenEvents.push({
          label,
          atMs: performance.now() - startedAt,
          detector: "dom",
          textLength: 0,
          hasHeading: false,
        });
      }
      break;
    }
    const remainingMs = deadline - Date.now();
    await page.waitForTimeout(Math.min(250, Math.max(0, remainingMs))).catch(() => undefined);
    const state = await readWhiteScreenState(page).catch(() => ({ white: true, textLength: 0, hasHeading: false }));
    if (state.white && !recordedBlank) {
      whiteScreenEvents.push({
        label,
        atMs: performance.now() - startedAt,
        detector: "dom",
        textLength: state.textLength,
        hasHeading: state.hasHeading,
      });
      recordedBlank = true;
    }
    if (forceGcEnabled && Date.now() >= nextGcAt) {
      nextGcAt = Date.now() + 1_000;
      await page.evaluate(() => {
        (globalThis as { gc?: () => void }).gc?.();
      }).catch(() => undefined);
    }
    if (visualChecksEnabled && !recordedVisualBlank && Date.now() >= nextVisualCheckAt) {
      nextVisualCheckAt = Date.now() + 1_000;
      const whitePixelRatio = await readVisualWhitePixelRatio(page).catch(() => null);
      if (whitePixelRatio != null && whitePixelRatio >= 0.97) {
        whiteScreenEvents.push({
          label,
          atMs: performance.now() - startedAt,
          detector: "visual",
          textLength: state.textLength,
          hasHeading: state.hasHeading,
          whitePixelRatio,
        });
        recordedVisualBlank = true;
      }
    }
  }
}

async function launchMemoryProfileApp(electronArgs: string[]): Promise<{
  app: ElectronApplication;
  page: Page;
  profileDir: string;
}> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-memory-profile-"));
  const launchEnv: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
    MATH3D_E2E: "1",
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await launchRepoElectron({
    args: [...electronArgs, "."],
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

async function closeMemoryProfileApp(ctx: { app: ElectronApplication; profileDir: string } | null): Promise<void> {
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

async function clickFirstVisible(locator: Locator): Promise<boolean> {
  const target = await firstVisible(locator);
  if (!target) return false;
  await target.click();
  return true;
}

async function clickFirstVisibleByTestId(page: Page, testId: string): Promise<boolean> {
  return clickFirstVisible(page.getByTestId(testId));
}

async function setSurfacesLayout(page: Page, layout: 1 | 2 | 3): Promise<void> {
  await clickFirstVisible(page.getByRole("button", { name: new RegExp(`^(Layout ${layout}|L${layout})$`) }));
  await page.waitForTimeout(250);
}

async function setSurfacesLayout3PanelMode(page: Page, mode: "browse" | "work"): Promise<void> {
  const toggle = await firstVisible(page.getByTestId("surfaces-layout3-mode-toggle"));
  if (!toggle) return;
  const label = (await toggle.innerText()).replace(/\s+/g, " ").trim().toLowerCase();
  if (mode === "work" && (label.includes("show scene/object tabs") || label.includes("tabs"))) {
    await toggle.click();
    await page.waitForTimeout(250);
    return;
  }
  if (mode === "browse" && label === "gallery") {
    await toggle.click();
    await page.waitForTimeout(250);
  }
}

async function ensureSurfacesGalleryMode(page: Page): Promise<void> {
  const labels = await getAvailableSections(page);
  await selectSection(page, labels, "Surfaces");
  await setSurfacesLayout(page, 3);
  await setSurfacesLayout3PanelMode(page, "browse");
  if (!(await firstVisible(page.getByTestId("surface-family-explicit")))) {
    const visibleTestIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid]"))
        .filter((element): element is HTMLElement => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => element.getAttribute("data-testid"))
        .filter(Boolean)
        .slice(0, 80)
    );
    throw new Error(`Surfaces gallery family buttons were not visible. Visible test ids: ${visibleTestIds.join(", ")}`);
  }
}

async function findSectionButton(page: Page, label: string) {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    if ((await button.getAttribute("aria-pressed")) == null) continue;
    return button;
  }
  return null;
}

async function getAvailableSections(page: Page): Promise<string[]> {
  const available: string[] = [];
  for (const label of sectionLabels) {
    if (await findSectionButton(page, label)) available.push(label);
  }
  return available;
}

async function getActiveSection(page: Page, labels: string[]): Promise<string> {
  for (const label of labels) {
    const button = await findSectionButton(page, label);
    if (button && (await button.getAttribute("aria-pressed")) === "true") return label;
  }
  throw new Error("Could not determine active section.");
}

async function selectSection(page: Page, labels: string[], label: string): Promise<number> {
  const button = await findSectionButton(page, label);
  if (!button) throw new Error(`Section button not found: ${label}`);
  const started = performance.now();
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
    { expectedLabels: labels, expectedLabel: label },
    { timeout: 15_000, polling: 25 }
  );
  return performance.now() - started;
}

async function runNavigation(
  page: Page,
  actions: number,
  actionDelayMs: number,
  startedAt: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<{
  timings: number[];
  visitedSections: string[];
}> {
  const labels = await getAvailableSections(page);
  if (labels.length < 2) throw new Error(`Only ${labels.length} sections are available.`);
  const start = await getActiveSection(page, labels);
  const walk = labels.filter((label) => label !== start);
  if (!walk.length) throw new Error("No alternate section is available.");

  const timings: number[] = [];
  const visitedSections = [start];
  for (let i = 0; i < actions; i += 1) {
    const label = walk[i % walk.length];
    timings.push(await selectSection(page, labels, label));
    await waitAfterAction(page, actionDelayMs, `navigation:${label}:${i + 1}`, startedAt, whiteScreenEvents);
    visitedSections.push(label);
  }
  return { timings, visitedSections: Array.from(new Set(visitedSections)) };
}

async function largestVisibleCanvasHost(page: Page) {
  const hosts = page.getByTestId("surface-viewer-canvas-host");
  const count = await hosts.count();
  let bestIndex = -1;
  let bestArea = 0;
  for (let i = 0; i < count; i += 1) {
    const host = hosts.nth(i);
    if (!(await host.isVisible())) continue;
    const box = await host.boundingBox();
    const area = box ? Math.max(0, box.width) * Math.max(0, box.height) : 0;
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) throw new Error("No visible surface canvas host found.");
  return hosts.nth(bestIndex);
}

async function waitForVisibleSurfaceCanvasHost(page: Page, timeout = 7_500): Promise<boolean> {
  return page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("[data-testid='surface-viewer-canvas-host']")).some((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        }),
      undefined,
      { timeout }
    )
    .then(() => true)
    .catch(() => false);
}

async function visibleTestIds(page: Page, limit = 80): Promise<string[]> {
  return page.evaluate((maxCount) => {
    const ids = Array.from(document.querySelectorAll("[data-testid]"))
      .filter((element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => element.getAttribute("data-testid"))
      .filter((testId): testId is string => Boolean(testId));
    return Array.from(new Set(ids)).slice(0, maxCount);
  }, limit);
}

async function openSurfaceCanvas(page: Page): Promise<Awaited<ReturnType<typeof largestVisibleCanvasHost>>> {
  const labels = await getAvailableSections(page);
  await selectSection(page, labels, "Surfaces");

  const attempts: Array<() => Promise<void>> = [
    async () => {
      await setSurfacesLayout(page, 3);
      await clickFirstVisibleByTestId(page, "surface-family-explicit");
      await setSurfacesLayout3PanelMode(page, "work");
    },
    async () => {
      await setSurfacesLayout(page, 2);
      await clickFirstVisibleByTestId(page, "surface-family-explicit");
    },
    async () => {
      await setSurfacesLayout(page, 1);
      await clickFirstVisibleByTestId(page, "surface-family-explicit");
    },
  ];

  for (const attempt of attempts) {
    await attempt();
    if (await waitForVisibleSurfaceCanvasHost(page)) return largestVisibleCanvasHost(page);
  }

  const ids = await visibleTestIds(page);
  throw new Error(`No visible surface canvas host found after opening Surfaces. Visible test ids: ${ids.join(", ")}`);
}

async function runCanvas(
  page: Page,
  actions: number,
  actionDelayMs: number,
  startedAt: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<number[]> {
  const host = await openSurfaceCanvas(page);
  const box = await host.boundingBox();
  if (!box) throw new Error("Surface canvas host has no bounding box.");

  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  const radiusX = Math.max(24, Math.min(90, box.width * 0.16));
  const radiusY = Math.max(18, Math.min(70, box.height * 0.14));
  const timings: number[] = [];

  await page.mouse.move(centerX, centerY);
  for (let i = 0; i < actions; i += 1) {
    const started = performance.now();
    const angle = (i / 13) * Math.PI;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    if (i % 10 === 0) {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, i % 20 === 0 ? -160 : 160);
    } else if (i % 3 === 0) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 34, y + 18, { steps: 4 });
      await page.mouse.up();
    } else if (i % 3 === 1) {
      await page.mouse.move(x, y);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(x - 26, y + 24, { steps: 4 });
      await page.mouse.up({ button: "right" });
    } else {
      await page.mouse.click(x, y);
    }
    timings.push(performance.now() - started);
    await waitAfterAction(page, actionDelayMs, `canvas:${i + 1}`, startedAt, whiteScreenEvents);
  }

  await expect(host).toBeVisible();
  return timings;
}

async function findLargestVisibleClickTarget(page: Page): Promise<{
  label: string;
  x: number;
  y: number;
}> {
  return page.evaluate(() => {
    const selectors = [
      "canvas",
      "[data-testid*='canvas']",
      "[data-testid*='viewport']",
      "[data-testid*='viewer']",
      "[data-testid*='stage']",
    ];
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          element,
          rect,
          area: Math.max(0, rect.width) * Math.max(0, rect.height),
          visible:
            rect.width >= 24 &&
            rect.height >= 24 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0",
        };
      })
      .filter((candidate) => candidate.visible)
      .sort((a, b) => b.area - a.area);

    const best = candidates[0];
    if (best) {
      return {
        label:
          best.element.getAttribute("data-testid") ||
          best.element.getAttribute("aria-label") ||
          best.element.tagName.toLowerCase(),
        x: best.rect.left + best.rect.width * 0.5,
        y: best.rect.top + best.rect.height * 0.5,
      };
    }

    const main = document.querySelector("main") as HTMLElement | null;
    const rect = (main ?? document.body).getBoundingClientRect();
    return {
      label: main ? "main" : "body",
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
    };
  });
}

async function prepareModuleForMeaningfulActions(page: Page, moduleName: string): Promise<void> {
  if (moduleName === "Surfaces") {
    await setSurfacesLayout(page, 3);
    await setSurfacesLayout3PanelMode(page, "browse");
    await clickFirstVisibleByTestId(page, "surface-family-explicit");
    await page.waitForTimeout(250);
  }

  if (moduleName === "Mesh") {
    const meshPresets = page.getByRole("button", { name: "Mesh presets", exact: true }).first();
    if ((await meshPresets.count()) > 0 && (await meshPresets.isVisible())) {
      await meshPresets.click().catch(() => undefined);
      await page.waitForTimeout(250);
    }
  }
}

async function findMeaningfulModuleActionTarget(
  page: Page,
  moduleName: string,
  actionIndex: number
): Promise<{ label: string; x: number; y: number; kind: "card" | "viewer" }> {
  const target = await page.evaluate(
    ({ currentModule, index, moduleLabels }) => {
      const isVisible = (element: Element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width >= 8 &&
          rect.height >= 8 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      };
      const centerOf = (element: HTMLElement, label: string) => {
        const rect = element.getBoundingClientRect();
        return {
          label,
          x: rect.left + Math.min(rect.width - 4, Math.max(4, rect.width * 0.5)),
          y: rect.top + Math.min(rect.height - 4, Math.max(4, rect.height * 0.5)),
        };
      };
      const bySelector = (selectors: string[]) =>
        selectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .filter(isVisible)
          .filter((element) => element.getAttribute("aria-disabled") !== "true" && !element.hasAttribute("disabled"));

      const cardSelectorsByModule: Record<string, string[]> = {
        Surfaces: [
          "[data-testid^='surface-preset-card-']",
          "[data-testid^='param-preset-card-']",
          "[data-testid^='weierstrass-preset-card-']",
          "[data-testid^='surface-family-']",
        ],
        Mesh: ["[data-testid^='mesh-preset-card-']"],
        Volume: ["[data-testid^='volume-preset-']", "[data-testid*='volume'][data-testid*='preset']"],
        Curves: ["[data-testid^='curve-preset-']", "[data-testid*='curve'][data-testid*='preset']"],
      };

      const cards = bySelector(cardSelectorsByModule[currentModule] ?? []);
      if (cards.length) {
        const element = cards[index % cards.length];
        return {
          ...centerOf(element, element.getAttribute("data-testid") ?? `${currentModule}:card:${index % cards.length}`),
          kind: "card" as const,
        };
      }

      return null;
    },
    { currentModule: moduleName, index: actionIndex, moduleLabels: [...sectionLabels] }
  );

  if (target) return target;
  return { ...(await findLargestVisibleClickTarget(page)), kind: "viewer" };
}

async function performModuleAction(
  page: Page,
  target: { label: string; x: number; y: number; kind: "card" | "viewer" },
  actionIndex: number
): Promise<void> {
  if (target.kind === "card") {
    await page.mouse.click(target.x, target.y);
    return;
  }

  if (actionIndex % 5 === 0) {
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, actionIndex % 10 === 0 ? -180 : 180);
    return;
  }

  if (actionIndex % 3 === 0) {
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 38, target.y + 20, { steps: 5 });
    await page.mouse.up();
    return;
  }

  if (actionIndex % 3 === 1) {
    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(target.x - 30, target.y + 26, { steps: 5 });
    await page.mouse.up({ button: "right" });
    return;
  }

  await page.mouse.click(target.x, target.y);
}

async function runModuleRepeat(
  page: Page,
  rootPid: number,
  startedAt: number,
  actions: number,
  actionDelayMs: number,
  whiteScreenEvents: WhiteScreenEvent[],
  targetModule = targetModuleFromEnv(),
  chainLabel = ""
): Promise<ScenarioResult> {
  const labels = await getAvailableSections(page);
  const timings: number[] = [];
  const checkpoints: ScenarioCheckpoint[] = [];

  await selectSection(page, labels, targetModule);
  await waitAfterAction(page, actionDelayMs, `${chainLabel}module-repeat:${targetModule}:open`, startedAt, whiteScreenEvents);
  await prepareModuleForMeaningfulActions(page, targetModule);

  let clickTarget = "";
  for (let i = 0; i < actions; i += 1) {
    const target = await findMeaningfulModuleActionTarget(page, targetModule, i);
    clickTarget = target.label;
    const started = performance.now();
    await performModuleAction(page, target, i);
    timings.push(performance.now() - started);
    await waitAfterAction(page, actionDelayMs, `${chainLabel}module-repeat:${targetModule}:${i + 1}`, startedAt, whiteScreenEvents);

    checkpoints.push({
      label: `${chainLabel}${targetModule} click ${i + 1} (${target.kind}:${target.label})`,
      atMs: performance.now() - startedAt,
      actionIndex: i + 1,
      processMemory: { atMs: performance.now() - startedAt, ...(await sampleProcessTreeRss(rootPid)) },
      rendererMemory: await readRendererMemory(page),
      threeDiagnostics: await readThreeDiagnostics(
        page,
        `memory-profile-module-repeat-${targetModule.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`
      ),
    });
  }

  return {
    scenario: "module-repeat",
    actions,
    targetModule,
    clickTarget,
    checkpoints,
    visitedSections: [targetModule],
    timingsMs: {
      p50: quantile(timings, 0.5),
      p95: quantile(timings, 0.95),
      max: Math.max(...timings),
    },
  };
}

async function runModuleChainRepeat(
  page: Page,
  rootPid: number,
  startedAt: number,
  actions: number,
  actionDelayMs: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ScenarioResult> {
  const modules = targetModulesFromEnv();
  const timings: number[] = [];
  const checkpoints: ScenarioCheckpoint[] = [];
  let clickTarget = "";

  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
    const moduleName = modules[moduleIndex];
    const result = await runModuleRepeat(
      page,
      rootPid,
      startedAt,
      actions,
      actionDelayMs,
      whiteScreenEvents,
      moduleName,
      `${moduleIndex + 1}/${modules.length}:`
    );
    clickTarget = result.clickTarget ?? clickTarget;
    checkpoints.push(...(result.checkpoints ?? []));
    timings.push(result.timingsMs.p50, result.timingsMs.p95, result.timingsMs.max);
  }

  return {
    scenario: "module-chain-repeat",
    actions: actions * modules.length,
    targetModule: modules.join(","),
    clickTarget,
    checkpoints,
    visitedSections: modules,
    timingsMs: {
      p50: quantile(timings, 0.5),
      p95: quantile(timings, 0.95),
      max: Math.max(...timings),
    },
  };
}

async function getSurfaceCardTestIds(page: Page, family: string): Promise<string[]> {
  const prefixes =
    family === "explicit" || family === "implicit"
      ? ["surface-preset-card-"]
      : family === "weierstrass"
        ? ["weierstrass-preset-card-"]
        : ["param-preset-card-"];
  const ids = await page.evaluate((testIdPrefixes) => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
    };
    return Array.from(document.querySelectorAll("[data-testid]"))
      .filter(visible)
      .map((element) => element.getAttribute("data-testid") ?? "")
      .filter((testId) => testIdPrefixes.some((prefix) => testId.startsWith(prefix)));
  }, prefixes);
  return Array.from(new Set(ids));
}

async function clickSurfaceCard(page: Page, testId: string): Promise<void> {
  const card = page.getByTestId(testId).first();
  await card.scrollIntoViewIfNeeded().catch(() => undefined);
  await card.click({ timeout: 10_000 }).catch(async () => card.click({ force: true, timeout: 10_000 }));
}

async function runSurfaceGalleryChain(
  page: Page,
  rootPid: number,
  startedAt: number,
  actionDelayMs: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ScenarioResult> {
  await ensureSurfacesGalleryMode(page);

  const families = surfaceFamiliesFromEnv();
  const cardLimit = Math.max(0, Number(process.env.MATH3D_MEMORY_PROFILE_SURFACE_CARD_LIMIT ?? 0) || 0);
  const checkpoints: ScenarioCheckpoint[] = [];
  const timings: number[] = [];
  let actionIndex = 0;
  let abortReason: string | undefined;
  let abortAt: string | undefined;

  try {
    for (const family of families) {
      abortAt = `surface-gallery:${family}:open`;
      const familyButton = await firstVisible(page.getByTestId(`surface-family-${family}`));
      if (!familyButton) continue;
      await familyButton.click();
      await waitAfterAction(page, actionDelayMs, abortAt, startedAt, whiteScreenEvents);

      const subtypeIds =
        family === "constructed"
          ? await page
              .locator("[data-testid^='param-constructed-subtype-']")
              .evaluateAll((nodes) =>
                nodes
                  .filter((node) => node instanceof HTMLElement)
                  .map((node) => node.getAttribute("data-testid") ?? "")
                  .filter(Boolean)
              )
              .catch(() => [])
          : [""];

      const effectiveSubtypes = subtypeIds.length ? subtypeIds : [""];
      for (const subtypeId of effectiveSubtypes) {
        if (subtypeId) {
          abortAt = `surface-gallery:${family}:${subtypeId}:open`;
          const subtype = page.getByTestId(subtypeId).first();
          if ((await subtype.count()) > 0 && (await subtype.isVisible())) {
            await subtype.click();
            await waitAfterAction(page, actionDelayMs, abortAt, startedAt, whiteScreenEvents);
          }
        }

        const allCards = await getSurfaceCardTestIds(page, family);
        const cards = cardLimit > 0 ? allCards.slice(0, cardLimit) : allCards;
        for (const testId of cards) {
          abortAt = `surface-gallery:${family}:${testId}`;
          const started = performance.now();
          await clickSurfaceCard(page, testId);
          timings.push(performance.now() - started);
          actionIndex += 1;
          await waitAfterAction(page, actionDelayMs, abortAt, startedAt, whiteScreenEvents);
          checkpoints.push({
            label: `${family}${subtypeId ? `/${subtypeId.replace("param-constructed-subtype-", "")}` : ""} card ${actionIndex} (${testId})`,
            atMs: performance.now() - startedAt,
            actionIndex,
            processMemory: { atMs: performance.now() - startedAt, ...(await sampleProcessTreeRss(rootPid)) },
            rendererMemory: await readRendererMemory(page),
            threeDiagnostics: await readThreeDiagnostics(page, `memory-profile-surface-gallery-${family}-${actionIndex}`),
          });
        }
      }
    }
  } catch (error) {
    abortReason = error instanceof Error ? error.message : String(error);
  }

  return {
    scenario: "surface-gallery-chain",
    actions: actionIndex,
    targetModule: "Surfaces",
    clickTarget: "surface-gallery-cards",
    aborted: Boolean(abortReason),
    abortReason,
    abortAt: abortReason ? abortAt : undefined,
    checkpoints,
    visitedSections: ["Surfaces", ...families],
    timingsMs: {
      p50: quantile(timings, 0.5),
      p95: quantile(timings, 0.95),
      max: Math.max(0, ...timings),
    },
  };
}

async function runModuleSweep(
  page: Page,
  rootPid: number,
  startedAt: number,
  actionDelayMs: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ScenarioResult> {
  const labels = await getAvailableSections(page);
  const checkpoints: ScenarioCheckpoint[] = [];
  const timings: number[] = [];
  let actionIndex = 0;

  for (const label of labels) {
    const timing = await selectSection(page, labels, label);
    timings.push(timing);
    actionIndex += 1;
    await waitAfterAction(page, actionDelayMs, `module-sweep:${label}`, startedAt, whiteScreenEvents);
    checkpoints.push({
      label,
      atMs: performance.now() - startedAt,
      actionIndex,
      processMemory: { atMs: performance.now() - startedAt, ...(await sampleProcessTreeRss(rootPid)) },
      rendererMemory: await readRendererMemory(page),
      threeDiagnostics: await readThreeDiagnostics(page, `memory-profile-module-${label.toLowerCase().replace(/\s+/g, "-")}`),
    });
  }

  return {
    scenario: "module-sweep",
    actions: actionIndex,
    navigationActions: actionIndex,
    visitedSections: labels,
    checkpoints,
    timingsMs: {
      p50: quantile(timings, 0.5),
      p95: quantile(timings, 0.95),
      max: Math.max(...timings),
    },
  };
}

async function runScenario(
  page: Page,
  scenario: ScenarioName,
  actionCount: number,
  actionDelayMs: number,
  rootPid: number,
  startedAt: number,
  whiteScreenEvents: WhiteScreenEvent[]
): Promise<ScenarioResult> {
  if (scenario === "surface-gallery-chain") {
    return runSurfaceGalleryChain(page, rootPid, startedAt, actionDelayMs, whiteScreenEvents);
  }

  if (scenario === "module-chain-repeat") {
    return runModuleChainRepeat(page, rootPid, startedAt, actionCount, actionDelayMs, whiteScreenEvents);
  }

  if (scenario === "module-repeat") {
    return runModuleRepeat(page, rootPid, startedAt, actionCount, actionDelayMs, whiteScreenEvents);
  }

  if (scenario === "module-sweep") {
    return runModuleSweep(page, rootPid, startedAt, actionDelayMs, whiteScreenEvents);
  }

  if (scenario === "navigation") {
    const { timings, visitedSections } = await runNavigation(
      page,
      actionCount,
      actionDelayMs,
      startedAt,
      whiteScreenEvents
    );
    return {
      scenario,
      actions: actionCount,
      navigationActions: actionCount,
      visitedSections,
      timingsMs: {
        p50: quantile(timings, 0.5),
        p95: quantile(timings, 0.95),
        max: Math.max(...timings),
      },
    };
  }

  if (scenario === "canvas") {
    const timings = await runCanvas(page, actionCount, actionDelayMs, startedAt, whiteScreenEvents);
    return {
      scenario,
      actions: actionCount,
      canvasActions: actionCount,
      timingsMs: {
        p50: quantile(timings, 0.5),
        p95: quantile(timings, 0.95),
        max: Math.max(...timings),
      },
    };
  }

  const navigationActions = Math.max(1, Math.floor(actionCount * 0.6));
  const canvasActions = Math.max(1, actionCount - navigationActions);
  const navigation = await runNavigation(page, navigationActions, actionDelayMs, startedAt, whiteScreenEvents);
  const canvasTimings = await runCanvas(page, canvasActions, actionDelayMs, startedAt, whiteScreenEvents);
  const timings = [...navigation.timings, ...canvasTimings];
  return {
    scenario,
    actions: navigationActions + canvasActions,
    navigationActions,
    canvasActions,
    visitedSections: navigation.visitedSections,
    timingsMs: {
      p50: quantile(timings, 0.5),
      p95: quantile(timings, 0.95),
      max: Math.max(...timings),
    },
  };
}

async function readRendererMemory(page: Page): Promise<RendererMemorySnapshot | null> {
  return page
    .evaluate(() => {
      const memory = (performance as Performance & { memory?: RendererMemorySnapshot }).memory;
      if (!memory) return null;
      return {
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
      };
    })
    .catch(() => null);
}

async function readThreeDiagnostics(page: Page, phase: string): Promise<unknown> {
  return page
    .evaluate((snapshotPhase) => {
      const win = window as unknown as {
        __MATH3D_THREE_SNAPSHOT_ALL__?: (phase: string) => void;
        __MATH3D_THREE_DIAGNOSTICS__?: { viewers?: unknown; events?: unknown[] };
      };
      win.__MATH3D_THREE_SNAPSHOT_ALL__?.(snapshotPhase);
      const store = win.__MATH3D_THREE_DIAGNOSTICS__;
      if (!store) return null;
      return {
        viewers: store.viewers,
        events: store.events?.slice(-80) ?? [],
      };
    }, phase)
    .catch(() => null);
}

async function writeReport(report: MemoryProfileReport): Promise<string> {
  const outputRoot = path.resolve(process.env.MATH3D_MEMORY_PROFILE_DIR ?? path.join(repoRoot, "output", "memory-profiles"));
  await fs.mkdir(outputRoot, { recursive: true });
  const safeScenario = report.scenario.replace(/[^a-z0-9_.-]+/gi, "_");
  const stamp = report.measuredAt.replace(/[:.]/g, "-");
  const reportPath = path.join(outputRoot, `math3d-memory-profile-${report.version}-${safeScenario}-${stamp}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function attachReport(testInfo: TestInfo, report: MemoryProfileReport, reportPath: string): Promise<void> {
  await testInfo.attach("memory-profile-summary", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(report.summary, null, 2)),
  });
  await testInfo.attach("memory-profile-report", {
    contentType: "application/json",
    path: reportPath,
  });
}

test("Memory profile: desktop run records process tree RSS", async ({}, testInfo) => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  const scenario = scenarioFromEnv();
  const actionCount = positiveIntFromEnv("MATH3D_MEMORY_PROFILE_ACTIONS", 180);
  const actionDelayMs = positiveIntFromEnv("MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS", 3_000);
  const sampleIntervalMs = positiveIntFromEnv("MATH3D_MEMORY_PROFILE_SAMPLE_INTERVAL_MS", 500);
  const finalIdleMs = positiveIntFromEnv("MATH3D_MEMORY_PROFILE_FINAL_IDLE_MS", 5_000);
  const electronArgs = electronArgsFromEnv();
  const estimatedActionCount = scenario === "module-sweep" ? sectionLabels.length : actionCount;
  test.setTimeout(Math.max(15 * 60 * 1000, estimatedActionCount * actionDelayMs + finalIdleMs + 8 * 60 * 1000));

  let ctx: Awaited<ReturnType<typeof launchMemoryProfileApp>> | null = null;
  let sampling = true;
  let sampler: Promise<void> | null = null;
  const samples: ProcessMemorySample[] = [];
  const whiteScreenEvents: WhiteScreenEvent[] = [];
  const startedAt = performance.now();

  try {
    ctx = await launchMemoryProfileApp(electronArgs);
    const rootPid = ctx.app.process().pid;
    samples.push({ atMs: performance.now() - startedAt, ...(await sampleProcessTreeRss(rootPid)) });

    const rendererMemoryBefore = await readRendererMemory(ctx.page);
    sampler = (async () => {
      while (sampling) {
        samples.push(await sampleProcessTreeSafely(rootPid, performance.now() - startedAt));
        await delay(sampleIntervalMs);
      }
    })();

    const scenarioResult = await runScenario(
      ctx.page,
      scenario,
      actionCount,
      actionDelayMs,
      rootPid,
      startedAt,
      whiteScreenEvents
    );
    const rendererMemoryAfterScenario = await readRendererMemory(ctx.page);
    const threeDiagnosticsAfterScenario = await readThreeDiagnostics(ctx.page, "memory-profile-scenario-end");
    await delay(finalIdleMs);
    const rendererMemoryAfterIdle = await readRendererMemory(ctx.page);
    const threeDiagnosticsAfterIdle = await readThreeDiagnostics(ctx.page, "memory-profile-after-idle");
    const appWindowOpenAfterIdle = !ctx.page.isClosed();
    samples.push({ atMs: performance.now() - startedAt, ...(await sampleProcessTreeRss(rootPid)), final: true });
    sampling = false;
    await sampler;

    const rawSummary = summarizeProcessMemory(samples);
    const report: MemoryProfileReport = {
      app: packageJson.name,
      version: packageJson.version,
      measuredAt: new Date().toISOString(),
      platform: process.platform,
      cwd: repoRoot,
      scenario,
      actionCount,
      actionDelayMs,
      sampleIntervalMs,
      finalIdleMs,
      electronArgs,
      rendererMemoryBefore,
      rendererMemoryAfterScenario,
      rendererMemoryAfterIdle,
      appWindowOpenAfterIdle,
      whiteScreenEvents,
      threeDiagnosticsAfterScenario,
      threeDiagnosticsAfterIdle,
      summary: {
        ...rawSummary,
        peakRssMiB: Number(bytesToMiB(rawSummary.peakRssBytes).toFixed(1)),
        finalRssMiB: Number(bytesToMiB(rawSummary.finalRssBytes).toFixed(1)),
        deltaFinalMinusInitialMiB: Number(bytesToMiB(rawSummary.deltaFinalMinusInitialBytes).toFixed(1)),
        rolePeakMiB: compactBytesByRole(rawSummary.rolePeakBytes),
        peakSampleRolesMiB: compactBytesByRole(rawSummary.peakSampleRolesBytes),
      },
      scenarioResult,
      samples,
    };

    const reportPath = await writeReport(report);
    await attachReport(testInfo, report, reportPath);

    expect(samples.length).toBeGreaterThan(1);

    const maxRssMiB = Number(process.env.MATH3D_MEMORY_PROFILE_MAX_RSS_MB);
    if (Number.isFinite(maxRssMiB) && maxRssMiB > 0) {
      expect(report.summary.peakRssMiB).toBeLessThanOrEqual(maxRssMiB);
    }
  } finally {
    sampling = false;
    await sampler?.catch(() => undefined);
    await closeMemoryProfileApp(ctx);
  }
});
