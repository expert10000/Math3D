import { expect, test, type Page } from "@playwright/test";
import corpus from "../fixtures/complex-analysis-v1/scientific-corpus.json";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const labStatus: Record<string, { status: string; body?: string }> = {
  "Function Explorer": { status: "Complex Function Explorer", body: "Function Explorer" },
  "Möbius Lab": { status: "Mobius viewer", body: "Möbius map" },
  "Riemann Sphere": { status: "Mobius viewer", body: "Riemann Sphere" },
  "Residue Lab": { status: "Residue Lab", body: "Residue Lab" },
  "Branch Lab": { status: "Branch Lab", body: "Branch Lab" },
  "Covering Lab": { status: "Covering Map Lab", body: "Covering Lab" },
};

async function openComplexAnalysis(page: Page): Promise<void> {
  await resetSurfaceAppState(page);
  await page.getByTestId("workspace-nav-complex_analysis").click();
  await expect(page.getByRole("button", { name: "Function Explorer", exact: true })).toBeVisible();
}

async function openLab(page: Page, name: string): Promise<void> {
  await page.getByRole("banner").getByRole("button", { name, exact: true }).click();
  const expected = labStatus[name];
  if (!expected) throw new Error(`Missing C01 lab status contract for ${name}`);
  await expect.poll(async () => page.getByTestId("app-status-bar").innerText(), { timeout: 15_000 })
    .toContain(expected.status);
  if (expected.body) await expect(page.getByText(expected.body, { exact: false }).first()).toBeAttached();
}

async function expectLabelsAttached(page: Page, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true }).first(), `${label} is part of the C01 reachability contract`)
      .toBeAttached();
  }
}

test.describe.serial("C01 Complex Analysis scientific corpus UI contract", () => {
  let ctx: LaunchedSurfaceApp | null = null;

  test.beforeAll(async () => {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
  });

  test.afterAll(async () => {
    await closeSurfaceApp(ctx);
  });

  test("keeps every existing lab entry point reachable", async () => {
    const page = ctx!.page;
    await openComplexAnalysis(page);
    for (const lab of corpus.uiContract.labs) await openLab(page, lab);
  });

  test("keeps explorer overlays, paths, cuts, and 3D preview controls reachable", async () => {
    const page = ctx!.page;
    await openComplexAnalysis(page);
    await openLab(page, "Function Explorer");
    await expectLabelsAttached(page, corpus.uiContract.overlays);
    await expectLabelsAttached(page, corpus.uiContract.pathModes);
    await expectLabelsAttached(page, [
      "principal",
      "negative real axis",
      "positive real axis",
      "radial from point",
      "between branch points",
      "custom cut",
    ]);
    await expectLabelsAttached(page, corpus.uiContract.valueSurfaceQuantities);
    await expect(page.getByRole("button", { name: "Build 3D value surface", exact: true }).first()).toBeAttached();
  });

  test("keeps covering models, fibers, and deck transformations reachable", async () => {
    const page = ctx!.page;
    await openComplexAnalysis(page);
    await openLab(page, "Covering Lab");
    await expectLabelsAttached(page, corpus.uiContract.coveringModels);
    await expect(page.getByText(/fiber/i).first()).toBeAttached();
    await expect(page.getByText(/deck transformation/i).first()).toBeAttached();
  });
});
