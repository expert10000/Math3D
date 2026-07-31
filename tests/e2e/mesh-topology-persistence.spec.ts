import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import {
  runContextualActionFlow,
  runContextualEntityModeCheck,
  runContextualObjectModeCheck,
} from "./helpers/contextualToolbar";
import { contextualSelectionLabelPatterns } from "./helpers/contextualSelectionLabels";

const repoRoot = path.resolve(__dirname, "..", "..");
const firstLaunchKey = "math3d.computeEngines.firstLaunchSeen";
const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;

async function firstVisible(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("No visible locator match found.");
}

async function findSectionButton(page: Page, label: string): Promise<Locator> {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    if ((await button.getAttribute("aria-pressed")) == null) continue;
    return button;
  }
  throw new Error(`Section button not found: ${label}`);
}

async function selectSection(page: Page, label: (typeof sectionLabels)[number]): Promise<void> {
  const button = await findSectionButton(page, label);
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

async function findMainWindow(app: ElectronApplication): Promise<Page> {
  const firstWindow = await app.firstWindow();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const windows = app.windows();
    for (const candidate of windows.length ? windows : [firstWindow]) {
      await candidate.waitForLoadState("domcontentloaded", { timeout: 1_000 }).catch(() => undefined);
      const hasAppHeading = await candidate
        .getByRole("heading", { name: /^math3d$/i, level: 1 })
        .isVisible()
        .catch(() => false);
      if (hasAppHeading) return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await expect(firstWindow.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  return firstWindow;
}

async function launchApp(): Promise<{ app: ElectronApplication; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "math3d-mesh-topology-"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
    MATH3D_E2E: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await launchRepoElectron({ args: ["."], cwd: repoRoot, env });
  const page = await findMainWindow(app);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, "1");
  }, firstLaunchKey);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  return { app, page, profileDir };
}

