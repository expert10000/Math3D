import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

type SourceSnapshot = {
  id: string;
  revision: number;
  structuralHash: string;
  checksum: string;
  selection: string[];
  positions: number[];
  indices: number[];
};

async function sourceSnapshot(page: Page): Promise<SourceSnapshot> {
  return page.evaluate(() => {
    const hook = (window as Window & { __MATH3D_E2E_MESH_TOPOLOGY_SOURCE__?: () => SourceSnapshot | null }).__MATH3D_E2E_MESH_TOPOLOGY_SOURCE__;
    const result = hook?.();
    if (!result) throw new Error("Mesh source snapshot unavailable");
    return result;
  });
}

test("split-vertex STL comparison is explicit, read-only, and remains historical across weld and Undo", async () => {
  test.setTimeout(150_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const page = app.page;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await resetSurfaceAppState(page);
    const sectionButtons = page.getByRole("button", { name: "Mesh", exact: true });
    for (let index = 0; index < await sectionButtons.count(); index += 1) {
      const button = sectionButtons.nth(index);
      if (await button.isVisible() && await button.getAttribute("aria-pressed") !== null) { await button.click(); break; }
    }
    await page.getByRole("button", { name: "Mesh tools", exact: true }).first().click();
    await page.getByTestId("mesh-workspace-source-summary").getByRole("button", { name: "+ Add" }).click();
    await page.getByTestId("mesh-workspace-open-mesh-file").getByRole("checkbox", { name: "Weld coincident vertices" }).uncheck();
    await page.getByTestId("mesh-workspace-open-mesh-file").locator('input[type="file"]').setInputFiles(resolve("tests/assets/meshes/basic/03_cube_ascii.stl"));

    await page.getByTestId("shared-inspector-tab-diagnostics").click();
    const source = page.getByTestId("mesh-topology-indexed-source");
    const interpreted = page.getByTestId("mesh-topology-spatial-weld");
    await expect(source).toContainText(/Vertices 36 · Faces 12/);
    await expect(source).toContainText("Boundary edges 36");
    await expect(interpreted).toContainText("Not computed");
    const before = await sourceSnapshot(page);

    await page.getByTestId("mesh-topology-request-comparison").click();
    await expect(interpreted).toContainText("Method position-distance · tolerance 0.000001");
    await expect(interpreted).toContainText(/Vertices 8 · Faces 12/);
    await expect(interpreted).toContainText("Boundary edges 0");
    expect(await sourceSnapshot(page)).toEqual(before);

    await page.getByRole("button", { name: "Weld and replace active mesh" }).click();
    await expect(source).toContainText(/Vertices 24 · Faces 12/);
    await expect(source).toContainText("Boundary edges 24");
    await expect(interpreted).toContainText("Historical interpretation");
    const welded = await sourceSnapshot(page);
    expect(welded.id).toBe(before.id);
    expect(welded.revision).toBeGreaterThan(before.revision);
    expect(welded.checksum).not.toBe(before.checksum);

    await page.getByTestId("mesh-undo-weld").click();
    await expect(source).toContainText(/Vertices 36 · Faces 12/);
    await expect(source).toContainText("Boundary edges 36");
    const undone = await sourceSnapshot(page);
    expect(undone.id).toBe(before.id);
    expect(undone.revision).toBeGreaterThan(welded.revision);
    expect(undone.checksum).toBe(before.checksum);
    expect(undone.selection).toEqual(before.selection);
    expect(undone.positions).toEqual(before.positions);
    expect(undone.indices).toEqual(before.indices);
    await expect(interpreted).toContainText("Historical interpretation");
  } finally {
    await closeSurfaceApp(app);
  }
});
