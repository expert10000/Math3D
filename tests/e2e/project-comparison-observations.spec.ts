import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("PC09 saves, exports and reopens a verified A/B observation from Notes after restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-coordinate-overlay-study").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Verified A/B overlay" });
    await view.getByLabel("Comparison observation title").fill("Frame observation");
    await view.getByLabel("Comparison observation body").fill("The two declared frames coincide.");
    await view.getByTestId("project-comparison-save-observation").click();
    await expect(view.getByTestId("project-comparison-observations").locator("article")).toContainText("The two declared frames coincide.");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const note = saved.notes.find((item: { title: string }) => item.title === "Frame observation");
    expect(note.anchor.kind).toBe("comparison");
    expect(note.anchor.alignment).toBe("source-declared match");
    expect(note.anchor.members).toEqual(saved.compositions.find((item: { title: string }) => item.title === "Verified A/B overlay").members.map((member: { expected: unknown }) => member.expected));
    const path = test.info().outputPath("pc09-comparison.html");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), path);
    await view.getByTestId("project-comparison-export-evidence").click();
    await expect.poll(() => { try { return readFileSync(path, "utf8").includes("The two declared frames coincide."); } catch { return false; } }).toBe(true);
    await view.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByTestId("notes-toggle").click();
    const notes = page.getByTestId("project-notes-panel");
    await expect(notes.getByTestId(`project-note-${note.identity.id}`)).toContainText("current");
    await notes.getByTestId(`project-note-${note.identity.id}`).getByRole("button", { name: "Open target" }).click();
    await expect(view.getByLabel("Saved composition")).toHaveValue(note.anchor.compositionId);
    await expect(view.getByTestId("project-comparison-observations")).toContainText("The two declared frames coincide.");
  } finally { await closeSurfaceApp(ctx); }
});