async function closeApp(ctx: { app: ElectronApplication; profileDir: string } | null): Promise<void> {
  if (!ctx) return;
  await ctx.app.close().catch(() => undefined);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(ctx.profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) {
        console.warn(`Unable to remove temporary profile ${ctx.profileDir}:`, error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

async function openMeshGallery(page: Page): Promise<void> {
  await selectSection(page, "Mesh");
  const meshPresets = await firstVisible(page.getByRole("button", { name: "Mesh presets", exact: true }));
  await meshPresets.click();
  await expect(page.getByTestId("mesh-preset-grid")).toBeVisible({ timeout: 15_000 });
}

async function openGeometryBoxForObjectMode(page: Page): Promise<void> {
  await selectSection(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
  await firstVisible(page.getByRole("button", { name: "Procedural", exact: true })).then((button) => button.click());
  await firstVisible(page.getByTestId("geometry-workflow-step-create")).then((button) => button.click());
  await firstVisible(page.getByRole("button", { name: "Primitive", exact: true })).then((button) => button.click());
  await page.getByTestId("geometry-gallery-quick-add-box").click();
  await firstVisible(page.getByRole("button", { name: "Fit scene", exact: true })).then((button) => button.click());
  await firstVisible(page.getByTestId("geometry-workflow-step-transform")).then((button) => button.click());
  await expect(page.getByTestId("geometry-workflow-step-transform")).toHaveAttribute("aria-current", "step");
}

async function commitGeometryEntityPick(page: Page, kind: "object" | "face" | "edge" | "vertex"): Promise<void> {
  const result = await page.evaluate((pickKind) => {
    const picker = (window as Window & {
      __MATH3D_E2E_GEOMETRY_PICK__?: {
        commitGeometryPick: (request: { kind: "object" | "face" | "edge" | "vertex" }) => { ok: boolean; error?: string };
      };
    }).__MATH3D_E2E_GEOMETRY_PICK__;
    return picker?.commitGeometryPick({ kind: pickKind });
  }, kind);
  expect(result?.ok, result?.error ?? `Geometry ${kind} pick helper unavailable`).toBeTruthy();
}

async function selectDeterministicMeshEdge(page: Page): Promise<void> {
  const advancedIds = page.getByTestId("mesh-topology-advanced-ids").first();
  await expect(advancedIds).toBeVisible();
  if ((await advancedIds.getAttribute("open")) == null) {
    await advancedIds.locator("summary").click();
  }
  await expect(advancedIds).toHaveAttribute("open", "");
  await advancedIds.getByLabel("Advanced edge A id").fill("4");
  await advancedIds.getByLabel("Advanced edge B id").fill("5");
  await expect(page.getByTestId("mesh-topology-selected-edge").first()).toContainText("Selected edge 4-5");
  await expect(page.getByText(/valid edge/i).first()).toBeVisible();
}

async function selectDeterministicMeshFace(page: Page): Promise<void> {
  const advancedIds = page.getByTestId("mesh-topology-advanced-ids").first();
  await expect(advancedIds).toBeVisible();
  if ((await advancedIds.getAttribute("open")) == null) {
    await advancedIds.locator("summary").click();
  }
  await expect(advancedIds).toHaveAttribute("open", "");
  await advancedIds.getByLabel("Advanced face id").fill("0");
  await expect(page.getByTestId("mesh-topology-selected-face").first()).toContainText("Selected face 0");
  await expect(page.getByText(/valid face/i).first()).toBeVisible();
}

async function runTopologyDemo(
  page: Page,
  demoId: string,
  operationButtonName: string,
  expectedHistoryName: RegExp
): Promise<void> {
  await openMeshGallery(page);
  await page.getByTestId(`mesh-topology-preset-card-${demoId}`).click();
  const meshTools = await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true }));
  await meshTools.click();
  if (operationButtonName === "Split Edge") {
    await runContextualActionFlow({
      page,
      workspace: "mesh",
      pickMode: "edge",
      actionTestId: "mesh-active-selection-action-split-edge",
      preview: /Preview: Edge \d+-\d+ -> midpoint vertex/,
      viewportPreview: /Viewport preview: Edge \d+-\d+ -> midpoint vertex/,
      clickViewportPreview: true,
      checkOverlayToggle: true,
      checkDisplayToolbarOverlayToggle: true,
      checkSettingsOverlayToggle: true,
      checkHighVisibilityToggle: true,
      checkActiveSelectionPreviewAccessibility: true,
      confirmation: /Done: Edge \d+-\d+ -> split vertex \(\+1V, \+2F\)/,
      pickEntity: async () => {
        await selectDeterministicMeshEdge(page);
        await expect(page.getByTestId("mesh-topology-selected-edge").first()).toContainText(
          contextualSelectionLabelPatterns.edge
        );
        await expect(page.getByTestId("mesh-context-toolbar")).toContainText(contextualSelectionLabelPatterns.edge);
        await page.getByTestId("mesh-inspector-tab-selection").click();
        await expect(page.getByTestId("mesh-active-selection-card")).toBeVisible();
        await expect(page.getByTestId("mesh-active-selection-card-workspace")).toHaveText("Mesh");
        await expect(page.getByTestId("mesh-active-selection-card-type")).toHaveText("Edge");
        await expect(page.getByTestId("mesh-active-selection-card-id")).toContainText(/Edge \d+-\d+/);
        await expect(page.getByTestId("mesh-active-selection-card-actions")).toContainText("Split, Collapse, Bevel");
        await expect(page.getByTestId("mesh-selection-event-toast")).toContainText(/Selected edge \d+-\d+/);
      },
    });
    await expect(page.getByTestId("mesh-active-selection-confirmation")).toContainText(
      /Done: Edge \d+-\d+ -> split vertex \(\+1V, \+2F\)/
    );
    await expect(page.getByTestId("mesh-active-selection-last-command")).toBeVisible();
    await expect(page.getByTestId("mesh-active-selection-undo-last")).toBeVisible();
    await expect(page.getByTestId("mesh-context-last-command")).toContainText(/Last: Edge \d+-\d+ split/);
    await page.getByTestId("mesh-active-selection-card-clear").click();
    await expect(page.getByTestId("mesh-selection-event-toast")).toContainText("Selection cleared");
    await expect(page.getByTestId("mesh-active-selection-card-id")).toContainText(
      "Click an edge to enable Split / Collapse / Bevel"
    );
    await expect(page.getByTestId("mesh-context-toolbar")).toContainText("Click an edge to enable Split / Collapse / Bevel");
    await page.getByTestId("mesh-context-open-history").click();
  } else {
    const operation = await firstVisible(page.getByRole("button", { name: operationButtonName, exact: true }));
    await operation.click();
  }
  await expect(page.getByText(expectedHistoryName).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Topology history/i).first()).toBeVisible();
}

