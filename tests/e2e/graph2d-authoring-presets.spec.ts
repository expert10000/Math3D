import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType } from "./helpers/graphAuthoring";

test("every Graph Add editor can load a distinct editable preset", async () => {
  test.setTimeout(90_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const panel = page.getByLabel("Graph functions", { exact: true });
    const cases = [
      ["Add function", "New function", "damped-wave", "Damped wave"],
      ["Add parametric", "New parametric", "lissajous", "Lissajous"],
      ["Add polar", "New polar", "spiral", "Spiral"],
      ["Add implicit", "New implicit", "hyperbola", "Hyperbola"],
      ["Add slope field", "New slope field", "forced", "Driven field"],
      ["Add phase portrait", "New phase portrait", "damped", "Damped spiral"],
      ["Add time-dependent ODE", "New time-dependent ODE", "forced", "Forced response"],
      ["Add inequality", "New inequality", "half-disk", "Upper half-disk"],
      ["Add piecewise", "New piecewise function", "capped", "Capped parabola"],
      ["Add data series", "New data series", "gaps", "With gap"],
    ] as const;
    for (const [add, formName, preset, label] of cases) {
      await openGraphType(page, add === "Add implicit" ? "Implicit contour" : add.slice(4).replace(/^./, letter => letter.toUpperCase()));
      const form = graphEditor(page).getByRole("form", { name: formName });
      await expect(form).toBeVisible();
      await expect(form.locator(".graph2d-preset-picker")).toBeInViewport();
      await form.getByLabel("Start from preset").selectOption(preset);
      await expect(form.locator("input").first()).toHaveValue(label);
      await expect(form.locator('button[type="submit"]')).toBeEnabled();
      if (add === "Add implicit") {
        await form.getByRole("button", { name: "Expand formula" }).click();
        const dialog = page.getByRole("dialog", { name: "Edit Implicit expression" });
        const expanded = dialog.getByLabel("Implicit expression expanded");
        await expect(expanded).toBeFocused();
        await expect(dialog.getByLabel("Formula preview")).toContainText("Valid expression");
        await expect(dialog.getByRole("img", { name: /Zero contour preview across x, y/ })).toBeVisible();
        await expect(dialog).toContainText("bounded samples");
        const diagnostics = dialog.getByLabel("Preview diagnostics");
        await expect(diagnostics).toContainText("Contour");
        await expect(diagnostics).toContainText("Components");
        await expect(diagnostics).toContainText("refined cells");
        await expect(diagnostics).toContainText("Performance");
        await expect(dialog).toContainText("Caret ready");
        expect(await expanded.evaluate(element => getComputedStyle(element).caretColor)).not.toBe("transparent");
        const caret = dialog.locator(".graph2d-formula-visible-caret");
        await expect(caret).toBeVisible();
        await expanded.press("End");
        const endPosition = await caret.boundingBox();
        await expanded.press("Home");
        await expect.poll(async () => (await caret.boundingBox())?.x).toBeLessThan(endPosition!.x);
        await expanded.selectText();
        await expect(caret).toBeHidden();
        await dialog.getByRole("group", { name: "Expanded formula functions" }).getByRole("button", { name: "atan", exact: true }).click();
        await expect(expanded).toHaveValue("atan(x^2-y^2-1)");
        await expect(caret).toBeVisible();
        await dialog.getByRole("searchbox", { name: "Find formula function" }).fill("sinc");
        await expect(dialog.getByRole("group", { name: "Expanded formula functions" })
          .getByRole("button", { name: "sinc", exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "Cancel" }).click();
      } else if (["Add slope field", "Add time-dependent ODE", "Add phase portrait", "Add inequality"].includes(add)) {
        await form.getByRole("button", { name: "Expand formula" }).first().click();
        const diagram = page.locator(".graph2d-formula-dialog");
        const title = add === "Add slope field" ? "Local slope directions" :
          add === "Add time-dependent ODE" ? "Solution from initial value" :
          add === "Add phase portrait" ? "Phase directions and orbits" : "Combined inequality region";
        await expect(diagram.getByRole("img", { name: new RegExp(title) })).toBeVisible();
        await expect(diagram).toContainText("bounded samples");
        await diagram.getByRole("button", { name: "Cancel" }).click();
      }
      await form.getByRole("button", { name: "Cancel" }).click();
    }
    await expect(panel.getByText("No graph objects yet.", { exact: false })).toBeVisible();
    await openGraphType(page, "Function");
    const form = graphEditor(page).getByRole("form", { name: "New function" });
    const expression = form.getByLabel("Function expression", { exact: true });
    await expression.fill("x");
    await expression.selectText();
    await form.getByRole("group", { name: "Formula functions" }).getByRole("button", { name: "tg" }).click();
    await expect(expression).toHaveValue("tan(x)");
    await form.getByRole("button", { name: "Expand formula" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Function expression" });
    await expect(dialog).toBeVisible();
    const expanded = dialog.getByLabel("Function expression expanded");
    await expect(expanded).toHaveValue("tan(x)");
    await expanded.fill("x+2");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(expression).toHaveValue("tan(x)");
    await form.getByRole("button", { name: "Expand formula" }).click();
    await expanded.fill("sin(");
    await expect(dialog.getByLabel("Formula preview")).toContainText("Correct the formula");
    await expect(dialog.getByRole("button", { name: "Apply formula" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Go to error" }).click();
    await expect(expanded).toBeFocused();
    await expanded.fill("sqrt(-1)");
    await expect(dialog.getByLabel("Formula preview")).toContainText("No finite values");
    await expect(dialog.getByRole("button", { name: "Apply formula" })).toBeEnabled();
    await expanded.fill("x");
    await expanded.selectText();
    await dialog.getByRole("group", { name: "Expanded formula functions" }).getByRole("button", { name: "sin", exact: true }).click();
    await expect(expanded).toHaveValue("sin(x)");
    await expanded.fill("x+\n1");
    await dialog.getByRole("button", { name: "Apply formula" }).click();
    await expect(dialog).toBeHidden();
    await expect(expression).toHaveValue("x+ 1");
    await form.getByLabel("Start from preset").selectOption("parabola");
    await form.locator('button[type="submit"]').click();
    await graphEditor(page).getByRole("button", { name: "Create graph" }).click();
    await expect(panel.getByRole("button", { name: "Select Parabola" })).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

test("Graph Add preset browser searches, previews, applies, and preserves the form on cancel", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const panel = page.getByLabel("Graph functions", { exact: true });
    await openGraphType(page, "Function");
    const form = graphEditor(page).getByRole("form", { name: "New function" });
    const browse = form.getByRole("button", { name: "Browse presets" });
    await browse.click();
    const dialog = page.getByRole("dialog", { name: "Function presets" });
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole("searchbox", { name: "Find a preset" });
    await expect(search).toBeFocused();
    await search.fill("Gaussian");
    await expect(dialog.getByRole("button", { name: /Gaussian bell/ })).toBeVisible();
    await expect(dialog.getByLabel("Selected preset preview")).toContainText("exp(-x^2/2)");
    await dialog.getByRole("button", { name: "Use preset" }).click();
    await expect(dialog).toBeHidden();
    await expect(browse).toBeFocused();
    await expect(form.getByLabel("Function expression", { exact: true })).toHaveValue("exp(-x^2/2)");
    await expect(form.locator("input").first()).toHaveValue("Gaussian");
    await browse.click();
    await dialog.getByRole("searchbox", { name: "Find a preset" }).fill("parabola");
    await dialog.getByRole("searchbox", { name: "Find a preset" }).press("Escape");
    await expect(dialog).toBeHidden();
    await expect(browse).toBeFocused();
    await expect(form.getByLabel("Function expression", { exact: true })).toHaveValue("exp(-x^2/2)");
    await expect(panel.getByText("No graph objects yet.", { exact: false })).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Implicit contour gallery groups a larger library and previews selected mathematics", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Implicit contour");
    const editor = graphEditor(page);
    await editor.getByRole("button", { name: "Browse presets" }).click();
    const gallery = page.getByRole("dialog", { name: "Implicit contour presets" });
    await expect(gallery.getByRole("heading", { name: /Algebraic curves/ })).toBeVisible();
    await expect(gallery.getByRole("heading", { name: /Transcendental contours/ })).toBeVisible();
    await expect(gallery.getByRole("heading", { name: /Scalar fields and critical points/ })).toBeVisible();
    await expect(gallery).toContainText("27 of 27 presets");
    const search = gallery.getByRole("searchbox", { name: "Find a preset" });
    await search.fill("Cassini");
    await expect(gallery).toContainText("2 of 27 presets");
    await gallery.getByRole("button", { name: /Cassini oval · two loops/ }).click();
    const detail = gallery.getByLabel("Selected preset preview");
    await expect(detail.getByRole("img", { name: "Cassini oval · two loops sampled contour preview" })).toBeVisible();
    await expect(detail.locator(".graph2d-implicit-preset-figure path")).toHaveAttribute("d", /[ML]/);
    await expect(detail).toContainText("Expected components");
    await expect(detail).toContainText("2 in the default viewport");
    await expect(detail).toContainText("Default viewport");
    await gallery.getByRole("button", { name: "Use preset" }).click();
    await expect(editor.getByLabel("Implicit expression")).toHaveValue("((x-1)^2+y^2)*((x+1)^2+y^2)-0.5");
    await editor.getByRole("button", { name: "Cancel" }).click();
  } finally { await closeSurfaceApp(app); }
});
