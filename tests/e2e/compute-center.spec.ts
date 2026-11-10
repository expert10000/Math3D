import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { closeSurfaceApp, launchSurfaceApp, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Compute Center shows live diagnostics and opens Runtimes", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp();
    await app.page.getByTestId("top-compute-center-button").click();
    const center = app.page.getByTestId("compute-center");
    await expect(center).toBeVisible();
    await expect(center.getByRole("heading", { name: "Compute Center" })).toBeVisible();
    await expect(center.getByRole("region", { name: "Local backends" })).toContainText("CGAL");
    await expect(center.getByRole("region", { name: "Local backends" })).toContainText("VTK");
    await expect(center.getByRole("region", { name: "Broker jobs" })).toContainText("Scientific broker history");
    await expect(center.getByTestId("runtime-center-sage-routes")).toContainText("Sage Docker");
    await expect(center.getByTestId("runtime-route-sage-docker"))
      .toHaveAttribute("data-state", /ready|limited|unavailable/, { timeout: 30_000 });
    await expect(center.getByTestId("runtime-route-sage-private")).toContainText("Version:");
    await expect(center.getByTestId("compute-center-python-admission")).not.toBeEmpty();
    await expect(center.getByTestId("compute-center-memory")).not.toBeEmpty();
    await center.getByRole("button", { name: "Open route diagnostics" }).click();
    await expect(center.getByTestId("runtime-operation-admission")).toBeVisible();
    await expect(center.getByTestId("runtime-export-receipt")).toBeEnabled();
    const file = test.info().outputPath("runtime-receipt.json");
    await app.app.evaluate(({ session }, target) =>
      session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), file);
    await center.getByTestId("runtime-export-receipt").click();
    await expect.poll(async () => { try { return (await readFile(file)).length > 0; } catch { return false; } }).toBe(true);
    const receipt = JSON.parse(await readFile(file, "utf8"));
    expect(receipt).toMatchObject({ kind: "math3d.runtime-capability-receipt", schemaVersion: 1 });
    expect(receipt.checkedAt).toBeGreaterThan(0);
    expect(receipt.routes).toEqual(expect.arrayContaining([expect.objectContaining({ group: "local" })]));
    expect(receipt.discoveryFailures).toEqual(expect.objectContaining({ probeFailed: expect.any(Number) }));
    await expect(center.getByTestId("sage-runtime-local")).toContainText("Checked", { timeout: 30_000 });
    await expect(center.getByTestId("sage-runtime-docker")).toContainText("Checked", { timeout: 30_000 });
    await expect(center.getByTestId("sage-runtime-local")).toContainText("Environment: WSL Ubuntu");
    await expect(center.getByTestId("sage-runtime-version-local")).toContainText("Version:");
    await expect(center.getByTestId("compute-engine-manager")).toBeVisible();
  } finally {
    if (app) await closeSurfaceApp(app);
  }
});
