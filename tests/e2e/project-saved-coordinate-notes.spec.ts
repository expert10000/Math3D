import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

async function savedResourceCount(page: LaunchedSurfaceApp["page"], id: string): Promise<number> {
  return page.evaluate(projectId => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("math3d.project-resources.v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("projects").objectStore("projects").get(projectId);
      read.onsuccess = () => { resolve(read.result?.resources?.length ?? 0); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }), id);
}

test("PC25–26 saves and reviews several exact coordinate Notes after restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-mesh-geometry-probe").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    expect(await savedResourceCount(page, projectId)).toBeGreaterThan(0);
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Mesh / Geometry · shared metres" });
    const source = view.getByRole("region", { name: /B: Declared metre sphere/ });
    const target = view.getByRole("region", { name: /A: Declared metre Mesh/ });
    await view.getByLabel("Comparison observation title").fill("Shared metre coordinate");
    await view.getByLabel("Comparison observation body").fill("Discuss the source position without assigning a matching Mesh element.");
    const canvas = source.locator("canvas").first();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Geometry source canvas is unavailable.");
    for (const [x, y] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.5, 0.65]]) {
      await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
      if (await target.getByTestId("project-composition-linked-coordinate").count()) break;
    }
    await expect(view.getByTestId("project-comparison-save-coordinate")).toBeEnabled();
    await expect(target.getByTestId("project-composition-linked-coordinate")).toContainText("Coordinate marker only");
    await view.getByTestId("project-comparison-save-coordinate").click();
    await expect(view.getByText("Coordinate observation saved with both exact source generations.")).toBeVisible();
    expect(await savedResourceCount(page, projectId)).toBeGreaterThan(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const note = saved.notes.find((item: { title: string }) => item.title === "Shared metre coordinate");
    expect(note.anchor.coordinateProbe).toMatchObject({ format: "math3d.comparison-coordinate-probe/v1",
      sourceSlot: "B", coordinateFrame: { frame: "local", unit: "m" } });
    for (const [title, picked, other, direction, count] of [
      ["Mesh position", target, source, "A to B", 2],
      ["Second sphere position", source, target, "B to A", 3],
    ] as const) {
      await view.getByLabel("Comparison observation title").fill(title);
      await view.getByLabel("Comparison observation body").fill(`Review ${title} without asserting a matching element.`);
      const pickedCanvas = picked.locator("canvas").first();
      const box = await pickedCanvas.boundingBox();
      if (!box) throw new Error("Comparison canvas is unavailable.");
      for (const [x, y] of [[0.5, 0.5], [0.45, 0.48], [0.55, 0.55]]) {
        await pickedCanvas.click({ position: { x: box.width * x, y: box.height * y } });
        if ((await view.getByTestId("project-composition-probe-status").textContent())?.includes(`Linked coordinate from ${direction}`)) break;
      }
      await expect(other.getByTestId("project-composition-linked-coordinate")).toContainText("Coordinate marker only");
      await view.getByTestId("project-comparison-save-coordinate").click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).notes.length as number)).toBe(count);
    }
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).notes.length)) as number).toBe(3);
    const sourceCanvas = await canvas.elementHandle();
    const targetCanvas = await target.locator("canvas").first().elementHandle();
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
    for (const handle of [sourceCanvas, targetCanvas]) if (handle) await expect.poll(() => handle.evaluate(element => ({
      connected: element.isConnected, contextLost: (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost() ?? false,
    }))).toEqual({ connected: false, contextLost: true });
    await page.reload();
    expect(await savedResourceCount(page, projectId)).toBeGreaterThan(0);
    await page.getByTestId("projects-toggle").click();
    const review = panel.getByTestId("project-coordinate-observation-review");
    await expect(review.locator("li")).toHaveCount(3);
    await review.getByTestId(`project-coordinate-review-${note.identity.id}`).getByRole("button", { name: "Open saved marker" }).click();
    await expect(view.getByLabel("Saved composition")).toHaveValue(note.anchor.compositionId);
    await expect(target.getByTestId("project-composition-linked-coordinate")).toContainText("Coordinate marker only");
    await expect(view.getByTestId("project-composition-probe-status")).toContainText("Saved coordinate from B to A");
    await expect(view.getByTestId("project-comparison-observations")).toContainText("Shared metre coordinate");
    const path = test.info().outputPath("pc25-coordinate-comparison.html");
    await ctx.app.evaluate(({ session }, targetPath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(targetPath)), path);
    await view.getByTestId("project-comparison-export-evidence").click();
    await expect.poll(() => { try { return readFileSync(path, "utf8").includes("No target element or measured value is inferred."); }
      catch { return false; } }).toBe(true);
    await view.getByRole("button", { name: "Close" }).click();
    const reviewPath = test.info().outputPath("pc26-coordinate-review.html");
    await ctx.app.evaluate(({ session }, targetPath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(targetPath)), reviewPath);
    await review.getByTestId("project-coordinate-review-export").click();
    await expect.poll(() => { try { const html = readFileSync(reviewPath, "utf8");
      return html.includes("Shared metre coordinate") && html.includes("Mesh position") && html.includes("Second sphere position"); }
      catch { return false; } }).toBe(true);
  } finally { await closeSurfaceApp(ctx); }
});
