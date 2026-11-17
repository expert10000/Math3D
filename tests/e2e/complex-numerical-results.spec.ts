import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C06 Complex numerical result inspector", () => {
  let ctx: LaunchedSurfaceApp | null = null;
  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });

  test("publishes qualified numerical evidence without hiding legacy lab values", async () => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Residue Lab", exact: true }).click();
    await page.getByRole("button", { name: "Residue", exact: true }).last().click();
    await page.getByRole("tablist", { name: "Inspector categories" }).getByRole("tab", { name: "Provenance" }).click();
    await page.getByRole("combobox", { name: "Provenance view" }).selectOption("residue");
    await expect(page.getByText(/legacy numerical previews/i)).toBeVisible();
    const preflight = page.getByTestId("complex-contour-preflight");
    await expect(preflight).toContainText("Orientation:");
    await expect(preflight).toContainText("Branch/cut policy:");
    await expect(preflight).toContainText("nested trapezoid quadrature");
    await expect(preflight).toContainText("adaptive numerical contour");
    await expect(preflight).toContainText("Error estimate: calculated after execution");
    await page.getByTestId("publish-complex-numerical-result").click();
    const inspector = page.getByTestId("complex-numerical-result-inspector");
    await expect(inspector).toContainText("F06 numerical result · not proof");
    await expect(inspector).toContainText(/source revision: r\d+/);
    await expect(inspector).toContainText("error estimate:");
    await expect(inspector).toContainText("artifacts available:");

    const firstRevision = Number((await inspector.innerText()).match(/source revision: r(\d+)/)?.[1]);
    expect(Number.isInteger(firstRevision)).toBe(true);
    await page.getByRole("textbox", { name: "Complex function expression" }).fill("1/z");
    await expect(inspector).toHaveCount(0);
    const previewStatus = page.getByText(/Revision-safe preview r\d+/).first();
    await expect.poll(async () => Number((await previewStatus.innerText()).match(/preview r(\d+)/)?.[1])).toBeGreaterThan(firstRevision);
    const currentRevision = Number((await previewStatus.innerText()).match(/preview r(\d+)/)?.[1]);

    await page.getByTestId("publish-complex-numerical-result").click();
    await expect(inspector).toContainText(/source revision: r\d+/);
    const secondRevision = Number((await inspector.innerText()).match(/source revision: r(\d+)/)?.[1]);
    expect(secondRevision).toBeGreaterThan(firstRevision);
    expect(secondRevision).toBeGreaterThanOrEqual(currentRevision);
  });
});
