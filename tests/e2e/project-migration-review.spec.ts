import { expect, test } from "@playwright/test";
import { createGraph2DWorkspaceProject, getGraph2DPresetCatalog, instantiateGraph2DPreset,
  serializeMixedWorkspaceDocument, sha256Checksum } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("legacy workspace review preserves exact bytes and imports distinct Project copies", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "migration-ui").document;
    const original = Buffer.from(serializeMixedWorkspaceDocument(createGraph2DWorkspaceProject(graph)) + "\n");
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    const upload = async () => panel.getByTestId("project-import-file").setInputFiles({
      name: "original-workspace.json", mimeType: "application/json", buffer: original,
    });
    await upload();
    const review = panel.getByTestId("project-migration-review");
    await expect(review).toContainText("math3d.mixed-workspace version 1");
    await expect(review).toContainText(sha256Checksum(original));
    await expect(review).toContainText("new Project identity");
    await page.evaluate(() => {
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob) => {
        (window as unknown as { migrationOriginalDownload?: Blob }).migrationOriginalDownload = blob;
        return create(blob);
      };
    });
    await panel.getByTestId("project-migration-download-original").click();
    const downloaded = await page.evaluate(async () => Array.from(new Uint8Array(await
      (window as unknown as { migrationOriginalDownload: Blob }).migrationOriginalDownload.arrayBuffer())));
    expect(Buffer.from(downloaded)).toEqual(original);
    await panel.getByTestId("project-import-cancel").click();
    await expect(panel.getByTestId("project-import-preview")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project-library.v1"))).toBeNull();

    const ids: string[] = [];
    for (let index = 0; index < 2; index++) {
      await upload();
      await expect(review).toBeVisible();
      const id = (await review.textContent())!.match(/math3d:project:[a-f0-9]{32}/)?.[0];
      expect(id).toBeTruthy();
      ids.push(id!);
      await panel.getByTestId("project-import-save").click();
      await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    }
    expect(ids[0]).not.toBe(ids[1]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.map((entry: { id: string }) => entry.id));
    expect(saved).toEqual(expect.arrayContaining(ids));
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBeNull();
  } finally { await closeSurfaceApp(ctx); }
});
