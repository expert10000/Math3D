import { expect, test } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
// Playwright's source transformer loads these workspace packages; their types are checked by the renderer/mobile gates.
const { parseWorkspaceProjectHandoff } = require(resolve("packages/core/src/index.ts"));
const { importMobileGraph, readMobileGraph, updateStoredMobileGraph } = require(resolve("apps/mobile/src/models/mobileGraphProject.ts"));
const { applyMobileGraphAuthoring, mobileGraphAuthoringAction, mobileGraphFunctionDraft } = require(resolve("apps/mobile/src/models/mobileGraphAuthoring.ts"));
const { serializeMobileProjectHandoff } = require(resolve("apps/mobile/src/models/mobileProjectTransfer.ts"));
const { Graph2DCommandAdapter } = require(resolve("packages/kernel/src/graph2dCommandAdapter.ts"));

test("G2D33 desktop file handoff returns mobile h and rejects later desktop divergence", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page); await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    for (const [label, expression] of [["f", "x^2"], ["g", "2*x+1"]]) {
      await functions.getByRole("button", { name: "Add function", exact: true }).click();
      await functions.getByLabel("Function name").fill(label);
      await functions.getByLabel("Function expression").fill(expression);
      await functions.getByRole("button", { name: "Save function", exact: true }).click();
    }
    await app.page.getByTestId("kernel-workspace-toggle").click();
    const exportedPath = resolve(`output/graph2d-g33-desktop-${Date.now()}.handoff.json`);
    await app.app.evaluate(({ session }, savePath) => {
      session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath));
    }, exportedPath);
    await app.page.getByTestId("graph2d-handoff-export").click();
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Exported Graph handoff");
    await expect.poll(() => existsSync(exportedPath)).toBe(true);
    const raw = readFileSync(exportedPath, "utf8"), original = parseWorkspaceProjectHandoff(raw);
    let stored = importMobileGraph(raw, [], "desktop.handoff.json", 1, "desktop");
    const commands = new Graph2DCommandAdapter(readMobileGraph(stored)), doc = commands.document();
    commands.commitScene(applyMobileGraphAuthoring(doc, mobileGraphAuthoringAction({ objectId: null,
      draft: { ...mobileGraphFunctionDraft(doc, null), label: "h", expression: "sin(x)" } })), "create");
    stored = updateStoredMobileGraph(stored, commands.document(), 2);
    const returned = serializeMobileProjectHandoff(stored);
    await app.page.getByTestId("graph2d-handoff-import").setInputFiles({ name: "mobile.handoff.json", mimeType: "application/json", buffer: Buffer.from(returned) });
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Opened Graph handoff");
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await expect(functions.getByRole("button", { name: "Edit h", exact: true })).toBeVisible();
    await expect(app.page.locator('[data-graph2d-path="function_3"]')).toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Edit f", exact: true }).click();
    await functions.getByLabel("Function expression").fill("3*x");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("graph2d-handoff-import").setInputFiles({ name: "stale.handoff.json", mimeType: "application/json", buffer: Buffer.from(returned) });
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Handoff conflict");
    await app.page.getByTestId("kernel-workspace-save").click();
    const saved = await app.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    const graph = saved.entries.find((entry: { module: string }) => entry.module === "graph2d").checkpoint;
    expect(graph.identity.id).toBe(original.projectId);
    expect(graph.source.objects[0]).toMatchObject({ expression: { source: "3*x" } });
    expect(graph.source.objects).toHaveLength(3);
  } finally { await closeSurfaceApp(app); }
});
