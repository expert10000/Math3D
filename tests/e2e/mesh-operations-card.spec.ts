import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;

type MeshBenchmarkE2EHook = {
  loadBenchmarkModel: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

type MeshOperationE2EHook = {
  run: (
    operation:
      | "clean-normals"
      | "cgal-validate"
      | "cgal-repair"
      | "cgal-repair-validate"
      | "cgal-remesh"
      | "decimate"
      | "smooth"
      | "implicit-preview"
      | "implicit-mesh"
      | "boolean-union"
      | "boolean-difference"
      | "boolean-intersection"
      | "boolean-imprint",
    options?: {
      implicitExpr?: string;
      resolution?: number;
      targetFaces?: number;
      targetEdge?: number;
      targetEdgeLength?: number;
      iterations?: number;
      preserveSharpEdges?: boolean;
      booleanStrategy?: "auto" | "fast" | "robust";
      validationPass?: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
};

async function firstVisible(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("No visible locator match found.");
}

async function selectSection(page: Page, label: (typeof sectionLabels)[number]): Promise<void> {
  const button = await firstVisible(page.getByRole("button", { name: label, exact: true }));
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

async function loadBenchmarkModel(page: Page, id: string): Promise<void> {
  await page.waitForFunction(() => !!(window as Window & { __MATH3D_E2E_MESH_BENCHMARK__?: MeshBenchmarkE2EHook }).__MATH3D_E2E_MESH_BENCHMARK__, {
    timeout: 15_000,
  });
  const result = await page.evaluate(async (benchmarkId) => {
    const hook = (window as Window & { __MATH3D_E2E_MESH_BENCHMARK__?: MeshBenchmarkE2EHook }).__MATH3D_E2E_MESH_BENCHMARK__;
    if (!hook) return { ok: false, error: "Mesh benchmark E2E hook unavailable." };
    return hook.loadBenchmarkModel(benchmarkId);
  }, id);
  expect(result.ok, result.error).toBeTruthy();
}

async function openWorkspaceOperationsCard(page: Page): Promise<Locator> {
  await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) => button.click());
  const card = page.getByTestId("mesh-workspace-operation-registry").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

async function expectFullViewerToRenderMesh(viewer: Locator): Promise<void> {
  const image = PNG.sync.read(await viewer.screenshot());
  const x0 = Math.floor(image.width * 0.2);
  const x1 = Math.ceil(image.width * 0.8);
  const y0 = Math.floor(image.height * 0.25);
  const y1 = Math.ceil(image.height * 0.85);
  const total = Math.max(1, (x1 - x0) * (y1 - y0));
  let meshPixels = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      if (r < 220 || g < 220 || b < 220) meshPixels += 1;
    }
  }

  expect(meshPixels / total, "Full viewer central canvas should contain rendered mesh pixels.").toBeGreaterThan(0.003);
}

async function expectPrimaryViewerToRenderMesh(viewer: Locator): Promise<void> {
  const image = PNG.sync.read(await viewer.screenshot());
  // Ignore the viewport's toolbar and status chips: only the central canvas
  // should satisfy this assertion.
  const x0 = Math.floor(image.width * 0.2);
  const x1 = Math.ceil(image.width * 0.8);
  const y0 = Math.floor(image.height * 0.28);
  const y1 = Math.ceil(image.height * 0.85);
  const colors = new Map<number, number>();

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const offset = (y * image.width + x) * 4;
      const bin =
        ((image.data[offset] >> 4) << 8) |
        ((image.data[offset + 1] >> 4) << 4) |
        (image.data[offset + 2] >> 4);
      colors.set(bin, (colors.get(bin) ?? 0) + 1);
    }
  }

  const [backgroundBin] = [...colors.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0];
  const background = [(backgroundBin >> 8) & 0xf, (backgroundBin >> 4) & 0xf, backgroundBin & 0xf];
  let meshPixels = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      const distance =
        Math.abs((image.data[offset] >> 4) - background[0]) +
        Math.abs((image.data[offset + 1] >> 4) - background[1]) +
        Math.abs((image.data[offset + 2] >> 4) - background[2]);
      if (distance >= 3) meshPixels += 1;
      total += 1;
    }
  }

  expect(meshPixels / Math.max(1, total), "Fast viewer should contain a framed mesh, not a blank canvas.").toBeGreaterThan(0.002);
}

