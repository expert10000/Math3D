import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("desktop Sage polynomial factor handles valid input, rejection, and cancellation", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."],
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Operation").selectOption("sage.polynomial.factor");
    const coefficients = panel.getByLabel("Integer coefficients (constant first)");

    await coefficients.fill("1, invalid, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Enter 2–13 integer coefficients");
    await expect(panel.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    await coefficients.fill("-1, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("(x - 1) * (x + 1)");

    await coefficients.fill("-2, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("Sage factorization cancelled.", { timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    await expect(panel).not.toContainText("Exact reconstruction: verified");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Sage algebraic roots handles valid input, rejection, and cancellation", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."],
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Operation").selectOption("sage.polynomial.roots_exact");
    const coefficients = panel.getByLabel("Integer coefficients (constant first)");

    await coefficients.fill("1, invalid, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Enter 2–13 integer coefficients");
    await expect(panel.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    const nativeRejection = await page.evaluate(async () => {
      try {
        await window.sageService?.run({ operation: "sage.polynomial.roots_exact", params: { coefficients: ["1", "0"] } });
        return "accepted";
      } catch (error) {
        return String(error);
      }
    });
    expect(nativeRejection).toContain("Enter 2–13 integer coefficients");

    await coefficients.fill("-2, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("Algebraic roots (2 counting multiplicity)");
    await expect(panel).toContainText("Minimal polynomial (constant first): -2, 0, 1");
    await expect(panel).toContainText("Isolating interval:");

    await coefficients.fill("1, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Running..." })).toBeVisible();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("Minimal polynomial (constant first): 1, 0, 1");
    await expect(panel).toContainText("-1*I");
    await expect(panel).toContainText("1*I");

    await coefficients.fill("1, -2, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Running..." })).toBeVisible();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("multiplicity 2");

    await coefficients.fill("3, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("Sage root calculation cancelled.", { timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    await expect(panel).not.toContainText("Exact reconstruction: verified");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
