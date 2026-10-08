import { expect, type Page } from "@playwright/test";

export const exerciseRepresentationStarters = async (page: Page) => {
  const panel = page.getByTestId("project-explorer-panel"), editor = page.getByTestId("project-source-editor");
  const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
  const ids = new Set<string>();
  let originalDocument: any, saved: any;
  for (const [id, title, editTitle] of [
    ["spline-surface-lab", "Spline and Surface Lab", "Weighted spline curve"],
    ["curve-construction-study", "Curve Construction Study", "Profile revolution"],
    ["scene-topology-study", "Scene and Topology Study", "Simplicial triangle"],
  ]) {
    await show();
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))));
    await panel.getByTestId("project-template-select").selectOption(id!);
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText(title!);
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(before);
    await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const opened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(ids.has(opened.identity.id)).toBe(false); ids.add(opened.identity.id);
    if (id === "curve-construction-study") {
      await panel.getByTestId("project-inspect-relations").click();
      await expect(panel.getByTestId("project-dependencies")).toContainText("curve.revolution");
      await expect(panel.getByTestId("project-dependencies")).toContainText("surface.chart-curve");
    }
    for (const entry of opened.workspace.entries.filter((entry: any) => opened.metadata.documents[entry.expected.id]?.title !== "Parameter chart")) {
      await show(); await panel.getByTestId(`project-open-${entry.expected.id}`).or(panel.getByTestId(`project-tree-document-${entry.expected.id}`)).click();
      if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click();
      await expect(editor).toHaveAttribute("data-document-id", entry.expected.id);
      await expect(editor.getByTestId("project-source-measurement")).toContainText("bounds");
      if (await editor.getByTestId("project-source-json").getAttribute("open") === null) await editor.getByTestId("project-source-json").locator("summary").click();
      expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(entry.checkpoint.source);
    }
    await show(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((entry: any) => entry.expected))
      .toEqual(opened.workspace.entries.map((entry: any) => entry.expected));
    const target = opened.workspace.entries.find((entry: any) => opened.metadata.documents[entry.expected.id]?.title === editTitle);
    originalDocument = target.checkpoint;
    await panel.getByTestId(`project-open-${target.expected.id}`).or(panel.getByTestId(`project-tree-document-${target.expected.id}`)).click();
    if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click();
    if (await editor.getByTestId("project-source-json").getAttribute("open") === null) await editor.getByTestId("project-source-json").locator("summary").click();
    const changed = JSON.parse(JSON.stringify(originalDocument.source));
    if (id === "spline-surface-lab") changed.definition.weights[1] = 3;
    else if (id === "curve-construction-study") changed.parameters.angle = Math.PI;
    else changed.model.vertexIds.push("isolated");
    await editor.getByTestId("project-source-definition").fill(JSON.stringify(changed)); await editor.getByTestId("project-source-apply").click();
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await editor.getByTestId("project-source-undo").click();
    expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(originalDocument.source);
    await editor.getByTestId("project-source-redo").click();
    expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(changed);
    await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.find((entry: any) => entry.expected.id === target.expected.id).expected.revision).toBeGreaterThan(target.expected.revision);
  }
  expect(ids.size).toBe(3);
  return { originalDocument, saved };
};
