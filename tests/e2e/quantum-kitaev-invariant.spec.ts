import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
  "run-75fb3f43371e40d58fc0eda2e8c14fa1-kitaev-invariant.qscene");

test("Kitaev bulk invariant inspects exact producer samples and reopens after restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-kitaev-invariant-"));
  const profile = join(root, "profile");
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId("kitaev-study-profile")).toContainText("bulk invariant diagnostics");
        await expect(page.getByTestId("kitaev-study-profile")).toContainText("Bulk Pfaffian parity: 1");
        await expect(page.getByTestId("kitaev-study-profile")).toContainText("Real-pairing chiral winding: 1");
        await page.getByRole("button", { name: "Inspect first sample of kitaev-bdg-curve" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("momentum-samples");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("rad / cell spacing");
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-kitaev-invariant-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("Kitaev invariant refuses changed bytes on open and after selection", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-kitaev-invariant-"));
  const source = join(root, "altered.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("kitaev-study-profile")).toBeVisible();
      const file = join(source, "bdg-chiral-curve.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first sample of kitaev-bdg-curve" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile-retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("kitaev-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-kitaev-invariant-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