async function visibleMeshOperationsCard(page: Page): Promise<Locator> {
  const card = await firstVisible(page.locator('[data-testid$="operation-registry"]'));
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

async function applyManagedMeshPreset(card: Locator, presetId: string): Promise<void> {
  const preset = card.getByTestId(`mesh-workspace-operation-registry-preset-${presetId}`);
  if (!(await preset.isVisible().catch(() => false))) {
    await card.getByTestId("mesh-workspace-operation-registry-manage-presets").click();
  }
  await expect(preset).toBeVisible();
  await preset.click();
}

async function visibleImplicitWorkflowCta(page: Page): Promise<Locator> {
  const cta = await firstVisible(page.getByTestId("implicit-mesh-workflow-cta"));
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible({ timeout: 15_000 });
  return cta;
}

async function runMeshOperationHook(
  page: Page,
  operation: Parameters<MeshOperationE2EHook["run"]>[0],
  options?: Parameters<MeshOperationE2EHook["run"]>[1]
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(
    async ({ operation: operationName, options: operationOptions }) => {
      const hook = (window as Window & { __MATH3D_E2E_MESH_OPERATION__?: MeshOperationE2EHook }).__MATH3D_E2E_MESH_OPERATION__;
      if (!hook) return { ok: false, error: "Mesh operation E2E hook unavailable." };
      return hook.run(operationName, operationOptions);
    },
    { operation, options }
  );
}

async function expectLastOperation(card: Locator, label: RegExp): Promise<void> {
  const lastResult = await firstVisible(card.locator('[data-testid$="-last-result"]'));
  await expect(lastResult).toContainText(label, { timeout: 90_000 });
  await expect(lastResult).toContainText(/success|warning/i, { timeout: 90_000 });
  await expect(lastResult).toContainText(/Vertices:/i);
  await expect(lastResult).toContainText(/Triangles:/i);
}

async function runRobustCutterPresetFullFlow(
  page: Page,
  presetId: "benchy-cutter-boolean" | "armadillo-robust-boolean",
  loadedMesh: RegExp,
  cutterName: RegExp,
  resultName: RegExp
): Promise<void> {
  await selectSection(page, "Mesh");
  const card = await openWorkspaceOperationsCard(page);
  await applyManagedMeshPreset(card, presetId);
  await expect(page.getByText(loadedMesh).first()).toBeVisible({ timeout: 45_000 });
  await expect(card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference")).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toContainText(cutterName, {
    timeout: 15_000,
  });
  const robustStrategy = card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust");
  if (!(await robustStrategy.isEnabled())) {
    test.skip(true, "CGAL worker is not available in this environment.");
  }
  await expect(robustStrategy).toHaveAttribute("aria-pressed", "true");

  await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
  await card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate").click();
  await expectLastOperation(card, /Validate mesh/i);

  await card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
  const validationWarning = card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning");
  const validationText = (await validationWarning.textContent({ timeout: 15_000 })) ?? "";
  if (!/validation passed/i.test(validationText)) {
    await expect(validationWarning).toContainText(/repair|needs/i);
    await card.getByTestId("mesh-workspace-operation-registry-boolean-repair-validate-active").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair-validate")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(card.getByTestId("mesh-workspace-operation-registry-repair-max-hole-edges")).toHaveValue("12");
    await card.getByTestId("mesh-workspace-operation-registry-run-cgal-repair-validate").click();
    await expectLastOperation(card, /Repair \+ Validate/i);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
  }
  await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
    "validation passed",
    { timeout: 15_000 }
  );
  await card.getByTestId("mesh-workspace-operation-registry-run-boolean-difference").click();
  await expectLastOperation(card, /Boolean difference/i);
  await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/Robust method/i);
  await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/native CGAL backend/i, {
    timeout: 120_000,
  });
  await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/CGAL corefine/i);

  const reviewToolbar = page.getByTestId("mesh-boolean-review-toolbar");
  await expect(reviewToolbar).toBeVisible({ timeout: 15_000 });
  await reviewToolbar.getByTestId("mesh-boolean-review-validate-result").click();
  await expectLastOperation(card, /Validate mesh/i);
  await expect(card.getByTestId("mesh-operation-boolean-validation-card")).toContainText(/Boolean result validation/i);

  await card.getByTestId("mesh-workspace-operation-registry-open-result-in-geometry").click();
  await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(resultName).first()).toBeVisible({ timeout: 45_000 });
}

