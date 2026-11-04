import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import { graphEditor, openGraphType } from "./helpers/graphAuthoring";

test("Graph preview keeps a valid viewport for nearly constant expressions", async () => {
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-constant-preview-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root } });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    const editor = graphEditor(page);
    await editor.getByLabel("Start from preset").selectOption("parabola");
    await editor.getByLabel("Function expression").fill("sin(x)^2 + cos(x)^2");
    await editor.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(editor.getByLabel("Plotted graph preview")).toBeVisible();
    await expect(editor.getByLabel("Preview diagnostics")).toContainText("ExpressionValid");
    await editor.getByRole("button", { name: "Create graph", exact: true }).click();
    await expect(page.getByLabel("Graph functions")).toContainText("Parabola");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
