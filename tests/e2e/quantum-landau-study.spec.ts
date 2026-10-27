import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-6758e75a58594f6d98ee98e7c9ac5e03-landau.qscene");

test("Landau level fan reopens with exact signed-field and energy inspection", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-landau-"));
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId("landau-study-profile")).toContainText("Landau · verified continuum level fan");
        await expect(page.getByTestId("landau-study-profile")).toContainText("Hall conductivity");
        await page.getByRole("button", { name: "Inspect first sample of level-3-samples" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("signed B: 0.50000000 normalized magnetic field");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("level index n: 3.0000000 categorical index");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("Value: 1.750000000 normalized energy");
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-landau-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("Landau level fan refuses altered source on selection and restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-landau-")), source = join(root, "altered.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("landau-study-profile")).toBeVisible();
      const file = join(source, "level-3-energy.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first sample of level-3-samples" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("landau-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-landau-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
