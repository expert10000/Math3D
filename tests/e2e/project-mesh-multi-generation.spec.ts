import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls, projectFreezeFixture } from "./helpers/projectFreeze";

test("PC12 compares explicitly retained Mesh revisions after successive edits", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = projectFreezeFixture();
    const meshId = fixture.project.workspace.entries.find((item: any) => item.module === "mesh" && item.expected.id !== fixture.targets.mesh)?.expected.id as string;
    if (!meshId) throw new Error("A fresh saved Mesh fixture is required.");
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page);
    await controls.importOpen(fixture.raw);
    await controls.open(meshId);
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-mesh-retain-subdivide").click();
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-mesh-translate-0").fill("0.25");
    await page.getByTestId("project-mesh-retain-transform").click();
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-mesh-translate-1").fill("0.5");
    await page.getByTestId("project-mesh-retain-transform").click();
    const saved = await controls.save();
    const entry = saved.workspace.entries.find((item: any) => item.expected.id === meshId);
    expect(entry.replay.payload.transactions).toHaveLength(3);
    expect(entry.expected.revision).toBe(entry.checkpoint.identity.revision + 3);

    await controls.panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByTestId("project-composition-source-0").selectOption(meshId);
    await view.getByTestId("project-composition-source-1").selectOption(meshId);
    const aSelect = view.getByTestId("project-composition-generation-0");
    const bSelect = view.getByTestId("project-composition-generation-1");
    await expect(aSelect.locator("option")).toHaveText([
      `Current r${entry.expected.revision}`, `Retained checkpoint r${entry.checkpoint.identity.revision}`,
      `Retained snapshot r${entry.checkpoint.identity.revision + 1}`, `Retained snapshot r${entry.checkpoint.identity.revision + 2}`,
    ]);
    await aSelect.selectOption("checkpoint");
    await bSelect.selectOption({ label: `Retained snapshot r${entry.checkpoint.identity.revision + 1}` });
    const a = view.getByRole("region", { name: /A:/ }), b = view.getByRole("region", { name: /B:/ });
    await expect(a).toContainText(`retained checkpoint r${entry.checkpoint.identity.revision}`);
    await expect(b).toContainText(`retained snapshot r${entry.checkpoint.identity.revision + 1}`);
    await aSelect.selectOption({ label: `Retained snapshot r${entry.checkpoint.identity.revision + 1}` });
    await bSelect.selectOption({ label: `Retained snapshot r${entry.checkpoint.identity.revision + 2}` });
    await expect(a).toContainText(`retained snapshot r${entry.checkpoint.identity.revision + 1}`);
    await expect(b).toContainText(`retained snapshot r${entry.checkpoint.identity.revision + 2}`);
    await expect(view.getByText("Mesh picks belong to their own revision.", { exact: false })).toBeVisible();
    await view.getByRole("button", { name: "Save composition" }).click();
    await expect(view.getByText("Composition saved; source documents were not changed.")).toBeVisible();
    const compositionId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).compositions.at(-1).id as string);
    const reportPath = test.info().outputPath("pc12-mesh-generations.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), reportPath);
    await view.getByTestId("project-comparison-export-evidence").click();
    await expect.poll(() => { try { return readFileSync(reportPath).length > 0; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
    const html = readFileSync(reportPath, "utf8");
    expect(html).toContain("retained snapshot");
    expect((html.match(/<img /g) ?? []).length).toBe(2);

    const canvases = await Promise.all([a, b].map(pane => pane.locator("canvas").first().elementHandle()));
    if (canvases.some(canvas => !canvas)) throw new Error("Both retained Mesh viewers are required.");
    await view.getByRole("button", { name: "Close" }).click();
    for (const canvas of canvases) await expect.poll(() => canvas!.evaluate(element =>
      ({ connected: element.isConnected, contextLost: (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost() ?? false })))
      .toEqual({ connected: false, contextLost: true });
    await page.reload();
    await controls.reopen(saved.identity.id);
    await page.getByTestId("project-explorer-panel").getByTestId("project-open-composition").click();
    await view.getByLabel("Saved composition").selectOption(compositionId);
    await expect(a).toContainText(`retained snapshot r${entry.checkpoint.identity.revision + 1}`);
    await expect(b).toContainText(`retained snapshot r${entry.checkpoint.identity.revision + 2}`);
  } finally { await closeSurfaceApp(ctx); }
});
