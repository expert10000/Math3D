import { expect, test, type Locator, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry", "Complex Analysis"] as const;

type MeshBenchmarkE2EHook = {
  loadBenchmarkModel: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

type MeshOperationE2EHook = {
  run: (operation: "clean-normals" | "decimate" | "smooth") => Promise<{ ok: boolean; error?: string }>;
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

test.describe("Mesh Operations card", () => {
  test.setTimeout(150_000);

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
    const runResult = await page.evaluate(async () => {
      const hook = (window as Window & { __MATH3D_E2E_MESH_OPERATION__?: MeshOperationE2EHook }).__MATH3D_E2E_MESH_OPERATION__;
      if (!hook) return { ok: false, error: "Mesh operation E2E hook unavailable." };
      return hook.run("decimate");
    });
    expect(runResult.ok, runResult.error).toBeTruthy();
    const lastResult = card.getByTestId("mesh-workspace-operation-registry-last-result");
    await expect(lastResult).toContainText(/Decimate/i, { timeout: 90_000 });
    await expect(lastResult).toContainText(/success|warning/i, { timeout: 90_000 });
  });
});