test.describe("Mesh topology persistence and handoff", () => {
  test("keeps Mesh Object mode clear and promotes through Apply preview", async () => {
    test.setTimeout(120_000);
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;

    try {
      ctx = await launchApp();
      const { page } = ctx;

      await runContextualObjectModeCheck({
        page,
        workspace: "mesh",
        pickMode: "auto",
        openWorkspace: async () => {
          await openMeshGallery(page);
          await page.getByTestId("mesh-preset-card-mesh_box").click();
          await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) =>
            button.click()
          );
        },
        chipLabel: "Mesh Object",
        selectionLabel: /Selected mesh object:/,
        preview: "Preview: promote selected mesh to Geometry",
        viewportPreview: "Viewport preview: promote selected mesh to Geometry",
        wholeObjectBadgeTestId: "mesh-object-selection-glow",
        wholeObjectBadgeLabel: "Whole mesh selected",
        actionExpectations: [
          { testId: "mesh-context-promote-mesh-object", label: "Promote to Geometry", enabled: true },
          { testId: "mesh-context-save-edited", label: "Save edited" },
          { testId: "mesh-context-mesh-source", label: "Mesh source" },
        ],
        forbiddenSelectionHints: ["Click a face to enable Subdivide", "Click an edge to enable Split / Collapse / Bevel"],
      });

      await page.getByTestId("mesh-context-apply-preview").click();
      await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-open-object")).toBeVisible({ timeout: 15_000 });
    } finally {
      await closeApp(ctx);
    }
  });

  test("keeps Mesh and Geometry object-mode command strips in parity", async () => {
    test.setTimeout(150_000);
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;

    try {
      ctx = await launchApp();
      const { page } = ctx;

      await runContextualObjectModeCheck({
        page,
        workspace: "mesh",
        pickMode: "auto",
        openWorkspace: async () => {
          await openMeshGallery(page);
          await page.getByTestId("mesh-preset-card-mesh_box").click();
          await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) =>
            button.click()
          );
        },
        chipLabel: "Mesh Object",
        selectionLabel: /Selected mesh object:/,
        preview: "Preview: promote selected mesh to Geometry",
        viewportPreview: "Viewport preview: promote selected mesh to Geometry",
        wholeObjectBadgeTestId: "mesh-object-selection-glow",
        wholeObjectBadgeLabel: "Whole mesh selected",
        actionExpectations: [
          { testId: "mesh-context-promote-mesh-object", label: "Promote to Geometry", enabled: true },
          { testId: "mesh-context-save-edited", label: "Save edited" },
          { testId: "mesh-context-mesh-source", label: "Mesh source" },
        ],
        forbiddenSelectionHints: ["Click a face to enable Subdivide", "Click an edge to enable Split / Collapse / Bevel"],
      });

      await runContextualObjectModeCheck({
        page,
        workspace: "geometry",
        pickMode: "object",
        openWorkspace: async () => {
          await openGeometryBoxForObjectMode(page);
        },
        selectObject: async () => {
          await commitGeometryEntityPick(page, "object");
        },
        chipLabel: "Geometry Object",
        selectionLabel: /Selected geometry object:/i,
        preview: "Preview: open selected Geometry object details",
        viewportPreview: "Viewport preview: open selected Geometry object details",
        wholeObjectBadgeTestId: "geometry-object-selection-glow",
        wholeObjectBadgeLabel: "Whole Geometry object selected",
        actionExpectations: [
          { testId: "geometry-context-open-object", label: "Open Object Details", enabled: true },
          { testId: "geometry-context-transform", label: "Transform" },
          { testId: "geometry-context-history", label: "History" },
        ],
        forbiddenSelectionHints: ["Click a face to enable Extrude", "Click an edge to enable Split / Mirror / Offset"],
      });
    } finally {
      await closeApp(ctx);
    }
  });

  test("keeps Mesh and Geometry face-edge entity modes in parity", async () => {
    test.setTimeout(180_000);
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;

    try {
      ctx = await launchApp();
      const { page } = ctx;

      await runContextualEntityModeCheck({
        page,
        workspace: "mesh",
        pickMode: "face",
        openWorkspace: async () => {
          await openMeshGallery(page);
          await page.getByTestId("mesh-preset-card-mesh_box").click();
          await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) =>
            button.click()
          );
        },
        pickEntity: async () => {
          await selectDeterministicMeshFace(page);
        },
        selectionLabel: /Selected face \d+/,
        preview: /Preview: Face \d+ -> subdivide/,
        viewportPreview: /Viewport preview: Face \d+ -> subdivide/,
        cardType: "Face",
        cardId: /Face \d+/,
        cardActions: "Subdivide",
        actionExpectations: [{ testId: "mesh-context-subdivide-face", label: "Subdivide", enabled: true }],
      });

      await runContextualEntityModeCheck({
        page,
        workspace: "mesh",
        pickMode: "edge",
        pickEntity: async () => {
          await selectDeterministicMeshEdge(page);
        },
        selectionLabel: /Selected edge \d+-\d+/,
        preview: /Preview: Edge \d+-\d+ -> midpoint vertex/,
        viewportPreview: /Viewport preview: Edge \d+-\d+ -> midpoint vertex/,
        cardType: "Edge",
        cardId: /Edge \d+-\d+/,
        cardActions: "Split, Collapse, Bevel",
        actionExpectations: [
          { testId: "mesh-context-split-edge", label: "Split", enabled: true },
          { testId: "mesh-context-collapse-edge", label: "Collapse", enabled: true },
          { testId: "mesh-context-bevel-edge", label: "Bevel", enabled: true },
        ],
      });

      await runContextualEntityModeCheck({
        page,
        workspace: "geometry",
        pickMode: "face",
        openWorkspace: async () => {
          await openGeometryBoxForObjectMode(page);
        },
        pickEntity: async () => {
          await commitGeometryEntityPick(page, "face");
        },
        selectionLabel: /Selected face \d+/,
        preview: /Preview: Face \d+ -> extrude 0\.15/,
        viewportPreview: /Viewport preview: Face \d+ -> extrude 0\.15/,
        cardType: "Face",
        cardId: /Face \d+/,
        cardActions: "Extrude, Inset, Delete",
        actionExpectations: [
          { testId: "geometry-context-extrude-face", label: "Extrude", enabled: true },
          { testId: "geometry-context-inset-face", label: "Inset", enabled: true },
          { testId: "geometry-context-delete-face", label: "Delete", enabled: true },
        ],
      });

      await runContextualEntityModeCheck({
        page,
        workspace: "geometry",
        pickMode: "edge",
        pickEntity: async () => {
          await commitGeometryEntityPick(page, "edge");
        },
        selectionLabel: /Selected edge \d+-\d+/,
        preview: /Preview: Edge \d+-\d+ -> midpoint vertex/,
        viewportPreview: /Viewport preview: Edge \d+-\d+ -> midpoint vertex/,
        cardType: "Edge",
        cardId: /Edge \d+-\d+/,
        cardActions: "Split, Mirror, Offset",
        actionExpectations: [
          { testId: "geometry-context-split-edge", label: "Split", enabled: true },
          { testId: "geometry-context-mirror-edge", label: "Mirror", enabled: true },
          { testId: "geometry-context-offset-edge", label: "Offset", enabled: true },
        ],
      });
    } finally {
      await closeApp(ctx);
    }
  });

  test("shows an explicit empty topology handoff card for unedited Mesh promotions", async () => {
    test.setTimeout(120_000);
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;

    try {
      ctx = await launchApp();
      const { page } = ctx;

      await openMeshGallery(page);
      await page.getByTestId("mesh-topology-preset-card-topology_demo_bevel_edge").click();
      await firstVisible(page.getByRole("button", { name: "Promote", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Converted to detached Mesh object/i).first()).toBeVisible({ timeout: 15_000 });
      await firstVisible(page.getByRole("button", { name: "Close", exact: true })).then((button) => button.click());
      await expect(page.getByTestId("geometry-right-open-object")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("geometry-right-open-object").click();

      await expect(page.getByTestId("geometry-mesh-topology-source-history")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/No Mesh topology edits were recorded before promotion/i).first()).toBeVisible();
      await expect(page.getByText(/0 steps?/i).first()).toBeVisible();
      await page.getByTestId("geometry-open-mesh-source").click();
      await expect(page.getByText(/Mesh \/ Workspace/i).first()).toBeVisible();
      await expect(page.getByText(/Selected: Demo: bevel edge mesh object \(Mesh source\)/i).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await closeApp(ctx);
    }
  });

  test("keeps topology history, saved examples, preview modes, and Geometry handoff", async () => {
    test.setTimeout(180_000);
    let ctx: { app: ElectronApplication; page: Page; profileDir: string } | null = null;

    try {
      ctx = await launchApp();
      const { page } = ctx;

      await runTopologyDemo(page, "topology_demo_split_edge", "Split Edge", /Split edge/i);
      await firstVisible(page.getByRole("button", { name: "Preview Before", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Previewing Before mesh: Split edge/i).first()).toBeVisible();
      await firstVisible(page.getByRole("button", { name: "Preview After", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Previewing After mesh: Split edge/i).first()).toBeVisible();

      await firstVisible(page.getByLabel("Mesh topology example name")).then((field) => field.fill("Saved Split Demo"));
      await firstVisible(page.getByRole("button", { name: "Save edited", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Saved edited Mesh example: Saved Split Demo/i).first()).toBeVisible();

      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Topology history/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Split edge/i).first()).toBeVisible();

      await openMeshGallery(page);
      await expect(page.getByRole("button", { name: /Saved Split Demo/i }).first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /Saved Split Demo/i }).first().click();
      await expect(page.getByText(/Opened saved Mesh example: Saved Split Demo/i).first()).toBeVisible();

      await openMeshGallery(page);
      await page.getByTestId("mesh-preset-card-mesh_knot").click();
      await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) => button.click());
      await expect(page.getByText(/No Mesh topology edits yet/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Last result: none/i).first()).toBeVisible();
      await expect(page.getByTestId("mesh-geometry-roundtrip-card")).toHaveCount(0);

      await openMeshGallery(page);
      await expect(page.getByTestId("mesh-topology-preset-card-topology_roundtrip_box_subdivide")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("mesh-topology-preset-card-topology_roundtrip_cube_split")).toBeVisible();
      await expect(page.getByTestId("mesh-topology-preset-card-topology_roundtrip_cube_bevel")).toBeVisible();
      await expect(page.getByTestId("mesh-gallery-roundtrip-full-demo-topology_roundtrip_box_subdivide")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("mesh-gallery-roundtrip-full-demo-topology_roundtrip_box_subdivide").click();
      await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-roundtrip-demo-banner")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-roundtrip-demo-banner")).toContainText(/Round-trip demo complete/i);
      await expect(page.getByTestId("geometry-roundtrip-demo-banner")).toContainText(
        /Mesh preset -> topology edit -> Geometry object/
      );
      await expect(page.getByTestId("geometry-roundtrip-demo-banner")).toContainText(
        /V \d+ -> \d+, F \d+ -> \d+/
      );
      await expect(page.getByTestId("geometry-roundtrip-demo-checklist")).toContainText(/Loaded preset/);
      await expect(page.getByTestId("geometry-roundtrip-demo-checklist")).toContainText(/Applied topology edit/);
      await expect(page.getByTestId("geometry-roundtrip-demo-checklist")).toContainText(/Promoted to Geometry/);
      await expect(page.getByTestId("geometry-roundtrip-demo-checklist")).toContainText(/Linked source visible/);
      await expect(page.getByTestId("geometry-roundtrip-demo-replay")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-copy-summary")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-gallery")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-geometry")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-open-source")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-restore-before")).toBeEnabled();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-details")).toContainText(
        /Includes: mesh, topology history; no scene transform\/material/
      );
      await expect(page.getByTestId("geometry-roundtrip-demo-geometry-save-details")).toContainText(
        /Geometry preset includes object transform, material, mesh, and linked topology source/
      );
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Linked Mesh edit source/i);
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Latest: Face subdivide/i);
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Round-trip linked/i);
      await expect(await firstVisible(page.getByRole("checkbox", { name: "Wireframe", exact: true }))).toBeChecked();
      await page.getByTestId("geometry-roundtrip-demo-include-transform").check();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-details")).toContainText(
        /Includes: mesh, topology history, transform/
      );
      await page.getByTestId("geometry-roundtrip-demo-save-geometry").click();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-geometry")).toContainText(
        /Saved as Geometry preset/i,
        { timeout: 15_000 }
      );
      await page.getByTestId("geometry-roundtrip-demo-save-gallery").click();
      await expect(page.getByTestId("geometry-roundtrip-demo-save-gallery")).toContainText(/Saved as Gallery example/i, {
        timeout: 15_000,
      });
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await selectSection(page, "Geometry");
      await firstVisible(page.getByRole("button", { name: "1 Create", exact: true })).then((button) => button.click());
      await firstVisible(page.getByRole("button", { name: "Primitive", exact: true })).then((button) => button.click());
      await expect(page.getByTestId("geometry-create-object-preset-shortcuts")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-create-open-selected-object-details")).toBeVisible();
      await expect(page.getByTestId("geometry-create-object-preset-roundtrip-badge").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("geometry-create-object-preset-roundtrip-badge").first()).toContainText(
        /Saved from round-trip demo/i
      );
      await firstVisible(page.getByTestId("geometry-create-object-preset-apply")).then((button) => button.click());
      await page.getByTestId("geometry-restored-preset-card").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("geometry-restored-preset-card")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-restored-preset-card")).toContainText(/Restored Geometry preset/i);
      await expect(page.getByTestId("geometry-restored-preset-card")).toContainText(/Source topology step: Face subdivide/i);
      await expect(page.getByTestId("geometry-restored-preset-card")).toContainText(/Linked Mesh source and history restored/i);
      await expect(page.getByTestId("geometry-restored-preset-open-source")).toBeEnabled();
      await expect(page.getByTestId("geometry-restored-preset-open-history")).toBeEnabled();
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Latest: Face subdivide/i);
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/history available/i);
      await openMeshGallery(page);
      await expect(page.getByRole("button", { name: /showcase/i }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/Includes: mesh, topology history, transform/i).first()).toBeVisible();

      await runTopologyDemo(page, "topology_demo_collapse_edge", "Collapse Edge", /Collapse edge/i);
      await runTopologyDemo(page, "topology_demo_bevel_edge", "Bevel Edge", /Bevel edge/i);

      await firstVisible(page.getByRole("button", { name: "Promote", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Demo: bevel edge \(bevel edge\)/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Converted to detached Mesh object/i).first()).toBeVisible({ timeout: 15_000 });
      await firstVisible(page.getByRole("button", { name: "Close", exact: true })).then((button) => button.click());
      await expect(page.getByTestId("geometry-right-open-object")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Linked Mesh edit source/i);
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Latest: Bevel edge/i);
      await expect(page.getByTestId("geometry-right-linked-mesh-source")).toContainText(/Source snapshot available/i);
      await expect(page.getByTestId("geometry-right-restore-mesh-before")).toBeEnabled();
      await expect(page.getByTestId("geometry-right-restore-mesh-after")).toBeEnabled();
      await page.getByTestId("geometry-right-open-object").click();
      await expect(page.getByTestId("geometry-mesh-topology-source-history")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Mesh topology source history/i).first()).toBeVisible();
      await expect(page.getByText(/Latest: Bevel edge/i).first()).toBeVisible();
      await expect(await firstVisible(page.getByRole("checkbox", { name: "Wireframe", exact: true }))).toBeChecked();
      await expect(page.getByTestId("geometry-restore-mesh-before")).toBeEnabled();
      await page.getByTestId("geometry-restore-mesh-before").click();
      await expect(page.getByText(/Mesh \/ Workspace/i).first()).toBeVisible();
      await expect(page.getByText(/Mesh source before/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("mesh-geometry-roundtrip-card")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("mesh-roundtrip-source-preview-banner")).toContainText(
        /Viewing source BEFORE Geometry update/,
        { timeout: 15_000 }
      );
      await expect(page.getByTestId("mesh-roundtrip-source-preview-banner")).toContainText(
        /Counts: \d+ vertices \/ \d+ faces/
      );
      await expect(page.getByTestId("mesh-roundtrip-source-preview-banner")).toContainText(/Latest topology step:/);
      await expect(page.getByTestId("mesh-roundtrip-update-original")).toContainText(
        /Apply this state to Geometry Object/
      );
      await expect(page.getByTestId("mesh-roundtrip-update-original")).toBeEnabled();
      await page.getByTestId("mesh-roundtrip-update-original").click();
      await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("geometry-right-open-object")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("geometry-right-open-object").click();
      await expect(page.getByTestId("geometry-roundtrip-update-feedback")).toContainText(
        /Mesh edits applied to Geometry: V \d+ -> \d+, F \d+ -> \d+/,
        { timeout: 15_000 }
      );
      await expect(page.getByText(/Latest Mesh topology step:/i).first()).toBeVisible();
      await firstVisible(page.getByRole("button", { name: "Open History", exact: true })).then((button) => button.click());
      await expect(page.getByText(/Mesh round-trip update/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Mesh topology edit/i).first()).toBeVisible();
    } finally {
      await closeApp(ctx);
    }
  });
});
