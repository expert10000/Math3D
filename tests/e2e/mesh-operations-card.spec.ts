import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function visibleMeshOperationsCard(page: Page): Promise<Locator> {
  const card = await firstVisible(page.locator('[data-testid$="operation-registry"]'));
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
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
  const lastResult = card.getByTestId("mesh-workspace-operation-registry-last-result");
  await expect(lastResult).toContainText(label, { timeout: 90_000 });
  await expect(lastResult).toContainText(/success|warning/i, { timeout: 90_000 });
  await expect(lastResult).toContainText(/Vertices:/i);
  await expect(lastResult).toContainText(/Triangles:/i);
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

    for (const preset of ["cgal-validate", "clean-normals", "decimate-3dbenchy", "smooth-bunny"]) {
      await card.getByTestId(`mesh-workspace-operation-registry-preset-${preset}`).click();
      await expect(card.locator("[aria-expanded=\"true\"]")).toBeVisible();
    }

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate")).toHaveText("Run Validate mesh");
    await expect(card).toContainText("Non-destructive CGAL validation");

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
    await expect(card).toContainText("Conservative CGAL repair");
    await expect(card.getByTestId("mesh-workspace-operation-registry-repair-remove-degenerate")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-repair-remove-duplicates")).toBeChecked();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-repair")).toHaveText("Run Repair mesh");

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-remesh").click();
    await expect(card).toContainText("CGAL Remesh planned");
    await expect(card).toContainText("edge length");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-remesh")).toHaveText("Backend not connected");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-cgal-remesh")).toBeDisabled();

    for (const operation of ["boolean-union", "boolean-difference", "boolean-intersection", "boolean-imprint"]) {
      await card.getByTestId(`mesh-workspace-operation-registry-row-${operation}`).click();
      await expect(card.getByTestId(`mesh-workspace-operation-registry-run-${operation}`)).toContainText(/^Run /);
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toBeVisible();
    }

    await card.getByTestId("mesh-workspace-operation-registry-row-decimate").click();
    const runDecimate = card.getByTestId("mesh-workspace-operation-registry-run-decimate");
    if (!(await runDecimate.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    const runResult = await runMeshOperationHook(page, "decimate");
    expect(runResult.ok, runResult.error).toBeTruthy();
    await expectLastOperation(card, /Decimate/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-open-result")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Decimate/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Request:/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Undo latest result/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Undo returns to the mesh/i);

    await card.getByTestId("mesh-workspace-operation-registry-save-current-preset").click();
    const savedPresets = card.getByTestId("mesh-workspace-operation-registry-saved-presets");
    await expect(savedPresets).toContainText(/Decimate preset/i);
    await expect(savedPresets.getByTestId("mesh-workspace-operation-registry-saved-preset").first()).toContainText(/Decimate/i);
    await savedPresets.getByRole("button", { name: "Apply preset" }).first().click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-row-decimate")).toHaveAttribute("aria-expanded", "true");
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
    await card.getByTestId("mesh-workspace-operation-registry-preset-boolean-demo-pair").click();
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Boolean demo B/i).first()).toBeVisible({ timeout: 15_000 });
    await selectSection(page, "Mesh");
    card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-formula")).toContainText("Result = Active Mesh");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-chip-a")).toContainText("A:");
    await expect(card).toContainText("Needs closed watertight meshes");
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

    const runUnion = card.getByTestId("mesh-workspace-operation-registry-run-boolean-union");
    if (!(await runUnion.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    await runUnion.click();
    await expectLastOperation(card, /Boolean union/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Boolean union/i);

    await card.getByTestId("mesh-workspace-operation-registry-send-to-geometry").click();
    await selectSection(page, "Geometry");
    await expect(page.getByText(/mesh sent to geometry/i)).toBeVisible({ timeout: 15_000 });

    await selectSection(page, "Mesh");
    const cardAgain = await openWorkspaceOperationsCard(page);
    await cardAgain.getByTestId("mesh-workspace-operation-registry-row-boolean-difference").click();
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-boolean-formula")).toContainText(
      "Result = Active Mesh - Operand B"
    );
    await cardAgain.getByTestId("mesh-workspace-operation-registry-prepare-boolean-demo").click();
    await expect(cardAgain).toContainText("Boolean demo operands ready", { timeout: 15_000 });
    const runDifference = cardAgain.getByTestId("mesh-workspace-operation-registry-run-boolean-difference");
    if (!(await runDifference.isEnabled())) {
      test.skip(true, "VTK worker is not available in this environment.");
    }
    await runDifference.scrollIntoViewIfNeeded();
    await runDifference.click({ force: true });
    await expectLastOperation(cardAgain, /Boolean difference/i);
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Triangles:/);
    await expect(cardAgain.getByTestId("mesh-workspace-operation-registry-history")).toContainText(/Boolean difference/i);
    const operandToggle = cardAgain.getByTestId("mesh-workspace-operation-registry-toggle-boolean-operands");
    if (await operandToggle.isVisible().catch(() => false)) {
      await operandToggle.click();
      await expect(operandToggle).toContainText(/Show operands|Hide operands/);
    }
    await cardAgain.getByTestId("mesh-workspace-operation-registry-open-result-in-geometry").click();
    await expect(page.getByText(/mesh sent to geometry/i)).toBeVisible({ timeout: 15_000 });
  });

  test("opens the implicit sphere preset from Mesh Operations and runs preview", async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await resetSurfaceAppState(page);
    await selectSection(page, "Mesh");

    const card = await openWorkspaceOperationsCard(page);
    await card.getByTestId("mesh-workspace-operation-registry-preset-boolean-demo-pair").click();
    await expect(page.getByText(/Boolean demo A/i).first()).toBeVisible({ timeout: 15_000 });
    await selectSection(page, "Mesh");
    const meshCard = await openWorkspaceOperationsCard(page);
    await meshCard.getByTestId("mesh-workspace-operation-registry-row-implicit-preview").click();
    await expect(meshCard.getByTestId("mesh-workspace-operation-registry-run-implicit-preview")).toBeDisabled();
    await meshCard.getByTestId("mesh-workspace-operation-registry-preset-implicit-sphere-mesh").click();
    await expect(page.getByText(/Surfaces \/ Implicit \/ Level Set \/ Sphere/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Selected: Boolean demo A/i)).toHaveCount(0);
    const cta = await visibleImplicitWorkflowCta(page);
    await expect(cta).toContainText(/Run CGAL Implicit Mesh/i);
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
    await expect(focusedCard.locator('[data-testid$="-open-result"]')).toBeEnabled();
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
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Boundary edges/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Non-manifold edges/i);
    await expect(card.getByTestId("mesh-operation-validation-card")).toContainText(/Self intersections/i);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-validation-warning")).toContainText(
      /validation passed|needs repair/i
    );
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
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Degenerate faces removed/i);
    await expect(card.getByTestId("mesh-operation-repair-card")).toContainText(/Small holes filled/i);
    await expect(card.getByTestId("mesh-workspace-operation-registry-open-result")).toBeEnabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-send-to-geometry")).toBeEnabled();
  });
});