test.describe("Mesh Operations card", () => {
  test.setTimeout(240_000);

  let ctx: LaunchedSurfaceApp | null = null;

  test.afterEach(async () => {
    await closeSurfaceApp(ctx);
    ctx = null;
  });

  test("expands rows, changes parameters, and records a Decimate run", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "3dbenchy");

    const card = await openWorkspaceOperationsCard(page);
    const leftTabs = page.getByTestId("mesh-workspace-left-tabs");
    await expect(leftTabs).toBeVisible();
    await leftTabs.getByTestId("mesh-workspace-left-tab-topology").click();
    await expect(page.getByText("Mesh topology editing").first()).toBeVisible();
    await expect(card).toHaveCount(0);
    await leftTabs.getByTestId("mesh-workspace-left-tab-scene").click();
    const outliner = page.getByTestId("mesh-workspace-scene-outliner");
    await expect(outliner).toBeVisible();
    await expect(outliner.getByRole("button", { name: /Meshes \(1\)/ })).toBeVisible();
    await expect(outliner.getByRole("button", { name: /Geometry links \(0\)/ })).toBeVisible();
    await expect(page.getByTestId("mesh-workspace-open-mesh-file")).not.toBeVisible();
    await outliner.getByRole("button", { name: "+ Add" }).click();
    await expect(outliner.getByRole("menuitem", { name: "Import mesh..." })).toBeVisible();
    await expect(outliner.getByRole("menuitem", { name: "Open benchmark model..." })).toBeVisible();
    await outliner.getByRole("button", { name: "+ Add" }).click();
    const activeMeshRow = outliner.getByTestId("mesh-workspace-outliner-entry-workspace:active");
    await expect(activeMeshRow).toBeVisible();
    await expect(activeMeshRow).toHaveAttribute("draggable", "true");
    await activeMeshRow.getByRole("button", { name: /Hide / }).click();
    await expect(activeMeshRow.getByRole("button", { name: /Show / })).toBeVisible();
    await activeMeshRow.getByRole("button", { name: /Show / }).click();
    await activeMeshRow.getByRole("button", { name: /Actions for / }).click();
    await expect(outliner.getByRole("menuitem", { name: "Frame active mesh" })).toBeVisible();
    await outliner.getByRole("menuitem", { name: "Frame active mesh" }).click();
    await outliner.getByRole("button", { name: "+ Add" }).click();
    await outliner.getByRole("menuitem", { name: "Create group..." }).click();
    await activeMeshRow.getByRole("button", { name: /Actions for / }).click();
    await outliner.getByRole("menuitem", { name: "Group 1" }).click();
    await expect(activeMeshRow).toContainText("Group 1");
    await outliner.getByRole("button", { name: "Isolate" }).click();
    await expect(outliner.getByRole("button", { name: "Restore" })).toBeVisible();
    await outliner.getByRole("button", { name: "Restore" }).click();
    await leftTabs.getByTestId("mesh-workspace-left-tab-operations").click();
    await expect(page.getByTestId("mesh-workspace-source-summary")).toBeVisible();
    await expect(page.getByTestId("mesh-workspace-import-controls")).not.toBeVisible();
    await expect(card).toBeVisible();
    for (const group of ["repair", "simplify", "smooth", "boolean", "implicit"]) {
      await expect(card.getByTestId(`mesh-workspace-operation-registry-group-${group}`)).toBeVisible();
    }
    await card.getByTestId("mesh-workspace-operation-registry-manage-presets").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-preset-armadillo-robust-boolean")).toBeVisible();
    await expect(card.getByTestId("mesh-workspace-operation-registry-preset-sphere-minus-box")).toBeVisible();
    await card.getByTestId("mesh-workspace-operation-registry-manage-presets").click();

    for (const preset of [
      "cgal-validate",
      "cgal-repair-memory",
      "cgal-repair-validate",
      "clean-normals",
      "sphere-minus-box",
      "decimate-3dbenchy",
      "smooth-bunny",
    ]) {
      await applyManagedMeshPreset(card, preset);
      await expect(card.locator('[data-testid*="-row-"][aria-expanded="true"]')).toBeVisible();
    }

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate")).toHaveText("Run Validate mesh");
    await expect(card).toContainText("Non-destructive validation");

    await card.getByTestId("mesh-workspace-operation-registry-row-clean-normals").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-clean-normals")).toHaveText("Run Clean normals");

    await card.getByTestId("mesh-workspace-operation-registry-row-decimate").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-decimate")).toHaveText("Run Decimate");
    const useTargetFaces = card.getByTestId("mesh-workspace-operation-registry-decimate-use-target-faces");
    if (!(await useTargetFaces.isChecked())) await useTargetFaces.check();
    await card.getByTestId("mesh-workspace-operation-registry-decimate-target-faces").fill("500");

    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-smooth")).toHaveText("Run Smooth");
    await card.getByTestId("mesh-workspace-operation-registry-smooth-iterations").fill("4");
    await card.getByTestId("mesh-workspace-operation-registry-smooth-passband").fill("0.12");

    await card.getByTestId("mesh-workspace-operation-registry-row-implicit-preview").click();
    await expect(card).toContainText("Open an implicit surface first");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-implicit-preview")).toBeDisabled();

    await card.getByTestId("mesh-workspace-operation-registry-row-implicit-mesh").click();
    await expect(card).toContainText("Open an implicit surface first");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-implicit-mesh")).toBeDisabled();

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair").click();
    await expect(card).toContainText("Conservative repair");
    await expect(card).toContainText("new in-memory mesh result");
    await expect(card.getByTestId("mesh-workspace-operation-registry-cgal-repair-output-derived")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-repair-remove-degenerate")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-repair-remove-duplicates")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-repair")).toHaveText("Run Repair mesh");

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair-validate").click();
    await expect(card).toContainText("Repair, then validate");
    await expect(card).toContainText("comparison card");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-repair-validate")).toHaveText("Run Repair + Validate");

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-remesh").click();
    await expect(card).toContainText("Worker remesh");
    await expect(card).toContainText("target length");
    await card.getByTestId("mesh-workspace-operation-registry-remesh-target-edge").fill("0.35");
    await card.getByTestId("mesh-workspace-operation-registry-remesh-iterations").fill("1");
    await expect(card.getByTestId("mesh-workspace-operation-registry-remesh-preserve-sharp")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-remesh")).toHaveText("Run Remesh");

    for (const operation of ["boolean-union", "boolean-difference", "boolean-intersection", "boolean-imprint"]) {
      await card.getByTestId(`mesh-workspace-operation-registry-row-${operation}`).click();
      await expect(card.getByTestId(`mesh-workspace-operation-registry-run-${operation}`)).toContainText(/^Run /);
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toBeVisible();
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-auto")).toBeVisible();
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-fast")).toBeVisible();
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust")).toBeVisible();
    }

    await card.getByTestId("mesh-workspace-operation-registry-row-decimate").click();
    const runDecimate = card.getByTestId("mesh-workspace-operation-registry-run-decimate");
    if (!(await runDecimate.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    const runResult = await runMeshOperationHook(page, "decimate");
    expect(runResult.ok, runResult.error).toBeTruthy();
    await expectLastOperation(card, /Decimate/i);
    const showResultDetails = card.getByTestId("mesh-workspace-operation-registry-show-result-details");
    await expect(showResultDetails).toBeEnabled();
    await showResultDetails.click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toBeFocused();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-presets")).toContainText(/Presets/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Inspector → History/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-undo-last-operation")).toHaveText("Undo");

    await page.getByTestId("mesh-inspector-tab-result").click();
    await expect(page.getByTestId("mesh-operation-result-card")).toContainText(/Decimate/i);
    await expect(page.getByTestId("mesh-last-operation-verdict")).toBeVisible();

    await card.getByTestId("mesh-workspace-operation-registry-save-current-preset").click();
    const managePresets = card.getByTestId("mesh-workspace-operation-registry-manage-presets");
    if ((await managePresets.getAttribute("aria-expanded")) !== "true") await managePresets.click();
    const savedPresets = card.getByTestId("mesh-workspace-operation-registry-saved-presets");
    await expect(savedPresets).toContainText(/Decimate preset/i);
    await expect(savedPresets.getByTestId("mesh-workspace-operation-registry-saved-preset").first()).toContainText(/Decimate/i);
    await savedPresets.getByRole("button", { name: "Use" }).first().click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-decimate")).toHaveAttribute("aria-expanded", "true");

    await page.getByTestId("mesh-inspector-tab-history").click();
    const inspectorHistory = page.getByTestId("mesh-inspector-history-card");
    await expect(inspectorHistory).toContainText(/Decimate/i);
    const provenanceGraph = page.getByTestId("mesh-operation-provenance-graph");
    await expect(provenanceGraph).toContainText(/Source/i);
    await expect(provenanceGraph).toContainText(/Decimate/i);
    await expect(inspectorHistory.getByRole("button", { name: "Preview before" }).first()).toBeDisabled();

    await leftTabs.getByTestId("mesh-workspace-left-tab-scene").click();
    await expect(outliner.getByText("Operation provenance")).toHaveCount(0);
    await outliner.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByTestId("mesh-inspector-tab-history")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-inspector-history-card")).toContainText(/Decimate/i);
  });

  test("loads a five-mesh workspace example with Geometry links ready for Boolean", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "3dbenchy");

    await openWorkspaceOperationsCard(page);
    const leftTabs = page.getByTestId("mesh-workspace-left-tabs");
    await leftTabs.getByTestId("mesh-workspace-left-tab-scene").click();
    const outliner = page.getByTestId("mesh-workspace-scene-outliner");
    await outliner.getByRole("button", { name: "+ Add" }).click();
    await outliner.getByTestId("mesh-workspace-load-test-scene-5").click();

    await expect(outliner.getByRole("button", { name: /Meshes \(1\)/ })).toBeVisible();
    await expect(outliner.getByRole("button", { name: /Geometry links \(4\)/ })).toBeVisible();
    await expect(outliner.getByTestId("mesh-workspace-boolean-slot-a")).toContainText(/Workspace Test Active/i);
    await expect(outliner.getByTestId("mesh-workspace-boolean-slot-b")).toContainText(/Workspace Test Cutter/i);
    const linkedRows = outliner.locator('[data-testid^="mesh-workspace-outliner-entry-workspace:geometry:"]');
    const firstLinkedOverlayScope = linkedRows.nth(0).locator("xpath=..");
    const activeOverlayScope = outliner.getByTestId("mesh-workspace-outliner-entry-workspace:active").locator("xpath=..");
    await linkedRows.nth(0).locator("button").first().click();
    await expect(firstLinkedOverlayScope.getByRole("button", { name: /^Object overlays \(/ })).toHaveAttribute("aria-expanded", "true");
    await expect(activeOverlayScope.getByRole("button", { name: /^Object overlays \(/ })).toHaveAttribute("aria-expanded", "false");
    const firstLinkedWireframe = firstLinkedOverlayScope.getByTestId(/mesh-workspace-entry-overlay-.*-wireframe/);
    await expect(firstLinkedWireframe.getByRole("button", { name: "Hide", exact: true })).toBeVisible();
    await firstLinkedWireframe.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(firstLinkedWireframe.getByRole("button", { name: "Show", exact: true })).toBeVisible();
    const secondLinkedOverlayScope = linkedRows.nth(1).locator("xpath=..");
    await secondLinkedOverlayScope.getByRole("button", { name: /^Object overlays \(/ }).click();
    await expect(secondLinkedOverlayScope.getByTestId(/mesh-workspace-entry-overlay-.*-wireframe/).getByRole("button", { name: "Show", exact: true })).toBeVisible();
    const openBoolean = outliner.getByRole("button", { name: "Open Boolean operation", exact: true });
    await expect(openBoolean).toBeVisible();
    const workspaceSummary = page.getByTestId("mesh-workspace-inspector-summary");
    await expect(workspaceSummary).toContainText("5 total · 4 linked Geometry");
    await expect(workspaceSummary).toContainText("1 selected");

    await openBoolean.click();
    const card = await openWorkspaceOperationsCard(page);
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference")).toHaveAttribute("aria-expanded", "true");

    await leftTabs.getByTestId("mesh-workspace-left-tab-snapshots").click();
    const snapshots = page.getByTestId("mesh-workspace-snapshots");
    await snapshots.getByRole("textbox", { name: "Workspace snapshot name" }).fill("Five mesh Boolean review");
    await snapshots.getByRole("button", { name: "Save snapshot", exact: true }).click();
    await expect(snapshots).toContainText("Five mesh Boolean review");
    await snapshots.getByRole("button", { name: "Restore", exact: true }).click();
  });

  test("selects an edge on the selected linked workspace mesh", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1", VITE_DEV_SERVER_URL: undefined });
    const { page } = ctx;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1700, 1100));
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "3dbenchy");
    await openWorkspaceOperationsCard(page);
    await page.getByTestId("mesh-workspace-left-tab-scene").click();
    const outliner = page.getByTestId("mesh-workspace-scene-outliner");
    await outliner.getByRole("button", { name: "+ Add" }).click();
    await outliner.getByTestId("mesh-workspace-load-test-scene-5").click();
    await page.getByTestId("mesh-viewer-quality-sharp").click();
    await expect(page.getByTestId("mesh-viewer-quality-sharp")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-context-pick-edge").click();
    await expect(page.getByTestId("mesh-workspace-left-tab-topology")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-context-pick-edge")).toHaveAttribute("aria-pressed", "true");
    const viewer = page.getByTestId("surface-primary-viewer");
    for (const name of ["Wireframe", "Bounding box", "Coordinates", "Gizmo", "Overlay controls"]) {
      const checkbox = viewer.getByRole("checkbox", { name, exact: true });
      if (await checkbox.count()) await checkbox.first().uncheck();
    }
    const canvas = viewer.locator("canvas").first();
    await expect(canvas).toBeVisible();
    // Locate a linked cyan mesh directly; no Outliner activation is required.
    let target = { x: 0, y: 0, count: 0 };
    await expect.poll(async () => {
      const png = PNG.sync.read(await canvas.screenshot());
      target = { x: 0, y: 0, count: 0 };
      for (let y = 0; y < png.height; y += 2) {
        for (let x = 0; x < png.width; x += 2) {
          const i = (y * png.width + x) * 4;
          const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
          if (x > png.width * 0.58 && y < png.height * 0.78 && g > 105 && b > 125 && b > r * 1.15 && g > r * 1.05) {
            target.x += x; target.y += y; target.count++;
          }
        }
      }
      if (target.count) {
        const box = (await canvas.boundingBox())!;
        target.x = box.x + target.x / target.count * box.width / png.width;
        target.y = box.y + target.y / target.count * box.height / png.height;
      }
      return target.count;
    }).toBeGreaterThan(100);
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    await expect(page.getByTestId("mesh-context-selection-label")).toContainText(/edge\s+\d+/i);
    await expect(viewer).toContainText(/Workspace test reference \d/i);
    await expect(page.getByRole("button", { name: "Split", exact: true })).toBeEnabled();
    await expect.poll(async () => {
      const png = PNG.sync.read(await canvas.screenshot());
      let highlighted = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
        if (r > 110 && b > 150 && r > b * 0.55 && g < b * 0.7) highlighted++;
      }
      return highlighted;
    }).toBeGreaterThan(20);
    await canvas.screenshot({ path: test.info().outputPath("linked-mesh-edge-highlight.png") });
    await page.getByTestId("mesh-workspace-left-tab-scene").click();
    await expect(page.getByTestId("mesh-context-pick-object")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-workspace-inspector-summary")).toContainText("5 total");
    await expect(page.getByTestId("mesh-workspace-inspector-summary")).toContainText("4 linked Geometry");
    await outliner.getByTitle("Open workspace tools and snapshots").click();
    await expect(outliner.getByTestId("mesh-workspace-boolean-slot-a")).toContainText(/Workspace Test Active/i);

    const secondReference = outliner.getByText("Workspace Test Reference 2", { exact: true }).first();
    await secondReference.click();
    await page.getByTestId("mesh-context-pick-edge").click();
    await expect(page.getByTestId("mesh-workspace-left-tab-topology")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-viewer-quality-performance").click();
    await expect(page.getByTestId("mesh-viewer-quality-performance")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-viewer-quality-sharp").click();
    await expect(page.getByTestId("mesh-viewer-quality-sharp")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-workspace-left-tab-scene").click();
    await expect(page.getByTestId("mesh-workspace-inspector-summary")).toContainText("5 total");
    await expect(page.getByTestId("mesh-workspace-inspector-summary")).toContainText("4 linked Geometry");
    expect(errors).toEqual([]);
  });

  test("Full button opens the complete Bunny, Armadillo, and Dragon viewers", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await ctx.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1400, 1200);
    });
    await page.waitForFunction(() => window.innerHeight >= 900, { timeout: 10_000 });
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    for (const [benchmark, expectedTriangles] of [
      ["stanford-bunny", /69\s*451 triangles/],
      ["armadillo", /99\s*976 triangles/],
      ["dragon-medium", /12_dragon_medium\.obj/i],
    ] as const) {
      await loadBenchmarkModel(page, benchmark);
      const fullButton = page.getByTestId("mesh-viewer-quality-sharp");
      await expect(fullButton).toBeVisible();
      await fullButton.click();

      const fullViewer = page.getByTestId("mesh-dedicated-full-viewer");
      await expect(fullViewer).toBeVisible();
      await expect(fullViewer).toContainText(expectedTriangles);
      await expect(fullViewer).toContainText(/ready in \d+ ms/i, { timeout: 30_000 });
      await expectFullViewerToRenderMesh(fullViewer);

      await fullViewer.getByRole("button", { name: "Back to Fast", exact: true }).click();
      await expect(fullViewer).toHaveCount(0);
    }
  });

  test("frames Dragon's Fast proxy on load and on demand", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await ctx.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1400, 1200);
    });
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "dragon-medium");

    const viewer = page.getByTestId("surface-primary-viewer");
    await expect(viewer).toBeVisible({ timeout: 45_000 });
    await expectPrimaryViewerToRenderMesh(viewer);

    const fitButton = await firstVisible(page.getByTestId("mesh-viewer-fit-mesh"));
    await fitButton.click();
    await expectPrimaryViewerToRenderMesh(viewer);
  });

  test("keeps Full selected for a large Bunny operation result", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "stanford-bunny");

    const smooth = await runMeshOperationHook(page, "smooth", { iterations: 2 });
    expect(smooth.ok, smooth.error).toBeTruthy();

    const fullButton = page.getByTestId("mesh-viewer-quality-sharp");
    await fullButton.click();
    await expect(fullButton).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1_500);
    await expect(fullButton).toHaveAttribute("aria-pressed", "true");
  });

  test("runs Smooth on Bunny and Armadillo through the shared operation layer", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await card.getByTestId("mesh-workspace-operation-registry-smooth-iterations").fill("3");
    await card.getByTestId("mesh-workspace-operation-registry-smooth-passband").fill("0.10");

    for (const benchmark of ["stanford-bunny", "armadillo"]) {
      await loadBenchmarkModel(page, benchmark);
      const result = await runMeshOperationHook(page, "smooth");
      expect(result.ok, `${benchmark}: ${result.error ?? "Smooth failed"}`).toBeTruthy();
      await expectLastOperation(card, /Smooth/i);
    }
  });

  test("runs Boolean and VTK implicit preview through the shared operation layer", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "cube-obj");

    const card = await openWorkspaceOperationsCard(page);

    for (const operation of ["boolean-union", "boolean-difference"] as const) {
      await card.getByTestId(`mesh-workspace-operation-registry-row-${operation}`).click();
      const result = await runMeshOperationHook(page, operation);
      expect(result.ok, `${operation}: ${result.error ?? "Boolean failed"}`).toBeTruthy();
      await expectLastOperation(card, new RegExp(operation === "boolean-union" ? "Boolean union" : "Boolean difference", "i"));
    }

    await card.getByTestId("mesh-workspace-operation-registry-row-implicit-preview").click();
    const preview = await runMeshOperationHook(page, "implicit-preview", {
      implicitExpr: "x*x + y*y + z*z - 1",
      resolution: 20,
      targetFaces: 1500,
    });
    expect(preview.ok, preview.error).toBeTruthy();
    await expectLastOperation(card, /Implicit preview/i);
  });

  test("prepares Boolean operands and routes the operation result from the real card", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    let card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "boolean-demo-pair");
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Boolean demo B/i).first()).toBeVisible({ timeout: 15_000 });
    await selectSection(page, "Mesh");
    card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-formula")).toContainText("Result = Active Mesh");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-chip-a")).toContainText("A:");
    await expect(card).toContainText("Auto/Robust needs a recent passing Validate result");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      "Run Validate first"
    );
    const openPair = card.getByTestId("mesh-workspace-operation-registry-open-boolean-demo-pair-empty");
    if (await openPair.isVisible().catch(() => false)) {
      await openPair.click();
      await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
      await selectSection(page, "Mesh");
      card = await openWorkspaceOperationsCard(page);
      await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    }
    await card.getByTestId("mesh-workspace-operation-registry-prepare-boolean-demo").click();
    await expect(card).toContainText("Boolean demo operands ready", { timeout: 15_000 });
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toContainText("Boolean demo B");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-chip-a")).toContainText("Boolean demo A");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-chip-b")).toContainText("Boolean demo B");

    await card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-fast").click();
    const runUnion = card.getByTestId("mesh-workspace-operation-registry-run-boolean-union");
    if (!(await runUnion.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    await runUnion.click();
    await expectLastOperation(card, /Boolean union/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Boolean union/i);

    await card.getByTestId("mesh-workspace-operation-registry-send-to-geometry").click();
    await selectSection(page, "Geometry");
    await expect(page.getByText(/mesh sent to geometry/i)).toBeVisible({ timeout: 15_000 });

    await selectSection(page, "Mesh");
    const cardAgain = await openWorkspaceOperationsCard(page);
    await cardAgain.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
    await cardAgain.getByTestId("mesh-workspace-operation-registry-boolean-strategy-fast").click();
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-boolean-formula")).toContainText(
      "Result = Active Mesh - Operand B"
    );
    await cardAgain.getByTestId("mesh-workspace-operation-registry-prepare-boolean-demo").click();
    await expect(cardAgain).toContainText("Boolean demo operands ready", { timeout: 15_000 });
    const swapOperands = cardAgain.getByTestId("mesh-workspace-operation-registry-swap-boolean-operands");
    await expect(swapOperands).toBeEnabled();
    await swapOperands.click();
    await expect(cardAgain).toContainText(/Swapped operands/i);
    const runDifference = cardAgain.getByTestId("mesh-workspace-operation-registry-run-boolean-difference");
    if (!(await runDifference.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    await runDifference.scrollIntoViewIfNeeded();
    await runDifference.click({ force: true });
    await expectLastOperation(cardAgain, /Boolean difference/i);
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Triangles:/);
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Boolean difference/i);
    const operandToggle = cardAgain.getByTestId("mesh-workspace-operation-registry-toggle-boolean-operands");
    if (await operandToggle.isVisible().catch(() => false)) {
      await operandToggle.click();
      await expect(operandToggle).toContainText(/Show cutter B|Hide cutter B/);
    }
    await cardAgain.getByTestId("mesh-workspace-operation-registry-open-result-in-geometry").click();
    await expect(page.getByText(/mesh sent to geometry/i)).toBeVisible({ timeout: 15_000 });
  });

  test("uses Geometry Boolean composer to preview and apply through MeshOperationRequest", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    let card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "boolean-demo-pair");
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Boolean demo B/i).first()).toBeVisible({ timeout: 15_000 });

    await selectSection(page, "Geometry");
    await page.getByTestId("geometry-workflow-step-transform").click();
    await page.getByText("Boolean operation composer").click();
    const composer = page.getByTestId("geometry-boolean-composer");
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await expect(composer).toContainText(/Operation/i);
    await expect(composer).toContainText(/Solver/i);
    await expect(composer).not.toContainText(/Send to Mesh Operations/i);
    await composer.getByTestId("geometry-boolean-composer-operation").selectOption("difference");
    await composer.getByTestId("geometry-boolean-composer-solver-fast").click();
    await expect(composer.getByTestId("geometry-boolean-composer-formula")).toContainText(/Result = .* - .*/);

    await composer.getByTestId("geometry-boolean-composer-preview").click();
    await expect(composer).toContainText(/Preview difference/i, { timeout: 30_000 });
    const apply = composer.getByTestId("geometry-boolean-composer-apply");
    if (!(await apply.isEnabled())) {
      test.skip(true, "Boolean apply is disabled in this environment.");
    }
    await apply.click();
    await expect(composer).toContainText(/Applied difference/i, { timeout: 90_000 });
    const review = composer.getByTestId("geometry-boolean-composer-review");
    await expect(review).toBeVisible({ timeout: 15_000 });
    await expect(review).toContainText(/Boolean result review/i);
    await expect(review).toContainText(/A/i);
    await expect(review).toContainText(/B/i);
    await expect(review).toContainText(/Result/i);
    await review.getByTestId("mesh-boolean-review-b-visibility").click();
    await expect(review).toContainText(/Hidden/i);
    await review.getByTestId("mesh-boolean-review-b-visibility").click();
    await review.getByTestId("mesh-boolean-review-result-select").dblclick();
    await review.getByTestId("geometry-boolean-composer-hide-cutter").click();
    await expect(composer).toContainText(/Boolean cutter B hidden/i);
    await review.getByTestId("geometry-boolean-composer-show-operands").click();
    await expect(composer).toContainText(/Boolean operands shown/i);
    const operandA = composer.getByTestId("geometry-boolean-composer-a");
    const operandB = composer.getByTestId("geometry-boolean-composer-b");
    const originalA = await operandA.inputValue();
    const originalB = await operandB.inputValue();
    await review.getByTestId("geometry-boolean-composer-review-swap-ab").click();
    await expect(operandA).toHaveValue(originalB);
    await expect(operandB).toHaveValue(originalA);
    await review.getByTestId("geometry-boolean-composer-show-result").click();
    await expect(operandA).toHaveValue(originalA);
    await expect(review.getByTestId("geometry-boolean-composer-validate-result")).toBeVisible();

    await selectSection(page, "Mesh");
    card = await openWorkspaceOperationsCard(page);
    await expectLastOperation(card, /Boolean difference/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Output: new-object/i);
  });

  test("blocks Robust CGAL boolean until validation passes, then runs difference", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    let card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "boolean-demo-pair");
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await selectSection(page, "Mesh");
    card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
    await card.getByTestId("mesh-workspace-operation-registry-prepare-boolean-demo").click();
    await expect(card).toContainText("Boolean demo operands ready", { timeout: 15_000 });

    const robustStrategy = card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust");
    if (!(await robustStrategy.isEnabled())) {
      test.skip(true, "CGAL worker is not available in this environment.");
    }
    await robustStrategy.click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      "Run Validate first"
    );
    await card.getByTestId("mesh-workspace-operation-registry-run-boolean-difference").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Run Validate first/i, {
      timeout: 60_000,
    });
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/error/i);

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    await card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate").click();
    await expectLastOperation(card, /Validate mesh/i);

    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
    await card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      "validation passed"
    );
    await card.getByTestId("mesh-workspace-operation-registry-run-boolean-difference").click();
    await expectLastOperation(card, /Boolean difference/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Method: Robust/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/native CGAL backend/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/CGAL corefine/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/A: Boolean demo A/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/B: Boolean demo B/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/Result: Boolean demo A/i);
    await page.getByTestId("mesh-inspector-tab-history").click();
    const booleanProvenance = page.getByTestId("mesh-operation-provenance-graph");
    const booleanNode = booleanProvenance.getByRole("button", { name: /Boolean difference/i }).last();
    await expect(booleanNode).toHaveAttribute("data-parent-count", "1");
    await expect(booleanNode).toContainText(/Inputs: Boolean demo A \+ Boolean demo B/i);
    const reviewCard = card.getByTestId("mesh-operation-boolean-card");
    await reviewCard.getByTestId("mesh-boolean-review-b-visibility").click();
    await expect(reviewCard).toContainText(/Hidden/i);
    await reviewCard.getByTestId("mesh-boolean-review-b-visibility").click();
    await reviewCard.getByTestId("mesh-boolean-review-result-select").click();
    await reviewCard.getByTestId("mesh-boolean-review-b-select").dblclick();
    const reviewToolbar = page.getByTestId("mesh-boolean-review-toolbar");
    await expect(reviewToolbar).toBeVisible({ timeout: 15_000 });
    await expect(reviewToolbar).toContainText(/Boolean Review/i);
    await expect(reviewToolbar).toContainText(/Viewport mode/i);
    await expect(reviewToolbar).toContainText(/Mesh Editing/i);
    await expect(reviewToolbar.getByTestId("mesh-boolean-review-isolate-b")).toHaveAttribute("aria-pressed", "true");
    await reviewToolbar.getByTestId("mesh-boolean-review-isolate-b").click();
    await expect(reviewToolbar.getByTestId("mesh-boolean-review-isolate-b")).toHaveAttribute("aria-pressed", "true");
    await reviewToolbar.getByTestId("mesh-boolean-review-isolate-all").click();
    await expect(reviewToolbar.getByTestId("mesh-boolean-review-isolate-all")).toHaveAttribute("aria-pressed", "true");

    const cutterToggle = card.getByTestId("mesh-workspace-operation-registry-toggle-boolean-operands");
    if (await cutterToggle.isVisible().catch(() => false)) {
      await cutterToggle.click();
      await expect(cutterToggle).toContainText(/Show cutter B|Hide cutter B/);
    }
    await reviewToolbar.getByTestId("mesh-boolean-review-validate-result").click();
    await expectLastOperation(card, /Validate mesh/i);
    const validationCard = card.getByTestId("mesh-operation-boolean-validation-card");
    await expect(validationCard).toContainText(/Boolean result validation/i);
    await expect(validationCard.getByTestId("mesh-operation-boolean-validation-repair-result")).toBeEnabled();
    await expect(validationCard.getByTestId("mesh-operation-boolean-validation-use-as-a")).toBeEnabled();
    await expect(validationCard.getByTestId("mesh-operation-boolean-validation-use-as-b")).toBeEnabled();
    await expect(validationCard.getByTestId("mesh-operation-boolean-validation-show-problems")).toBeEnabled();
    await expect(validationCard.getByTestId("mesh-operation-boolean-validation-open-full")).toBeEnabled();
    await reviewToolbar.getByTestId("mesh-boolean-review-keep-result").click();
    await expect(page.getByTestId("mesh-boolean-review-toolbar")).toHaveCount(0);
  });

  test("runs Sphere minus box robust preset, validates result, and opens it in Geometry", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "sphere-minus-box");
    await expect(page.getByText(/Sphere solid/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toContainText(/Sphere cutter box/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    await card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate").click();
    await expectLastOperation(card, /Validate mesh/i);

    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      "validation passed"
    );
    await card.getByTestId("mesh-workspace-operation-registry-run-boolean-difference").click();
    await expectLastOperation(card, /Boolean difference/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/Robust method/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/native CGAL backend/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/A: Sphere solid/i);
    await expect(card.getByTestId("mesh-operation-boolean-card")).toContainText(/B: Sphere cutter box/i);

    const reviewToolbar = page.getByTestId("mesh-boolean-review-toolbar");
    await expect(reviewToolbar).toBeVisible({ timeout: 15_000 });
    await reviewToolbar.getByTestId("mesh-boolean-review-validate-result").click();
    await expectLastOperation(card, /Validate mesh/i);
    await expect(card.getByTestId("mesh-operation-boolean-validation-card")).toContainText(/Boolean result validation/i);

    await card.getByTestId("mesh-workspace-operation-registry-open-result-in-geometry").click();
    await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sphere solid \(Boolean difference\)/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("opens the implicit sphere preset from Mesh Operations and runs preview", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "boolean-demo-pair");
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await selectSection(page, "Mesh");
    const meshCard = await openWorkspaceOperationsCard(page);
    await meshCard.getByTestId("mesh-workspace-operation-registry-row-implicit-preview").click();
    await expect(meshCard.getByTestId("mesh-workspace-operation-registry-run-implicit-preview")).toBeDisabled();
    await meshCard.getByTestId("mesh-workspace-operation-registry-preset-implicit-sphere-mesh").click();
    await expect(page.getByText(/Surfaces \/ Implicit \/ Level Set \/ Sphere/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Selected: Boolean demo A/i)).toHaveCount(0);
    const cta = await visibleImplicitWorkflowCta(page);
    await expect(cta).toContainText(/Run Robust Implicit Mesh/i);
    await cta.getByTestId("implicit-mesh-workflow-back-operations").click();
    const returnedCard = await visibleMeshOperationsCard(page);
    await expect(returnedCard.getByRole("button", { name: "Run Implicit mesh" })).toBeVisible({ timeout: 15_000 });
  });

  test("runs CGAL implicit mesh through the shared operation layer when available", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-preset-implicit-sphere-mesh").click();
    const cta = await visibleImplicitWorkflowCta(page);
    await cta.getByTestId("implicit-mesh-workflow-back-operations").click();
    const focusedCard = await visibleMeshOperationsCard(page);
    await expect(focusedCard.getByRole("button", { name: "Run Implicit mesh" })).toBeVisible({ timeout: 15_000 });

    const cgal = await runMeshOperationHook(page, "implicit-mesh", {
      implicitExpr: "x*x + y*y + z*z - 1",
      targetEdge: 0.45,
    });
    if (!cgal.ok && /unavailable|not available|Python worker|CGAL/i.test(cgal.error ?? "")) {
      test.skip(true, `CGAL worker unavailable: ${cgal.error}`);
    }
    expect(cgal.ok, cgal.error).toBeTruthy();
    await expectLastOperation(focusedCard, /Implicit mesh/i);
    await expect(focusedCard.locator('[data-testid$="-last-result"]')).toContainText(/Output: new-object/i);
    await expect(focusedCard.locator('[data-testid$="-show-result-details"]')).toBeEnabled();
    await expect(focusedCard.locator('[data-testid$="-send-to-geometry"]')).toBeEnabled();
  });

  test("runs CGAL mesh validation through the shared operation layer when available", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "cube-obj");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    const validate = await runMeshOperationHook(page, "cgal-validate");
    if (!validate.ok && /unavailable|not available|Python worker|CGAL/i.test(validate.error ?? "")) {
      test.skip(true, `CGAL worker unavailable: ${validate.error}`);
    }
    expect(validate.ok, validate.error).toBeTruthy();
    await expectLastOperation(card, /Validate mesh/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Watertight:/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Manifold:/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Ready for robust operations|Needs repair|Needs review/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Boundary edges/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Non-manifold edges/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Self intersections/i);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      /validation passed|needs repair/i
    );
  });

  test("loads Bunny validation preset and reports open boundary edges", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "validate-bunny");
    await expect(page.getByText(/08_stanford_bunny\.obj/i).first()).toBeVisible({
      timeout: 20_000,
    });
    const runValidate = card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate");
    await expect(runValidate).toHaveText("Run Validate mesh");
    await expect(runValidate).toBeEnabled({ timeout: 60_000 });
    await runValidate.click();
    await expectLastOperation(card, /Validate mesh/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Needs repair|Needs review/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Boundary edges/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Watertight: no/i);
  });

  test("loads Bunny repair preset and runs repair plus validation", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "repair-bunny");
    await expect(page.getByText(/08_stanford_bunny\.obj/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair-validate")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expectLastOperation(card, /Repair \+ Validate/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Improved|No change|Still needs review/i);
    const comparison = card.getByTestId("mesh-operation-repair-validation-card");
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(/Boundary edges/i);
    await expect(comparison).toContainText(/Non-manifold edges/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-show-result-details")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
  });

  test("runs 3DBenchy cutter full robust boolean flow", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);

    await runRobustCutterPresetFullFlow(
      page,
      "benchy-cutter-boolean",
      /10_3dbenchy\.stl/i,
      /3DBenchy cutter box/i,
      /10_3dbenchy\.stl \(Boolean difference\)/i
    );
  });

  test("runs Armadillo cutter full robust boolean flow", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);

    await runRobustCutterPresetFullFlow(
      page,
      "armadillo-robust-boolean",
      /11_armadillo\.obj/i,
      /Armadillo cutter box/i,
      /11_armadillo\.obj \(Boolean difference\)/i
    );
  });

  test("loads Bunny smooth validate preset and reports validation", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-preset-bunny-smooth-validate").click();
    await expect(page.getByText(/08_stanford_bunny\.obj/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expectLastOperation(card, /Validate mesh/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Boundary edges/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Validate mesh/i);
  });

  test("runs CGAL mesh repair through the shared operation layer when available", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "cube-obj");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair").click();
    await card.getByTestId("mesh-workspace-operation-registry-repair-max-hole-edges").fill("4");
    const repair = await runMeshOperationHook(page, "cgal-repair");
    if (!repair.ok && /unavailable|not available|Python worker|CGAL/i.test(repair.error ?? "")) {
      test.skip(true, `CGAL worker unavailable: ${repair.error}`);
    }
    expect(repair.ok, repair.error).toBeTruthy();
    await expectLastOperation(card, /Repair mesh/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Improved|No change|Still needs review/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/New in-memory mesh result/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Degenerate faces removed/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Small holes filled/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-show-result-details")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
  });

  test("runs CGAL repair plus validation and shows before/after validation", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "cube-obj");

    const card = await openWorkspaceOperationsCard(page);
    await applyManagedMeshPreset(card, "cgal-repair-validate");
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-cgal-repair-validate")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(card.getByTestId("mesh-workspace-operation-registry-cgal-repair-validate-output-derived")).toBeChecked();
    const repairValidate = await runMeshOperationHook(page, "cgal-repair-validate");
    if (!repairValidate.ok && /unavailable|not available|Python worker|CGAL/i.test(repairValidate.error ?? "")) {
      test.skip(true, `CGAL worker unavailable: ${repairValidate.error}`);
    }
    expect(repairValidate.ok, repairValidate.error).toBeTruthy();
    await expectLastOperation(card, /Repair \+ Validate/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Small holes filled/i);
    const comparison = card.getByTestId("mesh-operation-repair-validation-card");
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(/Boundary edges/i);
    await expect(comparison).toContainText(/Non-manifold edges/i);
    await expect(comparison).toContainText(/Improved|No change|Still needs review/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-show-result-details")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
  });

  test("runs CGAL remesh through the shared operation layer when available", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");
    await loadBenchmarkModel(page, "cube-obj");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-remesh").click();
    await card.getByTestId("mesh-workspace-operation-registry-remesh-target-edge").fill("0.35");
    await card.getByTestId("mesh-workspace-operation-registry-remesh-iterations").fill("1");
    const remesh = await runMeshOperationHook(page, "cgal-remesh", {
      targetEdgeLength: 0.35,
      iterations: 1,
      preserveSharpEdges: true,
    });
    if (!remesh.ok && /unavailable|not available|Python worker|CGAL/i.test(remesh.error ?? "")) {
      test.skip(true, `CGAL worker unavailable: ${remesh.error}`);
    }
    expect(remesh.ok, remesh.error).toBeTruthy();
    await expectLastOperation(card, /Remesh/i);
    await expect(card.getByTestId("mesh-operation-remesh-card")).toContainText(/Target edge/i);
    await expect(card.getByTestId("mesh-operation-remesh-card")).toContainText(/Split edges/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-show-result-details")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
  });
});
