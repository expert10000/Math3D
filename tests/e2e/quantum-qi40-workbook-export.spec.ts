import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("workbook session export serializes the current committed payload", async () => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi40-export-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await page.evaluate(() => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob) (window as unknown as { __qi40ExportBlob?: Blob }).__qi40ExportBlob = blob;
        return original(blob);
      };
    });
    await page.getByRole("button", { name: "Palette", exact: true }).click({ force: true });
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Export session bundle");
    await page.getByRole("button", { name: "Export session bundle (.math3d)", exact: true }).click();
    const exported = await page.evaluate(async () => {
      const blob = (window as unknown as { __qi40ExportBlob?: Blob }).__qi40ExportBlob;
      return blob?.text();
    });
    expect(exported).toBeTruthy();
    const bundle = JSON.parse(exported!);
    expect(bundle.format).toBe("math3d-project");
    expect(bundle.payload.workbooks.length).toBeGreaterThan(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi40-export-")) throw new Error("Unsafe QI-40 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
