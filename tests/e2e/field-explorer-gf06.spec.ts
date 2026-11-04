import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-06 opens the saved selection and profile hierarchy with keyboard access in a narrow Explorer", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 760, height: 700 });
    const fixture = readFileSync(resolve("tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"));
    const core = require(resolve("packages/core/src/index.ts"));
    const original = core.parseMath3DProject(fixture.toString("utf8"));
    const vectorEntry = original.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d");
    // The GF-03 fixture's legacy Graph tables have no exported sidecars. Keep its exact
    // vector source, derived chain and vector-owned selections for the Explorer import.
    const project = core.replaceMath3DProjectWorkspace(original, core.createMixedWorkspaceDocument({
      ...original.workspace, entries: [vectorEntry], activeDocumentIds: [vectorEntry.expected.id],
      scientificSelections: original.workspace.scientificSelections.filter((item: any) =>
        item.identity.kind === "authored" && item.identity.migratedFrom?.ownerDocumentId === vectorEntry.expected.id),
    }));
    const bytes = Buffer.from(core.serializeMath3DProject(project));
    const sourceId = project.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d").expected.id;
    const profileId = project.workspace.derivedFields[2].identity.id;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles({ name: "gf03.math3d.project.json",
      mimeType: "application/json", buffer: bytes });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await expect(explorer).toBeVisible();
    const hierarchy = explorer.getByTestId("field-explorer-project-hierarchy");
    await expect(hierarchy).toContainText("Sources (1)");
    await expect(hierarchy).toContainText("Derived (3)");
    await expect(hierarchy).toContainText("Selections (7)");
    await expect(hierarchy).toContainText(profileId);
    await expect(hierarchy).toContainText("Planar region");
    const region = hierarchy.locator("summary").filter({ hasText: "Planar region" }).first();
    await region.focus();
    await page.keyboard.press("Enter");
    await expect(hierarchy.getByText(/x -2…2 m/).first()).toBeVisible();
    await hierarchy.getByRole("link", { name: "Source controls" }).click();
    await expect(explorer.getByLabel("P(x,y,z)")).toBeVisible();
    await explorer.getByLabel("P(x,y,z)").focus();
    await expect(explorer.getByLabel("P(x,y,z)")).toBeFocused();
    const inspector = explorer.getByLabel("Field status and actions");
    const nav = inspector.getByRole("navigation", { name: "Inspector sections" });
    await nav.getByRole("button", { name: "Layer" }).focus();
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("button", { name: "Probe" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(nav.getByRole("button", { name: "Probe" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("region", { name: "Linked field probe" })).toBeVisible();
    await hierarchy.getByRole("button", { name: "Inspect profile provenance" }).first().click();
    await expect(nav.getByRole("button", { name: "Provenance" })).toHaveAttribute("aria-pressed", "true");
    await expect(explorer.getByTestId("explorer-derived-profile-provenance")).toContainText(
      "No profile result has been computed for this verified recipe.");
    await expect(explorer.getByTestId("explorer-derived-profile-provenance")).toBeFocused();
    const bounds = await Promise.all([explorer.getByLabel("Field controls").boundingBox(),
      inspector.boundingBox(), explorer.getByLabel("3D field viewer").boundingBox()]);
    expect(bounds.every(Boolean)).toBe(true);
    expect(bounds[0]!.y).toBeLessThan(bounds[1]!.y);
    expect(bounds[1]!.y).toBeLessThan(bounds[2]!.y);
  } finally { await closeSurfaceApp(app); }
});
