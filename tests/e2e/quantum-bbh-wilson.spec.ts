import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
  "run-7f366d57030b42c88d1c4afa89e059fe-bbh-wilson.qscene");

test("BBH Wilson scene inspects producer samples and reopens after restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-bbh-wilson-"));
  const profile = join(root, "profile");
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId("bbh-study-profile")).toContainText("nested Wilson diagnostics");
        await expect(page.getByTestId("bbh-study-profile")).toContainText("Nested Wilson quadrupole: 0.5");
        await page.getByRole("button", { name: "Inspect first sample of wilson-x-negative" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("wilson-x-negative-centers");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("cycle");
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-bbh-wilson-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("BBH Wilson diagnostic refuses changed bytes at open and after selection", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-bbh-wilson-"));
  const source = join(root, "altered.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("bbh-study-profile")).toBeVisible();
      const file = join(source, "wilson-x-negative-centers.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first sample of wilson-x-negative" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile-retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("bbh-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-bbh-wilson-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
