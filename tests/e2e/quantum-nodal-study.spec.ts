import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-404460538ac24288b4b1c0ee240551ee-nodal.qscene");

test("nodal ring retains producer phase and exact loop selection after restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-nodal-"));
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId("nodal-study-profile")).toContainText("Occupied-band linking-loop Berry phase: 3.141592653589793");
        await expect(page.getByTestId("nodal-study-profile")).toContainText("no drumhead-state");
        await page.getByRole("button", { name: "Inspect first sample of nodal-ring-samples" }).click();
        await expect(page.getByTestId("quantum-primitive-selection")).toContainText("kx: 1.00000 inverse length");
        await page.getByRole("button", { name: "Inspect first sample of linking-loop-samples" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("loop-upper-band");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("kx:");
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-nodal-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("nodal scene refuses changed loop energy on selection and subsequent open", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-nodal-")), source = join(root, "altered.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("nodal-study-profile")).toBeVisible();
      const file = join(source, "loop-upper-band.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first sample of linking-loop-samples" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("nodal-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-nodal-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
